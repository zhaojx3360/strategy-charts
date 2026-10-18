import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { VALUE_FIELDS, OUTLINE_CHECKS } from './public/creative-standards.js';

const runFile = promisify(execFile);
const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg' };
const STAGES = [{ id: 1, name: '想法与选题' }, { id: 2, name: '口播提纲' }, { id: 3, name: '录制与素材' }, { id: 4, name: '粗剪审核' }, { id: 5, name: '精剪审核' }, { id: 6, name: '发布定稿' }];
const now = () => new Date().toISOString();
const id = () => randomUUID();
const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);
const planningDefaults = () => ({ ideas: '', audience: '', duration: '3—5 分钟', ideasRevision: 0, topics: [], topicsIdeasRevision: null, topicRevision: 0, selectedTopicId: null, topicConfirmedAt: null, outlineHistory: [], outline: { text: '', revision: 0, status: 'draft', note: '', topicId: null, topicRevision: null, checklist: {} }, recording: { notes: '', checklist: {} } });
const outlineChecks = value => Object.fromEntries(Object.keys(OUTLINE_CHECKS).map(key => [key, value?.[key] === true]));
function planningIn(project) {
  const defaults = planningDefaults();
  project.planning = { ...defaults, ...project.planning, outline: { ...defaults.outline, ...project.planning?.outline }, recording: { ...defaults.recording, ...project.planning?.recording } };
  return project.planning;
}
const topicReady = p => Boolean(p.selectedTopicId && p.topicsIdeasRevision === p.ideasRevision && p.topics.some(t => t.id === p.selectedTopicId));
const outlineReady = p => topicReady(p) && p.outline.topicId === p.selectedTopicId && p.outline.topicRevision === p.topicRevision;

