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
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    const resolved = path.resolve(dataDir);
    assert.ok(resolved.startsWith(base + path.sep) && path.basename(resolved).startsWith('test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
