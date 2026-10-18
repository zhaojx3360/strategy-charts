import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkbench } from '../server.mjs';

test('local video review: import, playback, comments, reviews, persistence and export', async t => {
  const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.runtime');
  fs.mkdirSync(base, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(base, 'test-'));
  const app = createWorkbench({ dataDir, port: 0 });
  const address = await app.listen();
  const origin = `http://127.0.0.1:${address.port}`;
  const sample = path.resolve('C:/disk/self-space/self-media/审片台/media/demo-4.mp4');
  assert.ok(fs.existsSync(sample), 'Run scripts/create_demo.py before integration tests.');
  let projectId, version1, version2, note;
  async function request(route, method = 'GET', body, extra = {}) {
    const response = await fetch(origin + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  try {
    await t.test('creates a real Chinese project and imports a local video', async () => {
      const created = await request('/api/projects', 'POST', { title: '验收：中文审片项目', brief: '端到端验证' });
      assert.equal(created.status, 201); projectId = created.body.project.id;
      const imported = await request(`/api/projects/${projectId}/import-path`, 'POST', { filePath: sample, stage: 4, label: '粗剪 v1' });
      assert.equal(imported.status, 201); version1 = imported.body.version.id;
      assert.equal(imported.body.version.duration, 16);
      assert.equal(imported.body.version.review.status, 'pending');
    });
    await t.test('serves byte ranges and HEAD requests needed by seeking', async () => {
      const response = await fetch(`${origin}/media/${version1}`, { headers: { Range: 'bytes=0-63' } });
      assert.equal(response.status, 206);
      assert.match(response.headers.get('content-range'), /^bytes 0-63\//);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(sample).subarray(0, 64));
      const head = await fetch(`${origin}/media/${version1}`, { method: 'HEAD' });
      assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), fs.statSync(sample).size);
      const invalid = await fetch(`${origin}/media/${version1}`, { headers: { Range: 'bytes=999999999999-' } });
      assert.equal(invalid.status, 416);
    });
    await t.test('validates timestamp ranges without saving invalid comments', async () => {
      for (const times of [{ time: -1 }, { time: 99 }, { time: 4, end: 3 }, { time: 4, end: 99 }]) {
        const result = await request(`/api/projects/${projectId}/comments`, 'POST', { versionId: version1, text: '越界批注', ...times });
        assert.equal(result.status, 400);
      }
      const result = await request(`/api/projects/${projectId}/comments`, 'POST', { versionId: version1, time: 4.5, end: 7, category: '字幕', text: '中文验证：这句话需要修改，保留后半句。' });
      assert.equal(result.status, 201); note = result.body.comment.id;
      const persisted = JSON.parse(fs.readFileSync(app.stateFile, 'utf8'));
      assert.equal(persisted.projects[0].comments.length, 1);
      assert.equal(persisted.projects[0].comments[0].text, '中文验证：这句话需要修改，保留后半句。');
    });
    await t.test('keeps comments and approvals specific to their version', async () => {
      const result = await request(`/api/projects/${projectId}/import-path`, 'POST', { filePath: sample, stage: 4, label: '粗剪 v2' });
      assert.equal(result.status, 201); version2 = result.body.version.id;
      assert.equal(result.body.version.review.status, 'pending');
      const workspace = (await request('/api/workspace')).body;
      assert.equal(workspace.projects[0].comments[0].versionId, version1);
      const blocked = await request(`/api/projects/${projectId}/review`, 'POST', { versionId: version1, status: 'approved' });
      assert.equal(blocked.status, 409);
      assert.equal((await request(`/api/projects/${projectId}/comments/${note}`, 'PATCH', { resolved: true })).status, 200);
      assert.equal((await request(`/api/projects/${projectId}/review`, 'POST', { versionId: version1, status: 'approved', note: '本轮通过' })).status, 200);
      await request(`/api/projects/${projectId}/comments`, 'POST', { versionId: version1, time: 2, text: '通过后补充一条意见' });
      const current = (await request('/api/workspace')).body.projects[0];
      assert.equal(current.versions.find(v => v.id === version1).review.status, 'changes_requested');
      assert.equal(current.versions.find(v => v.id === version2).review.status, 'pending');
      assert.ok(current.history.some(h => h.action === 'stage_reviewed'));
    });
    await t.test('streams a file upload and preserves independent review state', async () => {
      const result = await fetch(`${origin}/api/projects/${projectId}/upload?stage=5&label=${encodeURIComponent('精剪 v1')}&fileName=${encodeURIComponent('本地上传.mp4')}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Review-Client': 'workbench' }, body: fs.readFileSync(sample) });
      assert.equal(result.status, 201);
      const version = (await result.json()).version;
      assert.ok(version.filePath.startsWith(path.join(dataDir, 'media')));
      assert.equal(version.review.status, 'pending');
      assert.deepEqual(fs.readFileSync(version.filePath), fs.readFileSync(sample));
    });
    await t.test('exports usable feedback with version IDs and source timecodes', async () => {
      const json = await request(`/api/projects/${projectId}/export?format=json`);
      assert.equal(json.body.project.title, '验收：中文审片项目');
      assert.equal(json.body.project.comments[0].versionId, version1);
      const markdown = await fetch(`${origin}/api/projects/${projectId}/export?format=md`);
      const text = await markdown.text();
      assert.match(text, /00:04\.50～00:07\.00/);
      assert.ok(text.includes('中文验证'));
      assert.ok(text.includes(version1));
    });
    await t.test('rejects cross-origin mutations and reloads records from disk', async () => {
      const result = await request('/api/projects', 'POST', { title: '不应创建' }, { Origin: 'https://example.org' });
      assert.equal(result.status, 403);
      const reopened = createWorkbench({ dataDir, port: 0 });
      const state = reopened.read();
      assert.equal(state.projects[0].title, '验收：中文审片项目');
      assert.equal(state.projects[0].versions.length, 3);
      assert.ok(state.projects[0].comments.length >= 2);
    });
    await t.test('preserves UTF-8 Chinese when a network chunk splits a character', async () => {
      const payload = Buffer.from(JSON.stringify({ title: '分块中文验证：不能乱码' }), 'utf8');
      const split = payload.indexOf(Buffer.from('分')) + 1;
      const result = await new Promise((resolve, reject) => {
        const req = httpRequest(`${origin}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
          const chunks = []; res.on('data', c => chunks.push(c));
          res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
        });
        req.on('error', reject); req.write(payload.subarray(0, split));
        setTimeout(() => req.end(payload.subarray(split)), 5);
      });
      assert.equal(result.status, 201);
      assert.equal(result.data.project.title, '分块中文验证：不能乱码');
    });
    await t.test('runs idea selection, outline review and recording without approving a video', async () => {
      const route = `/api/projects/${projectId}/planning`;
      const save = body => request(route, 'PATCH', body);
      const ideas = '我做了很多准备，却迟迟不敢开始。我想分享真实的创作经历。';
      const initial = await save({ action: 'ideas', ideas, audience: '准备开始创作的人', duration: '3 分钟' });
      assert.equal(initial.status, 200); assert.equal(initial.body.planning.ideasRevision, 1);
      const topics = ['准备越充分，为什么越不敢开始？', '第一条视频，需要完美吗？', '没有灵感的时候，我怎么找到选题？'].map((title, i) => ({ title, premise: '主旨' + i, conflict: '想开始，却担心做不好', viewpoint: '先用小作品验证', reasons: '源于真实经历，推荐先讲清一件事', missing: '补充一次具体经历', recommended: i === 0 }));
      assert.equal((await save({ action: 'topics', ideasRevision: 0, topics })).status, 409);
      assert.equal((await save({ action: 'topics', ideasRevision: 1, topics: topics.slice(0, 2) })).status, 400);
      const imported = await save({ action: 'topics', ideasRevision: 1, topics });
      assert.equal(imported.status, 200);
      const p = imported.body.planning, topicId = p.topics[0].id, topicRevision = p.topicRevision;
      assert.equal((await save({ action: 'outline', text: '尚未选择，不应保存' })).status, 409);
      assert.equal((await save({ action: 'select-topic', topicId })).status, 200);
      const outline = await save({ action: 'outline', topicId, topicRevision, text: '开头：我原以为准备好就会开始。\n理由：一次真实经历。\n结尾：先做一个小作品。' });
      assert.equal(outline.body.planning.outline.status, 'pending');
      assert.equal((await save({ action: 'outline-review', outlineRevision: 0, status: 'approved' })).status, 409);
      assert.equal((await save({ action: 'outline-review', outlineRevision: 1, status: 'changes_requested' })).status, 400);
      assert.equal((await save({ action: 'outline-review', outlineRevision: 1, status: 'changes_requested', note: '开头再直接一点' })).status, 200);
      assert.equal((await save({ action: 'outline-review', outlineRevision: 1, status: 'approved' })).status, 200);
      const changed = await save({ action: 'outline', topicId, topicRevision, text: '修订提纲：先给矛盾，再解释经历。' });
      assert.equal(changed.body.planning.outline.status, 'pending');
      assert.equal(changed.body.planning.outlineHistory[0].status, 'approved');
      assert.equal((await save({ action: 'outline-review', outlineRevision: 2, status: 'approved', note: '可以录制' })).status, 200);
      const recording = await save({ action: 'recording', notes: '第二段有重录，保留后一次。', checklist: { audio: true, framing: true, unknown: true } });
      assert.equal(recording.body.planning.recording.checklist.audio, true);
      assert.equal(recording.body.planning.recording.checklist.unknown, undefined);
      const stored = createWorkbench({ dataDir, port: 0 }).read().projects.find(p => p.id === projectId);
      assert.equal(stored.planning.outline.status, 'approved');
      assert.equal(stored.planning.recording.notes, '第二段有重录，保留后一次。');
      assert.equal(stored.versions.find(v => v.id === version2).review.status, 'pending');
      const md = await (await fetch(`${origin}/api/projects/${projectId}/export?format=md`)).text();
      assert.ok(md.includes(topics[0].title)); assert.ok(md.includes('修订提纲'));
      assert.equal((await save({ action: 'select-topic', topicId: p.topics[1].id })).status, 200);
      assert.equal((await save({ action: 'outline-review', outlineRevision: 2, status: 'approved' })).status, 409);
      const revisedIdeas = await save({ action: 'ideas', ideas: ideas + ' 新增了一段经历。', audience: '', duration: '5 分钟' });
      assert.equal(revisedIdeas.body.planning.selectedTopicId, null);
      assert.equal((await save({ action: 'topics', ideasRevision: 1, topics })).status, 409);
      assert.equal((await save({ action: 'select-topic', topicId })).status, 409);
      assert.equal((await request(`/api/projects/${projectId}/import-path`, 'POST', { filePath: sample, stage: 1 })).status, 400);
    });
    await t.test('persists audience value, guards edits and keeps content checks tied to the outline', async () => {
      const created = await request('/api/projects', 'POST', { title: '观众价值验收' });
      const pid = created.body.project.id, route = `/api/projects/${pid}/planning`;
      const save = body => request(route, 'PATCH', body);
      await save({ action: 'ideas', ideas: '想开始创作，却总觉得准备不够。', audience: '准备开始的人', duration: '3 分钟' });
      const topics = ['为什么准备越多越难开始', '第一条视频可以不完美', '没有灵感怎么记录生活'].map(title => ({ title, premise: '让相似处境的人看见一个具体问题', conflict: '想开始，却怕出糗', viewpoint: '先记录真实处境', reasons: '素材里有具体矛盾', missing: '补一次真实经历', audienceValue: '让观众少一点因准备不足而产生的自责', authenticEntry: '待补充：一次犹豫着没有发布的经历', audienceConnection: '观众也可能总觉得还没有准备好' }));
      assert.equal((await save({ action: 'topics', ideasRevision: 1, topics: topics.map((v, i) => i ? v : { ...v, audienceValue: 3 }) })).status, 400);
      let p = (await save({ action: 'topics', ideasRevision: 1, topics })).body.planning;
      assert.equal(p.topics[0].audienceValue, topics[0].audienceValue);
      assert.equal(p.topics[0].authenticEntry, topics[0].authenticEntry);
      const selected = p.topics[0], other = p.topics[1];
      await save({ action: 'select-topic', topicId: selected.id });
      await save({ action: 'outline', topicId: selected.id, topicRevision: 1, text: '从一次犹豫说起，让观众看见自己的处境。' });
      const checklist = { audienceValue: true, authenticity: true, progression: false, takeaway: true, unknown: true };
      p = (await save({ action: 'outline-checklist', outlineRevision: 1, checklist })).body.planning;
      assert.equal(p.outline.status, 'pending');
      assert.equal(p.outline.checklist.authenticity, true); assert.equal(p.outline.checklist.unknown, undefined);
      await save({ action: 'outline-review', outlineRevision: 1, status: 'approved', checklist });
      p = (await save({ action: 'outline', topicId: selected.id, topicRevision: 1, text: '修订：保留真实纠结，增加一个能带走的观察。' })).body.planning;
      assert.equal(p.outline.checklist.authenticity, false);
      assert.equal(p.outlineHistory[0].checklist.authenticity, true);
      await save({ action: 'outline-review', outlineRevision: 2, status: 'approved', checklist });
      const otherValues = { action: 'topic-values', topicId: other.id, topicRevision: 1, audienceValue: '接受第一条作品有不足', authenticEntry: '本期可以不自曝，先讲具体处境', audienceConnection: '给总想做到完美的人一个参照' };
      p = (await save(otherValues)).body.planning;
      assert.equal(p.topicRevision, 2); assert.equal(p.outline.status, 'approved'); assert.equal(p.outline.topicRevision, 2);
      assert.equal(p.outline.checklist.authenticity, true);
      assert.equal((await save(otherValues)).status, 409);
      assert.equal((await save({ ...otherValues, topicRevision: 2 })).body.planning.topicRevision, 2);
      assert.equal((await save({ ...otherValues, topicRevision: 2, authenticEntry: {} })).status, 400);
      p = (await save({ ...otherValues, topicId: selected.id, topicRevision: 2, audienceValue: '提供一个有来由的笑点' })).body.planning;
      assert.equal(p.topicRevision, 3); assert.equal(p.outline.status, 'changes_requested'); assert.equal(p.outline.checklist.authenticity, false);
      assert.equal((await save({ action: 'outline-review', outlineRevision: 2, status: 'approved' })).status, 409);
      await save({ action: 'outline', topicId: selected.id, topicRevision: 3, text: '重新核对这份提纲的观众价值。' });
      assert.equal((await save({ action: 'outline-checklist', outlineRevision: 2, checklist })).status, 409);
      await save({ action: 'outline-checklist', outlineRevision: 3, checklist });
      const reopened = createWorkbench({ dataDir, port: 0 }).read().projects.find(p => p.id === pid);
      assert.equal(reopened.planning.topics[0].audienceValue, '提供一个有来由的笑点');
      assert.equal(reopened.planning.outline.checklist.takeaway, true);
      const md = await (await fetch(`${origin}/api/projects/${pid}/export?format=md`)).text();
      assert.ok(md.includes('观众能获得什么：提供一个有来由的笑点'));
      assert.ok(md.includes('真实经历切入点：本期可以不自曝'));
      assert.ok(md.includes('[x] 结尾回应观众所得'));
    });
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    const resolved = path.resolve(dataDir);
    assert.ok(resolved.startsWith(base + path.sep) && path.basename(resolved).startsWith('test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