export function createWorkbench({ dataDir = process.env.REVIEW_DATA_DIR || 'C:/disk/self-space/self-media/审片台', port = Number(process.env.PORT || 4317) } = {}) {
  dataDir = path.resolve(dataDir);
  const mediaDir = path.join(dataDir, 'media');
  const stateFile = path.join(dataDir, 'workspace.json');
  fs.mkdirSync(mediaDir, { recursive: true });
  const empty = () => ({ schemaVersion: 1, revision: 0, updatedAt: now(), projects: [] });
  if (!fs.existsSync(stateFile)) fs.writeFileSync(stateFile, JSON.stringify(empty(), null, 2), 'utf8');
  function read() { return JSON.parse(fs.readFileSync(stateFile, 'utf8').replace(/^\uFEFF/, '')); }
  function save(state) {
    state.revision = Number(state.revision || 0) + 1;
    state.updatedAt = now();
    const temp = `${stateFile}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
    fs.copyFileSync(stateFile, `${stateFile}.bak`);
    fs.renameSync(temp, stateFile);
  }
  function change(fn) { const state = read(); const result = fn(state); save(state); return result; }
  function projectIn(state, projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) throw fail(404, '找不到这份作品，请刷新后重试。');
    return project;
  }
  function versionIn(project, versionId) {
    const version = project.versions.find(v => v.id === versionId);
    if (!version) throw fail(404, '找不到这个视频版本。');
    return version;
  }
  function publicState(state) {
    return { ...state, stages: STAGES, dataDir, projects: state.projects.map(p => ({ ...p, planning: planningIn(p), versions: p.versions.map(v => ({ ...v, available: fs.existsSync(v.filePath), url: `/media/${v.id}`, posterUrl: v.posterPath && fs.existsSync(v.posterPath) ? `/poster/${v.id}` : null })) })) };
  }
  function record(project, action, version, detail) {
    project.updatedAt = now();
    project.history.unshift({ id: id(), at: now(), action, versionId: version?.id || null, stage: version?.stage || null, detail });
  }
  async function jsonBody(req) {
    if (!String(req.headers['content-type']).startsWith('application/json')) throw fail(415, '需要 JSON 请求。');
    const chunks = []; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024 * 1024) throw fail(413, '文字内容过长。'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw fail(400, '请求格式不正确。'); }
  }
  async function probe(filePath, versionId) {
    let info = {};
    try {
      const { stdout } = await runFile(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', filePath], { timeout: 20000, windowsHide: true });
      const parsed = JSON.parse(stdout);
      const video = parsed.streams?.find(s => s.codec_type === 'video');
      if (!video) throw fail(400, '这个文件没有可用的视频轨道。');
      info = { duration: Number(parsed.format?.duration || 0), width: video.width, height: video.height };
    } catch (error) {
      if (error.status) throw error;
      if (error.code !== 'ENOENT') throw fail(400, '视频无法读取，请检查文件是否完整，建议使用 MP4（H.264）格式。');
    }
    const posterPath = path.join(mediaDir, `${versionId}.jpg`);
    try {
      await runFile(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.min(1, (info.duration || 0) / 2)), '-i', filePath, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', posterPath], { timeout: 20000, windowsHide: true });
      info.posterPath = posterPath;
    } catch { /* Preview can use the first video frame when ffmpeg is unavailable. */ }
    return info;
  }
  async function addVersion(projectId, options) {
    const stage = Number(options.stage);
    if (stage < 3 || !STAGES.some(s => s.id === stage)) throw fail(400, '请选择素材、粗剪、精剪或定稿阶段。');
    const filePath = fs.realpathSync(options.filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (!['.mp4', '.m4v', '.mov', '.webm'].includes(ext)) throw fail(400, '支持 MP4、MOV、M4V 和 WebM 视频。');
    if (!fs.statSync(filePath).isFile()) throw fail(400, '请选择一个视频文件。');
    const versionId = id();
    const info = await probe(filePath, versionId);
    return change(state => {
      const project = projectIn(state, projectId);
      const version = { id: versionId, label: clean(options.label) || `${STAGES.find(s => s.id === stage).name} v${project.versions.filter(v => v.stage === stage).length + 1}`, stage, filePath, originalName: clean(options.originalName || path.basename(filePath)), size: fs.statSync(filePath).size, createdAt: now(), review: { status: 'pending', note: '', at: null }, ...info };
      project.versions.push(version);
      record(project, 'version_added', version, `添加版本：${version.label}`);
      return version;
    });
  }
  function send(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }
  function streamFile(req, res, filePath, type) {
    if (!fs.existsSync(filePath)) throw fail(404, '文件已移动或不可用，请重新添加素材。');
    const size = fs.statSync(filePath).size;
    let start = 0, end = Math.max(0, size - 1), partial = false;
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!range || (!range[1] && !range[2])) throw fail(416, '不支持的播放范围。');
      if (!range[1]) start = Math.max(0, size - Number(range[2]));
      else { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
      if (start >= size || end < start || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return;
      }
      partial = true;
    }
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': Math.max(0, end - start + 1), 'Cache-Control': 'private, no-cache' };
    if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(partial ? 206 : 200, headers);
    if (req.method === 'HEAD' || size === 0) { res.end(); return; }
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { send(res, 403, { error: '此服务仅供本机访问。' }); return; }
    if (req.headers.origin && ![`http://${host}`, `http://127.0.0.1:${server.address()?.port}`, `http://localhost:${server.address()?.port}`].includes(req.headers.origin)) { send(res, 403, { error: '不接受其他网站发起的请求。' }); return; }
    const url = new URL(req.url, `http://${host}`);
    const parts = url.pathname.split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') { send(res, 200, { app: 'local-review-workbench', version: '1.2.0', dataDir }); return; }
      if (req.method === 'GET' && url.pathname === '/api/workspace') { send(res, 200, publicState(read())); return; }
      if (req.method === 'POST' && url.pathname === '/api/projects') {
        const body = await jsonBody(req);
        if (!clean(body.title)) throw fail(400, '请先写一个作品名称。');
        const project = change(state => {
          const p = { id: id(), title: clean(body.title, 100), brief: clean(body.brief, 3000), demo: false, createdAt: now(), updatedAt: now(), planning: planningDefaults(), versions: [], comments: [], history: [] };
          state.projects.unshift(p); return p;
        });
        send(res, 201, { project }); return;
      }
      if (parts[0] === 'api' && parts[1] === 'projects' && parts[2]) {
        const projectId = parts[2];
        projectIn(read(), projectId);
        if (req.method === 'PATCH' && parts[3] === 'planning') {
          const body = await jsonBody(req);
          const planning = change(state => {
            const project = projectIn(state, projectId), p = planningIn(project);
            const invalidateOutline = () => { if (p.outline.text) { p.outline.status = 'changes_requested'; p.outline.checklist = outlineChecks(); } };
            let detail;
            if (body.action === 'ideas') {
              const ideas = clean(body.ideas, 60000), audience = clean(body.audience, 300), duration = clean(body.duration, 100);
              if (!ideas) throw fail(400, '先写下你想说的内容。');
              if (ideas !== p.ideas || audience !== p.audience || duration !== p.duration) {
                p.ideas = ideas; p.audience = audience; p.duration = duration; p.ideasRevision++;
                p.selectedTopicId = null; p.topicConfirmedAt = null; invalidateOutline();
              }
              detail = `保存自由想法，第 ${p.ideasRevision} 版`;
            } else if (body.action === 'topics') {
              if (!p.ideas || body.ideasRevision !== p.ideasRevision) throw fail(409, '想法版本已经变化，请按最新素材重新整理选题。');
              if (!Array.isArray(body.topics) || body.topics.length !== 3) throw fail(400, '请提供三个有区别的选题方向。');
              const fields = ['title', 'premise', 'conflict', 'viewpoint', 'reasons', 'missing'];
              const topics = body.topics.map((t, index) => {
                if (!t || fields.some(k => typeof t[k] !== 'string' || !t[k].trim())) throw fail(400, '每个选题需要标题、主旨、矛盾、观点、理由和待补充内容。没有待补充内容可写“暂无”。');
                if (VALUE_FIELDS.some(([key]) => t[key] !== undefined && typeof t[key] !== 'string')) throw fail(400, '观众价值与真实切入点请使用文字填写。');
                return { id: id(), ...Object.fromEntries(fields.map(k => [k, clean(t[k], k === 'title' ? 200 : 3000)])), ...Object.fromEntries(VALUE_FIELDS.map(([key]) => [key, clean(t[key], 3000)])), recommended: t.recommended === true, number: index + 1 };
              });
              if (new Set(topics.map(t => t.title)).size !== 3) throw fail(400, '三个选题不能使用相同标题。');
              p.topics = topics; p.topicsIdeasRevision = p.ideasRevision; p.topicRevision++;
              p.selectedTopicId = null; p.topicConfirmedAt = null; invalidateOutline(); detail = '保存三个选题，等待选择';
            } else if (body.action === 'topic-values') {
              if (p.topicsIdeasRevision !== p.ideasRevision || body.topicRevision !== p.topicRevision) throw fail(409, '选题版本已变化，请刷新后再补充。');
              const topic = p.topics.find(t => t.id === body.topicId);
              if (!topic) throw fail(404, '找不到这个选题。');
              if (VALUE_FIELDS.some(([key]) => typeof body[key] !== 'string')) throw fail(400, '请用文字填写观众价值、真实切入点和观众关系。');
              const values = Object.fromEntries(VALUE_FIELDS.map(([key]) => [key, clean(body[key], 3000)]));
              if (VALUE_FIELDS.some(([key]) => values[key] !== (topic[key] || ''))) {
                const wasCurrent = outlineReady(p);
                Object.assign(topic, values); p.topicRevision++;
                if (topic.id === p.selectedTopicId) invalidateOutline();
                else if (wasCurrent) p.outline.topicRevision = p.topicRevision;
              }
              detail = `补充观众价值与真实切入点：${topic.title}`;
            } else if (body.action === 'select-topic') {
              if (p.topicsIdeasRevision !== p.ideasRevision || !p.topics.some(t => t.id === body.topicId)) throw fail(409, '请先按当前想法保存三个选题。');
              if (p.selectedTopicId !== body.topicId) { p.selectedTopicId = body.topicId; invalidateOutline(); }
              p.topicConfirmedAt = now(); detail = `确认选题：${p.topics.find(t => t.id === body.topicId).title}`;
            } else if (body.action === 'outline') {
              if (!topicReady(p) || body.topicId !== p.selectedTopicId || body.topicRevision !== p.topicRevision) throw fail(409, '选题已变化，请先确认当前选题，再保存对应提纲。');
              const text = clean(body.text, 60000); if (!text) throw fail(400, '提纲内容不能为空。');
              if (p.outline.text) p.outlineHistory.push({ ...p.outline });
              p.outline = { text, revision: p.outline.revision + 1, status: 'pending', note: '', topicId: p.selectedTopicId, topicRevision: p.topicRevision, checklist: outlineChecks(), updatedAt: now() };
              detail = `保存提纲 v${p.outline.revision}，等待审核`;
            } else if (body.action === 'outline-checklist') {
              if (!p.outline.text || !outlineReady(p) || body.outlineRevision !== p.outline.revision) throw fail(409, '提纲或选题已变化，请刷新并核对当前提纲。');
              p.outline.checklist = outlineChecks(body.checklist);
              detail = `保存提纲 v${p.outline.revision} 的内容自检`;
            } else if (body.action === 'outline-review') {
              if (!p.outline.text || !outlineReady(p)) throw fail(409, '这份提纲与当前选题不匹配，请重新保存提纲。');
              if (body.outlineRevision !== p.outline.revision) throw fail(409, '提纲版本已变化，请刷新后重新审核。');
              if (!['approved', 'changes_requested'].includes(body.status)) throw fail(400, '提纲审核状态不正确。');
              if (body.status === 'changes_requested' && !clean(body.note, 3000)) throw fail(400, '请写下提纲修改意见。');
              p.outline.status = body.status; p.outline.note = clean(body.note, 3000); p.outline.reviewedAt = now();
              if (body.checklist !== undefined) p.outline.checklist = outlineChecks(body.checklist);
              detail = `${body.status === 'approved' ? '通过' : '退回'}提纲 v${p.outline.revision}${p.outline.note ? '：' + p.outline.note : ''}`;
            } else if (body.action === 'recording') {
              const allowed = ['audio', 'framing', 'facts', 'materials'];
              p.recording = { notes: clean(body.notes, 10000), checklist: Object.fromEntries(allowed.map(k => [k, body.checklist?.[k] === true])), updatedAt: now() };
              detail = '保存录制备忘与准备情况';
            } else throw fail(400, '不支持的创作步骤。');
            record(project, 'planning_updated', null, detail);
            project.history[0].stage = body.action === 'recording' ? 3 : body.action.startsWith('outline') ? 2 : 1;
            return p;
          });
          send(res, 200, { planning }); return;
        }
        if (req.method === 'POST' && parts[3] === 'import-path') {
          const body = await jsonBody(req);
          if (!body.filePath || !fs.existsSync(body.filePath)) throw fail(400, '找不到该文件，请检查完整路径。');
          const version = await addVersion(projectId, body); send(res, 201, { version }); return;
        }
        if (req.method === 'POST' && parts[3] === 'upload') {
          if (req.headers['x-review-client'] !== 'workbench') throw fail(403, '请从审片台导入视频。');
          const originalName = clean(url.searchParams.get('fileName'), 240);
          const ext = path.extname(originalName).toLowerCase();
          if (!['.mp4', '.m4v', '.mov', '.webm'].includes(ext)) throw fail(400, '请选择 MP4、MOV、M4V 或 WebM 视频。');
          if (Number(req.headers['content-length']) > 20 * 1024 ** 3) throw fail(413, '文件超过 20 GB，请改用本机路径引用。');
          const filePath = path.join(mediaDir, `${id()}${ext}`);
          try {
            await pipeline(req, fs.createWriteStream(filePath, { flags: 'wx' }));
            const version = await addVersion(projectId, { filePath, originalName, stage: url.searchParams.get('stage'), label: url.searchParams.get('label') });
            send(res, 201, { version });
          } catch (error) { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); throw error; }
          return;
        }
        if (req.method === 'POST' && parts[3] === 'comments') {
          const body = await jsonBody(req);
          if (!clean(body.text, 3000)) throw fail(400, '请写下需要调整的内容。');
          const comment = change(state => {
            const project = projectIn(state, projectId); const version = versionIn(project, body.versionId);
            const start = Number(body.time); const end = body.end == null ? null : Number(body.end);
            if (!Number.isFinite(start) || start < 0 || (version.duration && start > version.duration + 0.1)) throw fail(400, '批注时间超出视频范围。');
            if (end !== null && (!Number.isFinite(end) || end <= start || (version.duration && end > version.duration + 0.1))) throw fail(400, '结束时间应晚于起点，且不能超出视频。');
            const item = { id: id(), versionId: version.id, time: start, end, text: clean(body.text, 3000), category: ['内容', '节奏', '字幕', '画面', '声音'].includes(body.category) ? body.category : '内容', resolved: false, createdAt: now(), updatedAt: now() };
            project.comments.push(item);
            if (version.review.status === 'approved') version.review = { status: 'changes_requested', note: '通过后新增了批注，请重新审核。', at: now() };
            record(project, 'comment_added', version, `新增批注：${item.text}`); return item;
          });
          send(res, 201, { comment }); return;
        }
        if (req.method === 'PATCH' && parts[3] === 'comments' && parts[4]) {
          const body = await jsonBody(req);
          const comment = change(state => {
            const project = projectIn(state, projectId); const item = project.comments.find(c => c.id === parts[4]);
            if (!item) throw fail(404, '批注不存在。');
            if (typeof body.resolved === 'boolean') item.resolved = body.resolved;
            if (body.text !== undefined) { if (!clean(body.text, 3000)) throw fail(400, '批注内容不能为空。'); item.text = clean(body.text, 3000); }
            item.updatedAt = now();
            const version = versionIn(project, item.versionId);
            if (!item.resolved && version.review.status === 'approved') version.review = { status: 'changes_requested', note: '有批注重新待处理，请重新审核。', at: now() };
            record(project, 'comment_updated', version, `${item.resolved ? '已处理' : '待处理'}：${item.text}`); return item;
          }); send(res, 200, { comment }); return;
        }
        if (req.method === 'POST' && parts[3] === 'review') {
          const body = await jsonBody(req);
          if (!['approved', 'changes_requested', 'pending'].includes(body.status)) throw fail(400, '审核状态不正确。');
          const review = change(state => {
            const project = projectIn(state, projectId); const version = versionIn(project, body.versionId);
            const remaining = project.comments.filter(c => c.versionId === version.id && !c.resolved).length;
            if (body.status === 'approved' && remaining) throw fail(409, `还有 ${remaining} 条待处理批注，请处理后再通过。`);
            if (body.status === 'changes_requested' && !clean(body.note, 2000) && !remaining) throw fail(400, '请写下修改说明，或先添加一条批注。');
            version.review = { status: body.status, note: clean(body.note, 2000), at: now() };
            record(project, 'stage_reviewed', version, `${body.status === 'approved' ? '通过审核' : body.status === 'pending' ? '重新审核' : '需要修改'}${body.note ? `：${clean(body.note, 2000)}` : ''}`);
            return version.review;
          }); send(res, 200, { review }); return;
        }
        if (req.method === 'GET' && parts[3] === 'export') {
          const project = projectIn(read(), projectId);
          const report = { exportedAt: now(), project, notice: '批注时间属于各自的 versionId；不得直接套用到其他剪辑版本。' };
          const format = url.searchParams.get('format') || 'json';
          let body = JSON.stringify(report, null, 2);
          if (format === 'md') {
            const stamp = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
            const p = planningIn(project), selected = p.topics.find(t => t.id === p.selectedTopicId);
            const valueSummary = selected ? VALUE_FIELDS.map(([key, label]) => `${label}：${selected[key] || '待补充'}`).join('\n\n') : '';
            const checks = Object.entries(OUTLINE_CHECKS).map(([key, label]) => `- [${p.outline.checklist?.[key] ? 'x' : ' '}] ${label}`).join('\n');
            body = `# ${project.title} 制作记录\n\n导出时间：${report.exportedAt}\n\n${report.notice}\n\n## 自由想法\n\n${p.ideas || '尚未填写'}\n\n## 已选方向\n\n${selected ? `${selected.title}\n\n主旨：${selected.premise}\n\n矛盾：${selected.conflict}\n\n观点：${selected.viewpoint}\n\n${valueSummary}` : '尚未确认'}\n\n## 口播提纲（${p.outline.status}）\n\n${p.outline.text || '尚未填写'}\n\n审核意见：${p.outline.note || '无'}\n\n### 内容自检\n\n${checks}\n\n## 录制备忘\n\n${p.recording.notes || '无'}\n\n`;
            for (const v of project.versions) {
              body += `## ${v.label}\n\n- 阶段：${STAGES.find(s => s.id === v.stage)?.name}\n- 原文件：${v.filePath}\n- 版本 ID：${v.id}\n- 审核：${v.review.status}\n- 说明：${v.review.note || '无'}\n\n`;
              const comments = project.comments.filter(c => c.versionId === v.id);
              body += comments.length ? comments.map(c => `- [${c.resolved ? 'x' : ' '}] ${stamp(c.time)}${c.end === null ? '' : `～${stamp(c.end)}`} · ${c.category}：${c.text}`).join('\n') + '\n\n' : '暂无批注。\n\n';
            }
          }
          res.writeHead(200, { 'Content-Type': format === 'md' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="review.${format === 'md' ? 'md' : 'json'}"; filename*=UTF-8''${encodeURIComponent(project.title + '-审片反馈.' + (format === 'md' ? 'md' : 'json'))}`, 'Cache-Control': 'no-store' }); res.end(body); return;
        }
      }
      if (['GET', 'HEAD'].includes(req.method) && ['media', 'poster'].includes(parts[0])) {
        const state = read(); const version = state.projects.flatMap(p => p.versions).find(v => v.id === parts[1]);
        if (!version) throw fail(404, '视频版本不存在。');
        const file = parts[0] === 'poster' ? version.posterPath : version.filePath;
        if (!file) throw fail(404, '暂无封面。');
        streamFile(req, res, file, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'); return;
      }
      if (req.method === 'GET' && ['/', '/index.html', '/app.js', '/planning.js', '/creative-standards.js', '/style.css', '/favicon.svg'].includes(url.pathname)) {
        const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'self'");
        streamFile(req, res, path.join(APP_ROOT, 'public', name), types[path.extname(name)]); return;
      }
      throw fail(404, '找不到这个页面或操作。');
    } catch (error) {
      if (!res.headersSent && !res.destroyed) send(res, error.status || 500, { error: error.status ? error.message : '保存未完成，请检查本地文件和服务后重试。' });
      if (!error.status) console.error(error.message);
    }
  });
  return { server, dataDir, stateFile, read, addVersion, listen: () => new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server.address()))) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createWorkbench();
  const address = await app.listen();
  console.log(`Local: http://127.0.0.1:${address.port}`);
  console.log(`Data: ${app.dataDir}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close(() => process.exit(0)));
}
