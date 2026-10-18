import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createWorkbench } from '../server.mjs';
import { captureTime } from '../folder-import.mjs';
import { videoOrder } from '../public/folder-import.js';
import { makeFootage } from './folder-fixtures.mjs';

test('capture dates: offsets, invalid dates and explicit fallback', () => {
  const stat = { mtime: new Date('2026-10-17T02:30:00Z') };
  const result = captureTime({ format: { tags: { 'com.apple.quicktime.creationdate': '2026-10-17T09:00:00+0800', creation_time: '2026-10-17T08:00:00Z' } } }, stat);
  assert.equal(result.capturedAt, '2026-10-17T01:00:00.000Z');
  assert.equal(result.timeLabel, 'QuickTime 拍摄日期');
  const local = captureTime({ streams: [{ codec_type: 'video', tags: { creation_time: '2026:10:17 09:00:00' } }] }, stat);
  assert.equal(local.capturedAt, result.capturedAt); assert.equal(local.timezoneAssumed, true);
  for (const value of ['0000-00-00T00:00:00Z','2099-01-01T00:00:00Z','invalid']) {
    const fallback = captureTime({ format: { tags: { creation_time: value } } }, stat);
    assert.equal(fallback.capturedAt, null); assert.equal(fallback.timeSource, 'modified'); assert.equal(fallback.sortAt, stat.mtime.toISOString());
  }
});

