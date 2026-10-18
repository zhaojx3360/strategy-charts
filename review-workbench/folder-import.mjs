import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const formats = new Set(['.mp4', '.m4v', '.mov', '.webm']);
const error = (status, message) => Object.assign(new Error(message), { status });
export const pathKey = file => (process.platform === 'win32' ? file.toLowerCase() : file);
export const fingerprint = stat => `${stat.size}:${stat.mtimeMs}:${stat.birthtimeMs}`;
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };

// Missing offsets are explicitly interpreted as China time; never use the host's timezone.
export function captureTime(parsed, stat) {
  const video = parsed.streams?.find(s => s.codec_type === 'video');
  const candidates = [
    [parsed.format?.tags?.['com.apple.quicktime.creationdate'], 'QuickTime 拍摄日期'],
    [video?.tags?.['com.apple.quicktime.creationdate'], '视频轨拍摄日期'],
    [parsed.format?.tags?.creation_time, '容器创建时间'],
    [video?.tags?.creation_time, '视频轨创建时间']
  ];
  for (const [raw, label] of candidates) {
    if (typeof raw !== 'string') continue;
    let value = raw.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/i.test(value)) continue;
    const timezoneAssumed = !/(Z|[+-]\d{2}:\d{2})$/i.test(value);
    if (timezoneAssumed) value += '+08:00';
    const ms = Date.parse(value);
    if (!Number.isFinite(ms) || ms < Date.UTC(1970, 0, 1) || ms > Date.now() + 86400000) continue;
    return { capturedAt: new Date(ms).toISOString(), sortAt: new Date(ms).toISOString(), timeSource: 'metadata', timeLabel: label, rawTime: raw, timezoneAssumed };
  }
  return { capturedAt: null, sortAt: stat.mtime.toISOString(), timeSource: 'modified', timeLabel: '文件修改时间（备用）', rawTime: null, timezoneAssumed: false };
}

