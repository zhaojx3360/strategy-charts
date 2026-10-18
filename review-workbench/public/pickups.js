export function createPickupUI({ getProject, getVersion, selectVersion, api, reload, esc, safe, toast, time, parseTime }) {
  const $ = id => document.getElementById(id), video = $('video');
  const panel = document.createElement('section'); panel.className = 'pickup-panel'; panel.id = 'pickupPanel'; panel.hidden = true;
  $('playerPanel').after(panel);
  $('videoViewport').insertAdjacentHTML('beforeend', `<div id="pickupOverlay" class="pickup-overlay" role="region" aria-label="补录字幕提示" hidden><span class="pickup-kicker">补录稿 · 等待你的声音</span><p id="pickupOverlayText"></p><small>画面已暂停。这里只是预览提示，合成后才会写入新视频。</small><div><button class="button primary" id="pickupOverlayAudio" type="button">添加本段音频</button><button class="button secondary" id="pickupContinue" type="button">继续预览</button></div></div>`);
  document.body.insertAdjacentHTML('beforeend', `<dialog id="pickupDialog" class="pickup-dialog"><form id="pickupForm" class="dialog-content"><div class="dialog-heading"><div><span class="eyebrow">VOICE PICKUP</span><h2>只补声音，画面定格</h2></div><button type="button" class="icon-button" id="pickupClose" aria-label="关闭补录窗口">×</button></div><p class="field-help" id="pickupTarget"></p><div class="form-grid"><div><label class="field-label" for="pickupStart">替换开始时间</label><input id="pickupStart" required></div><div><label class="field-label" for="pickupEnd">替换结束时间</label><input id="pickupEnd" required></div></div><label class="field-label" for="pickupScript">本段补录文字</label><textarea id="pickupScript" rows="4" maxlength="3000" required placeholder="按你的真实本意修改，再照着录。"></textarea><p class="field-help">录音前后各留约半秒安静，语气接近前后原声。不用拍视频；合成时按新声音长度定格画面、显示字幕，再接回原片。</p><div class="pickup-modes"><button type="button" data-pickup-mode="file" class="active">选择音频文件</button><button type="button" data-pickup-mode="path">本机路径引用</button></div><div id="pickupFileMode"><label class="drop-zone pickup-drop" for="pickupFile" id="pickupDrop"><strong id="pickupFileLabel">点击选择，或拖入音频</strong><small>MP3 / M4A / WAV 等 · 最多200MB · 仅存本机</small></label><input id="pickupFile" type="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.flac,.ogg,.webm,.amr" hidden></div><div id="pickupPathMode" hidden><label class="field-label" for="pickupPath">音频的完整本机路径</label><input id="pickupPath" placeholder="C:\\素材\\第一处补录.m4a"></div><div id="pickupAudioHistory" class="pickup-audio-history"></div><p class="field-help" role="status" id="pickupUploadStatus"></p><div class="dialog-footer"><button type="button" class="button secondary" id="pickupSaveScript">只保存补录稿</button><button type="submit" class="button primary" id="pickupSaveAudio">保存并添加音频</button></div><p class="field-help">添加音频只保存素材，不会自动改成片或处理批注。准备好后，复制配音合成请求到当前对话。</p></form></dialog><dialog id="pickupCopyDialog"><div class="dialog-content"><div class="dialog-heading"><h2>复制配音合成请求</h2><button class="icon-button" data-close="pickupCopyDialog" aria-label="关闭">×</button></div><textarea id="pickupCopyText" rows="10" readonly aria-label="配音合成请求"></textarea><p class="field-help">按 Ctrl+C 复制，粘贴到当前对话发送。</p></div></dialog>`);
  let editing = null, editingComment = null, mode = 'file', file = null, busy = false, overlay = null, lastVersion = null;
  const triggered = new Set();
  const items = () => getProject()?.pickups || [];
  const audioFor = p => p.audios.find(a => a.id === p.selectedAudioId);
  const pending = p => getProject()?.comments.some(c => c.id === p.commentId && !c.resolved);
  function hideOverlay() { overlay = null; $('pickupOverlay').hidden = true; $('videoViewport').classList.remove('has-pickup'); }
  function showOverlay(item) {
    overlay = item; triggered.add(item.id); video.pause();
    $('pickupOverlayText').textContent = item.text; $('pickupOverlay').hidden = false; $('videoViewport').classList.add('has-pickup');
  }
  function preview(item) {
    if (getVersion()?.id !== item.versionId) selectVersion(item.versionId, item.time);
    video.pause(); if (video.readyState >= 1) video.currentTime = item.time;
    showOverlay(item);
  }
  function render() {
    if (lastVersion !== getVersion()?.id) { lastVersion = getVersion()?.id; triggered.clear(); hideOverlay(); }
    const current = items().filter(p => p.versionId === getVersion()?.id && pending(p)).sort((a,b) => a.time-b.time);
    panel.hidden = !current.length;
    const ready = current.filter(p => audioFor(p)?.available).length;
    panel.innerHTML = `<div class="pickup-panel-heading"><div><span class="eyebrow">补录配音</span><h3>不用重拍，补上这段声音</h3></div><span>${ready} / ${current.length} 段录音已添加</span></div><label class="pickup-auto"><input type="checkbox" id="pickupAutoPause" checked>播放到补录处暂停，并显示补录稿</label>${current.map((p,i) => `<div class="pickup-row"><span>${i+1}. ${time(p.time,true)} — ${time(p.end,true)}<small>${audioFor(p)?.available ? esc(audioFor(p).originalName) : '等待录音 · 原成片尚未修改'}</small></span><button class="button secondary" data-pickup-preview="${p.id}" type="button">看字幕提示</button><button class="button primary" data-pickup-edit="${p.id}" type="button">${audioFor(p)?.available ? '试听 / 更换音频' : '添加本段音频'}</button></div>`).join('')}<div class="pickup-handoff"><small>录好后添加到对应段落，再复制请求到当前对话。</small><button type="button" class="button secondary" id="copyPickupRequest" ${ready !== current.length || !ready ? 'disabled' : ''}>录音已齐，复制配音合成请求</button></div><p id="pickupCopyStatus" class="field-help" role="status"></p>`;
  }
  function decorateComments() {
    $('commentList').querySelectorAll('[data-comment-card]').forEach(card => {
      const comment = getProject()?.comments.find(c => c.id === card.dataset.commentCard);
      const version = getProject()?.versions.find(v => v.id === comment?.versionId);
      if (!comment || comment.resolved || version?.stage < 4 || card.querySelector('[data-pickup-comment]')) return;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'text-link pickup-comment-button'; button.dataset.pickupComment = comment.id;
      button.textContent = items().some(p => p.commentId === comment.id) ? '补录稿 / 添加音频' : '用补录音频替换'; card.append(button);
    });
  }
  function audioHistory() {
    const item = items().find(p => p.id === editing);
    $('pickupAudioHistory').innerHTML = item?.audios.length ? `<label class="field-label" for="pickupAudioChoice">已保存的录音（保留各版）</label><select id="pickupAudioChoice">${item.audios.map(a => `<option value="${a.id}" ${a.id === item.selectedAudioId ? 'selected' : ''}>${esc(a.originalName)} · ${time(a.duration,true)}${a.available ? '' : ' · 文件不可用'}</option>`).join('')}</select>${audioFor(item)?.available ? `<audio controls preload="metadata" src="${audioFor(item).url}" aria-label="试听本段补录音频"></audio>` : ''}` : '';
  }
  function setMode(value) { mode = value; $('pickupFileMode').hidden = value !== 'file'; $('pickupPathMode').hidden = value !== 'path'; document.querySelectorAll('[data-pickup-mode]').forEach(b => b.classList.toggle('active',b.dataset.pickupMode===value)); }
  function open(commentId) {
    const comment = getProject()?.comments.find(c => c.id === commentId); if (!comment) return;
    const item = items().find(p => p.commentId === commentId);
    editing = item?.id || null; editingComment = comment.id; file = null;
    video.pause(); $('pickupForm').reset(); setMode('file');
    $('pickupTarget').textContent = getProject().versions.find(v => v.id === comment.versionId)?.label || '';
    $('pickupStart').value = time(item?.time ?? comment.time,true); $('pickupEnd').value = time(item?.end ?? comment.end ?? comment.time+5,true);
    $('pickupScript').value = item?.text || ''; $('pickupFileLabel').textContent = '点击选择，或拖入音频'; $('pickupUploadStatus').textContent = '';
    audioHistory(); $('pickupDialog').showModal();
  }
  async function saveScript() {
    const body={ commentId: editingComment, time: parseTime($('pickupStart').value), end: parseTime($('pickupEnd').value), text: $('pickupScript').value };
    if (!Number.isFinite(body.time) || !Number.isFinite(body.end)) throw new Error('请用 分:秒 填写完整的替换区间。');
    const pid=getProject().id;
    const result=await api(`/api/projects/${pid}/pickups${editing ? '/'+editing : ''}`,{method:editing?'PATCH':'POST',body:JSON.stringify(body)});
    editing=result.pickup.id; await reload(); return result.pickup;
  }
  function upload(url, source) {
    return new Promise((resolve,reject) => {
      const xhr=new XMLHttpRequest(); xhr.open('POST',url); xhr.setRequestHeader('X-Review-Client','workbench'); xhr.setRequestHeader('Content-Type','application/octet-stream');
      xhr.upload.onprogress=e=>{$('pickupUploadStatus').textContent=e.lengthComputable ? `正在保存录音 ${Math.round(e.loaded/e.total*100)}%，随后准备试听…` : '正在保存录音…';};
      xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{reject(new Error('录音导入未完成，请重试。'));return;} xhr.status<300?resolve(data):reject(new Error(data.error||'录音导入失败。'));};
      xhr.onerror=()=>reject(new Error('本地连接中断，请重试。')); xhr.send(source);
    });
  }
  function setBusy(value) { busy=value; ['pickupSaveAudio','pickupSaveScript','pickupClose','pickupScript','pickupStart','pickupEnd','pickupFile','pickupPath'].forEach(id=>$(id).disabled=value); }
  async function copyRequest() {
    const project=getProject(), version=getVersion();
    const request=[
      `请处理见片作品「${project.title}」（ID：${project.id}）。先读取 http://127.0.0.1:4317/api/workspace，核对当前版本 ${version.id} 以及该版 pickups、原批注和已保存的补录音频。`,
      '本轮仅按已保存的补录任务制作定格配音新版：逐段试听 selectedAudioId 对应音频，结合前后语意核对 time/end 边界；去掉被替换区间的旧声音，用我的新录音替换，按新声音长度定格合适画面并显示与录音一致的字幕，完成后接回原片。以实际录音为准核对补录稿，有出入不要仅照稿硬上字幕。已有字幕勘误和其他未要求修改的区间保留，不擅自增加补录或暂停。',
      '保留所有原片、旧粗剪与录音，另存实际可播放的新 stage=4 待审版本，检查声音、定格时长、字幕、拼接和完整播放，交付新旧时间映射。上传录音不等于批注已处理；只有实际合成并检查后才标记已落实项，不代我通过审核。缺少有效录音或目标区间已改变时保留待处理。'
    ].join('\n');
    try { await navigator.clipboard.writeText(request); $('pickupCopyStatus').textContent='已复制。粘贴到当前对话发送后，开始合成配音新版。'; }
    catch { $('pickupCopyText').value=request; $('pickupCopyDialog').showModal(); $('pickupCopyText').select(); }
  }
  panel.addEventListener('click',safe(async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.pickupPreview)preview(items().find(x=>x.id===b.dataset.pickupPreview));if(b.dataset.pickupEdit)open(items().find(x=>x.id===b.dataset.pickupEdit).commentId);if(b.id==='copyPickupRequest')await copyRequest();}));
  document.addEventListener('click',safe(async e=>{const b=e.target.closest('[data-pickup-comment],[data-pickup-mode]');if(!b)return;if(b.dataset.pickupComment)open(b.dataset.pickupComment);if(b.dataset.pickupMode)setMode(b.dataset.pickupMode);}));
  function close() { if(busy)return; $('pickupDialog').querySelector('audio')?.pause(); $('pickupDialog').close(); }
  $('pickupClose').onclick=close; $('pickupDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();else $('pickupDialog').querySelector('audio')?.pause();});
  $('pickupSaveScript').onclick=safe(async()=>{setBusy(true);try{await saveScript();toast('补录稿已保存，原成片和批注状态未变。');}finally{setBusy(false);}});
  $('pickupForm').onsubmit=safe(async e=>{e.preventDefault();if(busy)return;if(mode==='file'&&!file)throw new Error('请先选择录音；还没录好可以只保存补录稿。');if(mode==='path'&&!$('pickupPath').value.trim())throw new Error('请填写录音的本机路径。');setBusy(true);try{const item=await saveScript(),base=`/api/projects/${getProject().id}/pickups/${item.id}`;if(mode==='file')await upload(base+'/upload?'+new URLSearchParams({fileName:file.name}),file);else await api(base+'/import-path',{method:'POST',body:JSON.stringify({filePath:$('pickupPath').value.trim().replace(/^"|"$/g,'')})});await reload();audioHistory();$('pickupUploadStatus').textContent='录音已添加，可以试听。关闭后复制配音合成请求。';toast('补录音频已保存，等待实际合成。');}finally{setBusy(false);}});
  $('pickupAudioHistory').addEventListener('change',safe(async e=>{if(e.target.id!=='pickupAudioChoice')return;await api(`/api/projects/${getProject().id}/pickups/${editing}`,{method:'PATCH',body:JSON.stringify({selectedAudioId:e.target.value})});await reload();audioHistory();}));
  function choose(source){if(!source)return;file=source;$('pickupFileLabel').textContent=source.name+' · '+(source.size/1024**2).toFixed(1)+' MB';}
  $('pickupFile').onchange=e=>choose(e.target.files[0]); ['dragenter','dragover'].forEach(name=>$('pickupDrop').addEventListener(name,e=>e.preventDefault())); $('pickupDrop').addEventListener('drop',e=>{e.preventDefault();if(!busy)choose(e.dataTransfer.files[0]);});
  $('pickupOverlayAudio').onclick=()=>{if(overlay)open(overlay.commentId);}; $('pickupContinue').onclick=safe(async()=>{hideOverlay();await video.play();});
  video.addEventListener('play',hideOverlay);
  video.addEventListener('timeupdate',()=>{
    const current=items().filter(x=>x.versionId===getVersion()?.id&&pending(x));
    current.forEach(x=>{if(video.currentTime<x.time-.5)triggered.delete(x.id);});
    if(!$('pickupAutoPause')?.checked || overlay || document.querySelector('dialog[open]'))return;
    const item=current.find(x=>video.currentTime>=x.time&&video.currentTime<x.end&&!triggered.has(x.id)); if(item){showOverlay(item);}
  });
  return { render, decorateComments, showForComment(commentId){const item=items().find(x=>x.commentId===commentId);if(item&&pending(item))preview(item);else hideOverlay();} };
}
