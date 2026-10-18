import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createWorkbench } from '../server.mjs';
import { duplicateExtras } from '../public/video-manager.js';

test('duplicate selection keeps the first reference in each stage',()=>{
  assert.deepEqual([...duplicateExtras([
    {id:'keep',stage:3,filePath:'C:\\Clips\\One.mp4'},
    {id:'remove',stage:3,filePath:'c:/clips/one.mp4'},
    {id:'cut',stage:4,filePath:'c:/clips/one.mp4'},
    {id:'different-folder',stage:3,filePath:'c:/Other/One.mp4'}
  ])],['remove']);
});

test('removing videos preserves files, comments and review; restore survives restart', async t=>{
  const base=path.resolve('.runtime'); fs.mkdirSync(base,{recursive:true});
  const root=fs.mkdtempSync(path.join(base,'remove-test-'));
  const source=path.join(root,'原始素材.mp4'); fs.copyFileSync('C:/disk/self-space/self-media/审片台/media/demo-4.mp4',source);
  const originalBytes=fs.readFileSync(source);
  const app=createWorkbench({dataDir:path.join(root,'data'),port:0}); const address=await app.listen(),origin=`http://127.0.0.1:${address.port}`;
  async function request(route, method='GET', body) {
    const response=await fetch(origin+route,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,...await response.json()};
  }
  let pid,v1,v2,v3,note;
  const state=async()=> (await request('/api/workspace')).projects.find(p=>p.id===pid);
  try {
    pid=(await request('/api/projects','POST',{title:'移除与恢复验收（演示）'})).project.id;
    for(const [stage,label] of [[3,'保留的原片'],[3,'重复导入的原片'],[4,'独立粗剪']]) {
      const result=await request(`/api/projects/${pid}/import-path`,'POST',{stage,label,filePath:source});
      assert.equal(result.status,201); if(!v1)v1=result.version; else if(!v2)v2=result.version; else v3=result.version;
    }
    note=(await request(`/api/projects/${pid}/comments`,'POST',{versionId:v1.id,time:2,text:'保留这处自然停顿',category:'节奏'})).comment;
    await request(`/api/projects/${pid}/comments/${note.id}`,'PATCH',{resolved:true});
    await request(`/api/projects/${pid}/review`,'POST',{versionId:v1.id,status:'approved',note:'用户审核演示'});
    await t.test('batch validation is atomic and respects project ownership',async()=>{
      assert.equal((await request(`/api/projects/${pid}/versions/remove`,'POST',{versionIds:[]})).status,400);
      assert.equal((await request(`/api/projects/${pid}/versions/remove`,'POST',{versionIds:[v1.id,'missing']})).status,404);
      assert.equal((await state()).versions.length,3);
      const other=(await request('/api/projects','POST',{title:'其他作品'})).project.id;
      assert.equal((await request(`/api/projects/${other}/versions/${v1.id}`,'DELETE')).status,404);
    });
    await t.test('removes a playing version and hides its comments and media without deleting files',async()=>{
      assert.equal((await request(`/api/projects/${pid}/versions/${v1.id}`,'DELETE')).count,1);
      const current=await state(); assert.equal(current.versions.length,2); assert.equal(current.comments.length,0);
      assert.equal(current.removedVersions[0].commentCount,1); assert.equal(current.removedVersions[0].review.status,'approved');
      assert.equal((await fetch(origin+'/media/'+v1.id)).status,404);
      assert.equal((await fetch(origin+'/poster/'+v1.id)).status,404);
      assert.equal((await request(`/api/projects/${pid}/comments`,'POST',{versionId:v1.id,time:1,text:'不应写入移除版本'})).status,404);
      assert.equal((await request(`/api/projects/${pid}/comments/${note.id}`,'PATCH',{resolved:false})).status,404);
      assert.equal((await request(`/api/projects/${pid}/review`,'POST',{versionId:v1.id,status:'approved'})).status,404);
      assert.deepEqual(fs.readFileSync(source),originalBytes); assert.ok(fs.existsSync(v1.posterPath));
      assert.equal((await request(`/api/projects/${pid}/versions/${v1.id}`,'DELETE')).count,0);
      const exported=await request(`/api/projects/${pid}/export?format=json`);
      assert.ok(!exported.project.versions.some(v=>v.id===v1.id)); assert.ok(!exported.project.comments.length);
      const markdown=await (await fetch(`${origin}/api/projects/${pid}/export?format=md`)).text();
      assert.ok(!markdown.includes('## 保留的原片')); assert.ok(!markdown.includes('保留这处自然停顿'));
    });
    await t.test('restores the exact version, comments, resolved state and approval',async()=>{
      const result=await request(`/api/projects/${pid}/versions/restore`,'POST',{versionIds:[v1.id]}); assert.equal(result.count,1);
      const current=await state(); assert.equal(current.versions.length,3); assert.equal(current.removedVersions.length,0);
      assert.equal(current.comments[0].id,note.id); assert.equal(current.comments[0].resolved,true);
      assert.equal(current.versions.find(v=>v.id===v1.id).review.status,'approved');
      assert.equal((await fetch(origin+'/media/'+v1.id,{method:'HEAD'})).status,200);
    });
    await t.test('all videos can be removed; folder scan and import allow the removed path again',async()=>{
      assert.equal((await request(`/api/projects/${pid}/versions/remove`,'POST',{versionIds:[v1.id,v2.id,v3.id,v3.id]})).count,3);
      assert.equal((await state()).versions.length,0);
      const started=await request(`/api/projects/${pid}/folder-scan`,'POST',{folderPath:root}); let scan;
      for(let i=0;i<200;i++) {scan=(await request(`/api/projects/${pid}/folder-scan/${started.scan.id}`)).scan;if(scan.status==='ready')break;await new Promise(resolve=>setTimeout(resolve,25));}
      assert.equal(scan.status,'ready'); assert.equal(scan.entries[0].duplicate,false);
      const imported=await request(`/api/projects/${pid}/folder-import`,'POST',{scanId:scan.id,entryId:scan.entries[0].id}); assert.equal(imported.status,201);
      assert.equal((await state()).versions.length,1); assert.equal((await state()).removedVersions.length,3);
      const reopened=createWorkbench({dataDir:app.dataDir,port:0});
      const saved=reopened.read().projects.find(p=>p.id===pid);
      assert.equal(saved.versions.filter(v=>v.removedAt).length,3); assert.equal(saved.comments[0].text,note.text);
      assert.equal((await request(`/api/projects/${pid}/versions/restore`,'POST',{versionIds:[v1.id,v2.id,v3.id]})).count,3);
      assert.equal((await state()).versions.length,4); assert.deepEqual(fs.readFileSync(source),originalBytes);
    });
  } finally {
    await new Promise(resolve=>app.server.close(resolve));
    assert.ok(root.startsWith(base+path.sep)&&path.basename(root).startsWith('remove-test-'));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