export function createFolderImporter({ readProject, addVersion }) {
  const scans = new Map();
  const expiry = 60 * 60 * 1000;
  function get(projectId, scanId) {
    const scan = scans.get(scanId);
    if (!scan || scan.projectId !== projectId || Date.now() - scan.touched > expiry) throw error(410, '扫描清单已过期或服务已重启，请重新扫描文件夹。');
    scan.touched = Date.now(); return scan;
  }
  function duplicate(projectId, filePath) {
    return readProject(projectId).versions.find(v => v.stage === 3 && pathKey(v.filePath) === pathKey(filePath));
  }
  function view(scan) {
    const existing = new Set(readProject(scan.projectId).versions.filter(v => v.stage === 3).map(v => pathKey(v.filePath)));
    return { ...scan, entries: scan.entries.map(({ fingerprint: ignored, ...entry }) => ({ ...entry, duplicate: existing.has(pathKey(entry.filePath)) })) };
  }
  async function scanFolder(scan) {
    try {
      const files = []; let visited = 0;
      async function walk(dir) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        entries.sort((a,b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
        for (const entry of entries) {
          if (scan.cancelled) return;
          if (++visited > 20000) throw error(400, '目录内容过多，请选择更具体的素材文件夹后重试。');
          const file = path.join(dir, entry.name);
          if (entry.isSymbolicLink()) { scan.skippedLinks++; continue; }
          if (entry.isDirectory()) {
            if (scan.includeSubfolders) {
              try { await walk(file); } catch (e) { if (e.status) throw e; scan.warnings.push(`无法读取子文件夹：${path.relative(scan.folderPath, file)}`); }
            }
          } else if (entry.isFile() && formats.has(path.extname(entry.name).toLowerCase())) {
            files.push(file);
            if (files.length > 2000) throw error(400, '单次最多扫描 2000 个视频，请分文件夹导入。');
          } else scan.ignoredFiles++;
        }
      }
      await walk(scan.folderPath); scan.total = files.length;
      for (const file of files) {
        if (scan.cancelled) { scan.status = 'cancelled'; return; }
        const entry = { id: randomUUID(), filePath: file, name: path.basename(file), relativePath: path.relative(scan.folderPath, file) };
        try {
          const resolved = await fs.promises.realpath(file);
          if (!inside(scan.folderPath, resolved)) throw error(400, '路径指向所选文件夹之外，请检查链接。');
          entry.filePath = resolved;
          const stat = await fs.promises.stat(resolved);
          entry.size = stat.size; entry.fingerprint = fingerprint(stat);
          let parsed = {}, warning = '';
          try {
            const result = await run(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration:format_tags:stream=codec_type:stream_tags', '-of', 'json', resolved], { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 });
            parsed = JSON.parse(result.stdout);
            if (!parsed.streams?.some(s => s.codec_type === 'video')) throw error(400, '没有可用的视频轨道');
          } catch (e) {
            if (e.code === 'ENOENT') warning = '未安装 ffprobe，拍摄时间和视频轨道未核验';
            else throw error(400, '无法读取视频，请检查文件是否完整或正被写入');
          }
          Object.assign(entry, captureTime(parsed, stat), { duration: Number(parsed.format?.duration || 0), warning });
          if (fingerprint(await fs.promises.stat(resolved)) !== entry.fingerprint) throw error(409, '扫描期间文件发生变化，请录制完成后重新扫描');
        } catch (e) { entry.error = e.status ? e.message : '文件已移动、不可访问或正在使用，请检查后重新扫描'; }
        scan.entries.push(entry); scan.processed++;
      }
      scan.entries.sort((a,b) => (a.error ? 1 : 0) - (b.error ? 1 : 0) || (Date.parse(a.sortAt) || 0) - (Date.parse(b.sortAt) || 0) || a.relativePath.localeCompare(b.relativePath, 'zh-CN', { numeric: true }));
      scan.entries.forEach((entry, i) => { entry.order = i + 1; });
      scan.status = scan.cancelled ? 'cancelled' : 'ready';
    } catch (e) { scan.status = 'failed'; scan.error = e.status ? e.message : '无法读取这个文件夹，请检查路径与访问权限。'; }
  }
  return {
    start(projectId, options) {
      const input = String(options.folderPath || '').trim().replace(/^"|"$/g, '');
      if (!input || !path.isAbsolute(input)) throw error(400, '请输入这台电脑上的完整文件夹路径。');
      let folderPath;
      try { folderPath = fs.realpathSync(input); if (!fs.statSync(folderPath).isDirectory()) throw new Error(); }
      catch { throw error(400, '找不到这个文件夹，请检查路径与访问权限。'); }
      for (const [key, s] of scans) if (Date.now() - s.touched > expiry) scans.delete(key);
      if ([...scans.values()].filter(s => s.status === 'scanning').length >= 2) throw error(429, '已有文件夹正在扫描，请等它完成。');
      if (scans.size >= 12) { const oldest = [...scans.values()].find(s => s.status !== 'scanning'); if (oldest) scans.delete(oldest.id); }
      const scan = { id: randomUUID(), projectId, folderPath, includeSubfolders: options.includeSubfolders === true, status: 'scanning', entries: [], processed: 0, total: 0, ignoredFiles: 0, skippedLinks: 0, warnings: [], touched: Date.now() };
      scans.set(scan.id, scan); void scanFolder(scan); return { id: scan.id, status: scan.status };
    },
    status(projectId, scanId) { return view(get(projectId, scanId)); },
    cancel(projectId, scanId) { const scan = get(projectId, scanId); scan.cancelled = true; return { cancelled: true }; },
    async importEntry(projectId, options) {
      const scan = get(projectId, options.scanId);
      if (scan.status !== 'ready') throw error(409, '扫描尚未完成，请等待清单生成。');
      const entry = scan.entries.find(e => e.id === options.entryId);
      if (!entry || entry.error) throw error(400, entry?.error || '文件不在本次扫描清单中。');
      const existing = duplicate(projectId, entry.filePath);
      if (existing) return { skipped: true, version: existing };
      try {
        if (pathKey(await fs.promises.realpath(entry.filePath)) !== pathKey(entry.filePath) || !inside(scan.folderPath, entry.filePath) || fingerprint(await fs.promises.stat(entry.filePath)) !== entry.fingerprint) throw new Error();
      } catch { throw error(409, '文件已移动或改变，请重新扫描后导入。'); }
      const material = { batchId: scan.id, folderPath: scan.folderPath, relativePath: entry.relativePath, order: entry.order, capturedAt: entry.capturedAt, sortAt: entry.sortAt, timeSource: entry.timeSource, timeLabel: entry.timeLabel, rawTime: entry.rawTime, timezoneAssumed: entry.timezoneAssumed };
      const result = await addVersion(projectId, { stage: 3, filePath: entry.filePath, label: `素材 ${String(entry.order).padStart(3, '0')} · ${entry.name}`, material, expectedFingerprint: entry.fingerprint, deduplicate: true });
      return result;
    }
  };
}
