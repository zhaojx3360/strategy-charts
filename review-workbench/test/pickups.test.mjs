import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWorkbench } from '../server.mjs';
const run=promisify(execFile);
test('voice pickups preserve source review, validate attachments and survive restart',async t=>{
  const base=path.resolve('.runtime');fs.mkdirSync(base,{recursive:true});
  const root=fs.mkdtempSync(path.join(base,'pickup-test-'));
  const video=path.join(root,'source.mp4'),voice=path.join(root,'补录.wav');
  await run('ffmpeg',['-v','error','-nostdin','-y','-f','lavfi','-i','color=c=blue:s=160x240:r=12','-t','3','-c:v','libx264',video],{windowsHide:true});
  await run('ffmpeg',['-v','error','-nostdin','-y','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','pcm_s16le',voice],{windowsHide:true});
  const original=fs.readFileSync(voice),app=createWorkbench({dataDir:path.join(root,'data'),port:0}),address=await app.listen(),origin=`http://127.0.0.1:${address.port}`;
  async function request(url,method='GET',body){const r=await fetch(origin+url,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,...await r.json()};}
  let pid,version,comment,pickup,audio1,audio2;
  const state=async()=> (await request('/api/workspace')).projects.find(p=>p.id===pid);
  try{
    pid=(await request('/api/projects','POST',{title:'音频补录测试'})).project.id;
    version=(await request(`/api/projects/${pid}/import-path`,'POST',{stage:4,label:'测试粗剪',filePath:video})).version;
    comment=(await request(`/api/projects/${pid}/comments`,'POST',{versionId:version.id,time:1,end:2,text:'待补录'})).comment;
    await t.test('creates one pickup per comment and rejects invalid ranges and ownership',async()=>{
      const base=`/api/projects/${pid}/pickups`;
      assert.equal((await request(base,'POST',{commentId:comment.id,text:'我的补录',end:5})).status,400);
      assert.equal((await request(base,'POST',{commentId:comment.id,text:''})).status,400);
      pickup=(await request(base,'POST',{commentId:comment.id,text:'幸福者退让，减少冲突升级的风险。'})).pickup;
      assert.equal(pickup.visual,'freeze');assert.equal(pickup.time,1);assert.equal(pickup.end,2);
      const same=await request(base,'POST',{commentId:comment.id,text:'按真实本意修改的补录稿'});assert.equal(same.pickup.id,pickup.id);
      assert.equal((await state()).pickups.length,1);
      const other=(await request('/api/projects','POST',{title:'其他测试作品'})).project.id;
      assert.equal((await request(`/api/projects/${other}/pickups/${pickup.id}`,'PATCH',{text:'不属于此作品'})).status,404);
      assert.equal((await request(`${base}/${pickup.id}`,'PATCH',{selectedAudioId:'foreign'})).status,400);
    });
    await t.test('path audio creates a playable preview and never changes source annotations or approvals',async()=>{
      const result=await request(`/api/projects/${pid}/pickups/${pickup.id}/import-path`,'POST',{filePath:voice});assert.equal(result.status,201);audio1=result.audio;
      const p=await state();assert.equal(p.versions[0].review.status,'pending');assert.equal(p.comments[0].resolved,false);assert.equal(p.comments[0].text,'待补录');
      assert.equal(p.pickups[0].audios[0].available,true);assert.equal(p.pickups[0].selectedAudioId,audio1.id);
      const response=await fetch(origin+p.pickups[0].audios[0].url,{headers:{Range:'bytes=0-99'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'audio/mp4');assert.equal((await response.arrayBuffer()).byteLength,100);
      assert.deepEqual(fs.readFileSync(voice),original);
    });
    await t.test('upload retains audio revisions and selection without replacing a video',async()=>{
      const url=`${origin}/api/projects/${pid}/pickups/${pickup.id}/upload?fileName=${encodeURIComponent('第二遍.wav')}`;
      assert.equal((await fetch(url,{method:'POST',body:original})).status,403);
      const response=await fetch(url,{method:'POST',headers:{'X-Review-Client':'workbench','Content-Type':'application/octet-stream'},body:original});assert.equal(response.status,201);audio2=(await response.json()).audio;
      const p=await state();assert.equal(p.versions.length,1);assert.equal(p.pickups[0].audios.length,2);assert.equal(p.pickups[0].selectedAudioId,audio2.id);assert.equal(p.pickups[0].audios[1].originalName,'第二遍.wav');
      assert.equal((await request(`/api/projects/${pid}/pickups/${pickup.id}`,'PATCH',{selectedAudioId:audio1.id})).status,200);
    });
    await t.test('rejects unreadable, empty and wrong media without saving audio records',async()=>{
      const blank=path.join(root,'empty.wav');fs.writeFileSync(blank,'');
      const fake=path.join(root,'fake.wav');fs.writeFileSync(fake,'invalid');
      for(const filePath of [blank,fake,video,path.join(root,'missing.wav')])assert.equal((await request(`/api/projects/${pid}/pickups/${pickup.id}/import-path`,'POST',{filePath})).status,400);
      assert.equal((await state()).pickups[0].audios.length,2);
    });
    await t.test('export and restart preserve linkage while removed videos hide their pickups',async()=>{
      const exported=await request(`/api/projects/${pid}/export?format=json`);assert.equal(exported.project.pickups[0].audios.length,2);
      const markdown=await(await fetch(`${origin}/api/projects/${pid}/export?format=md`)).text();assert.ok(markdown.includes('定格配音补录'));assert.ok(markdown.includes('按真实本意修改的补录稿'));assert.ok(markdown.includes('补录.wav'));
      const reopened=createWorkbench({dataDir:app.dataDir,port:0});assert.equal(reopened.read().projects.find(p=>p.id===pid).pickups[0].selectedAudioId,audio1.id);
      await request(`/api/projects/${pid}/versions/${version.id}`,'DELETE');assert.equal((await state()).pickups.length,0);assert.equal((await fetch(origin+'/pickup-audio/'+audio1.id)).status,404);
      assert.equal((await request(`/api/projects/${pid}/pickups/${pickup.id}`,'PATCH',{text:'已移除'})).status,404);
      await request(`/api/projects/${pid}/versions/restore`,'POST',{versionIds:[version.id]});assert.equal((await state()).pickups.length,1);assert.equal((await state()).comments[0].resolved,false);
    });
  }finally{await new Promise(resolve=>app.server.close(resolve));assert.ok(root.startsWith(base+path.sep)&&path.basename(root).startsWith('pickup-test-'));fs.rmSync(root,{recursive:true,force:true});}
});