test('folder footage workflow: preview, capture order, deduplication, partial failures and persistence', async t => {
  const base = path.resolve('.runtime'); fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base,'folder-test-'));
  const footage = path.join(root,'原片'); await makeFootage(footage);
  const app = createWorkbench({ dataDir: path.join(root,'data'), port: 0 });
  const address = await app.listen(), origin = `http://127.0.0.1:${address.port}`;
  const request = async (route, method = 'GET', body) => { const response = await fetch(origin + route, { method, headers: body ? {'Content-Type':'application/json'} : {}, ...(body ? {body:JSON.stringify(body)} : {}) }); return { status: response.status, ...await response.json() }; };
  async function ready(pid, options) {
    const start = await request(`/api/projects/${pid}/folder-scan`, 'POST', options); assert.equal(start.status,202);
    for (let i=0;i<400;i++) {
      const result = await request(`/api/projects/${pid}/folder-scan/${start.scan.id}`);
      if(result.scan.status === 'ready') return result.scan;
      assert.notEqual(result.scan.status, 'failed', result.scan.error);
      await new Promise(resolve => setTimeout(resolve,25));
    }
    assert.fail('Scan did not finish');
  }
  let pid, scan;
  try {
    pid = (await request('/api/projects','POST',{title:'文件夹导入验收（演示）'})).project.id;
    await t.test('rejects missing, relative and non-directory paths', async () => {
      for(const folderPath of ['', 'relative/path', path.join(footage,'先录.mp4'), path.join(root,'missing')]) assert.equal((await request(`/api/projects/${pid}/folder-scan`,'POST',{folderPath})).status,400);
    });
    await t.test('scan is read-only; metadata ordering and fallback labels are explicit', async () => {
      scan = await ready(pid,{folderPath:footage});
      assert.equal(scan.entries.length,4); assert.equal(scan.ignoredFiles,1);
      assert.deepEqual(scan.entries.map(e=>e.name),['先录.mp4','后录.mp4','缺少拍摄时间.mp4','损坏的文件.mp4']);
      assert.equal(scan.entries[0].capturedAt,'2026-10-17T01:00:00.000Z');
      assert.equal(scan.entries[2].timeSource,'modified'); assert.equal(scan.entries[2].capturedAt,null);
      assert.ok(scan.entries[3].error); assert.ok(!('fingerprint' in scan.entries[0]));
      assert.equal(app.read().projects[0].versions.length,0);
      const other = (await request('/api/projects','POST',{title:'其他作品'})).project.id;
      assert.equal((await request(`/api/projects/${other}/folder-scan/${scan.id}`)).status,410);
    });
    await t.test('imports originals in capture order with media metadata and playback', async () => {
      for (const entry of scan.entries.filter(e=>!e.error)) {
        const result = await request(`/api/projects/${pid}/folder-import`,'POST',{scanId:scan.id,entryId:entry.id});
        assert.equal(result.status,201); assert.equal(result.version.stage,3); assert.equal(result.version.material.order,entry.order); assert.equal(result.version.filePath,entry.filePath); assert.equal(result.version.review.status,'pending');
        assert.equal((await fetch(`${origin}/media/${result.version.id}`,{headers:{Range:'bytes=0-15'}})).status,206);
      }
      const p = app.read().projects.find(p=>p.id===pid);
      assert.equal(p.versions.length,3); assert.deepEqual(videoOrder(p.versions).map(v=>v.originalName),scan.entries.slice(0,3).map(e=>e.name));
      const md = await (await fetch(`${origin}/api/projects/${pid}/export?format=md`)).text();
      assert.ok(md.includes('素材次序：1')); assert.ok(md.includes('文件修改时间（备用）'));
    });
    await t.test('repeat imports skip paths even under simultaneous retries', async () => {
      const before = app.read().projects.find(p=>p.id===pid).versions.length;
      const result = await request(`/api/projects/${pid}/folder-import`,'POST',{scanId:scan.id,entryId:scan.entries[0].id});
      assert.equal(result.status,200); assert.equal(result.skipped,true);
      const nested = await ready(pid,{folderPath:footage,includeSubfolders:true});
      assert.equal(nested.entries.length,5); assert.equal(nested.entries.filter(e=>e.duplicate).length,3);
      const fresh = nested.entries.find(e=>e.name==='补录片段.mp4');
      const results = await Promise.all([1,2].map(()=>request(`/api/projects/${pid}/folder-import`,'POST',{scanId:nested.id,entryId:fresh.id})));
      assert.equal(results.filter(r=>r.skipped).length,1);
      assert.equal(app.read().projects.find(p=>p.id===pid).versions.length,before+1);
    });
    await t.test('invalid entries, changed files and expired manifests cannot import', async () => {
      assert.equal((await request(`/api/projects/${pid}/folder-import`,'POST',{scanId:scan.id,entryId:scan.entries[3].id})).status,400);
      assert.equal((await request(`/api/projects/${pid}/folder-import`,'POST',{scanId:scan.id,entryId:'../escape'})).status,400);
      const p2 = (await request('/api/projects','POST',{title:'文件变化验收'})).project.id;
      const fresh = await ready(p2,{folderPath:footage});
      fs.appendFileSync(fresh.entries[0].filePath,'changed');
      assert.equal((await request(`/api/projects/${p2}/folder-import`,'POST',{scanId:fresh.id,entryId:fresh.entries[0].id})).status,409);
      assert.equal(app.read().projects.find(p=>p.id===p2).versions.length,0);
      const reopened = createWorkbench({dataDir:app.dataDir,port:0});
      assert.equal(reopened.read().projects.find(p=>p.id===pid).versions.length,4);
      assert.equal((await request(`/api/projects/${pid}/folder-import`,'POST',{scanId:'expired',entryId:scan.entries[1].id})).status,410);
    });
    await t.test('cancels scanning without changing project data', async () => {
      const started = await request(`/api/projects/${pid}/folder-scan`,'POST',{folderPath:footage});
      assert.equal((await request(`/api/projects/${pid}/folder-scan/${started.scan.id}`,'DELETE')).cancelled,true);
      assert.equal(app.read().projects.find(p=>p.id===pid).versions.length,4);
    });
  } finally {
    await new Promise(resolve=>app.server.close(resolve));
    assert.ok(root.startsWith(base+path.sep) && path.basename(root).startsWith('folder-test-'));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
