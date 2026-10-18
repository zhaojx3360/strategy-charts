import { videoOrder } from './folder-import.js';

const $ = id => document.getElementById(id);
const fileKey = v => `${v.stage}:${v.filePath.replace(/\\/g, '/').toLowerCase()}`;
export function duplicateExtras(versions) {
  const seen = new Set(), extras = new Set();
  for (const v of versions) { const key = fileKey(v); if (seen.has(key)) extras.add(v.id); else seen.add(key); }
  return extras;
}

export function createVideoManager(ctx) {
  const { esc, api, safe, icon } = ctx;
  let tab = 'active', selected = new Set(), lastRemoved = [], busy = false;
  const stages = {3:'原始素材',4:'粗剪',5:'精剪',6:'定稿'};
  document.body.insertAdjacentHTML('beforeend', `<dialog id="videoManager" class="video-manager"><div class="dialog-content">
    <div class="dialog-heading"><div><span class="eyebrow">MANAGE YOUR VIDEOS</span><h2>留下需要的视频。</h2></div><button class="icon-button" type="button" id="managerClose" aria-label="关闭视频管理">${icon('close')}</button></div>
    <p class="dialog-description" id="managerProject"></p><p class="field-help">从作品中移除后，可在“已移除”里恢复。原文件、批注和审核记录都会保留。</p>
    <div class="manager-tabs" role="tablist" aria-label="视频管理范围"><button role="tab" type="button" data-manager-tab="active" id="managerActive">作品中的视频</button><button role="tab" type="button" data-manager-tab="removed" id="managerRemoved">已移除</button></div>
    <div class="manager-tools"><label><input type="checkbox" id="managerAll">全选</label><button class="text-link" type="button" id="managerDuplicates">仅选多余重复项</button><span id="managerCount"></span></div>
    <p class="field-help" id="managerDuplicateHelp">重复按同阶段、同完整路径识别；“仅选多余重复项”会保留最早添加的一份。请核对勾选结果后再移除。</p>
    <div class="manager-list" id="managerList"></div>
    <div class="manager-feedback" role="status" aria-live="polite"><span id="managerFeedback">勾选要移除的视频，再点击下方按钮。</span><button class="text-link" type="button" id="managerUndo" hidden>撤销本次移除</button></div>
    <div class="dialog-footer"><span class="field-help">只调整本作品列表，磁盘上的视频文件保留。</span><button class="button primary" type="button" id="managerSubmit" disabled>移除选中视频</button></div>
  </div></dialog>`);
  const items = () => tab === 'active' ? videoOrder(ctx.getProject()?.versions || []) : [...(ctx.getProject()?.removedVersions || [])].sort((a,b)=>Date.parse(b.removedAt)-Date.parse(a.removedAt));
  function feedback(message, error = false) { $('managerFeedback').textContent = message; $('managerFeedback').classList.toggle('error',error); }
  function selection() {
    const all = items();
    $('managerAll').checked = Boolean(all.length && all.every(v=>selected.has(v.id)));
    $('managerAll').indeterminate = selected.size > 0 && selected.size < all.length;
    $('managerSubmit').textContent = `${tab === 'active' ? '移除' : '恢复'}选中${selected.size ? `的 ${selected.size} 个` : ''}视频`;
    $('managerSubmit').disabled = busy || !selected.size;
    $('managerCount').textContent = `已选 ${selected.size} / ${all.length}`;
  }
  function render() {
    const p = ctx.getProject(), extras = duplicateExtras(p?.versions || []);
    $('managerProject').textContent = `「${p.title}」`;
    $('managerActive').textContent = `作品中的视频 ${p.versions.length}`;
    $('managerRemoved').textContent = `已移除 ${p.removedVersions?.length || 0}`;
    document.querySelectorAll('[data-manager-tab]').forEach(b => { b.classList.toggle('active',b.dataset.managerTab === tab); b.setAttribute('aria-selected',String(b.dataset.managerTab === tab)); });
    $('managerDuplicates').hidden = $('managerDuplicateHelp').hidden = tab !== 'active';
    $('managerDuplicates').disabled = busy || !extras.size;
    $('managerUndo').hidden = !lastRemoved.length;
    $('managerList').innerHTML = items().map(v => {
      const count = tab === 'active' ? p.comments.filter(c=>c.versionId===v.id).length : v.commentCount;
      return `<div class="manager-row"><label class="manager-row-main"><input type="checkbox" data-manager-id="${v.id}" aria-label="选择视频 ${esc(v.label)}" ${selected.has(v.id) ? 'checked' : ''} ${busy ? 'disabled' : ''}><span><strong>${esc(v.label)}${tab === 'active' && extras.has(v.id) ? '<em>多余重复引用</em>' : ''}</strong><span class="manager-filename" title="${esc(v.filePath || v.originalName)}">${esc(v.originalName)}</span><small>${stages[v.stage]} · ${((v.size||0)/1024**2).toFixed(1)} MB · ${count} 条批注 ${v.stage === 3 ? '' : '· ' + {approved:'已通过',pending:'待审核',changes_requested:'需要修改'}[v.review.status]}${tab === 'removed' ? ' · 移除于 ' + new Date(v.removedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}</small></span></label>${tab === 'active' ? `<button class="text-link" type="button" data-manager-preview="${v.id}" ${busy ? 'disabled' : ''}>预览</button>` : ''}</div>`;
    }).join('') || `<div class="manager-empty">${tab === 'active' ? '作品中还没有视频。已移除的片段可切换到右侧恢复。' : '这里还没有移除的视频。'}</div>`;
    selection();
  }
  function lock(value) {
    busy = value;
    for (const id of ['managerClose','managerAll','managerUndo','managerActive','managerRemoved']) $(id).disabled = value;
    render();
  }
  async function move(restore, ids) {
    if (busy || !ids.length) return;
    lock(true);
    try {
      const result = await api(`/api/projects/${ctx.getProject().id}/versions/${restore ? 'restore' : 'remove'}`,{method:'POST',body:JSON.stringify({versionIds:ids})});
      if (!restore) lastRemoved = result.versionIds;
      else lastRemoved = lastRemoved.filter(id=>!ids.includes(id));
      selected.clear(); await ctx.reload();
      feedback(restore ? `已恢复 ${result.count} 个视频，批注与审核记录一起恢复。` : `已移除 ${result.count} 个视频。原文件保留，可撤销或到“已移除”恢复。`);
    } catch(e) { feedback(e.message,true); }
    finally { lock(false); }
  }
  $('managerList').addEventListener('change',e=>{ const id=e.target.dataset.managerId; if(id) { if(e.target.checked) selected.add(id); else selected.delete(id); selection(); } });
  $('managerList').addEventListener('click',e=>{ const id=e.target.closest('[data-manager-preview]')?.dataset.managerPreview; if(id && !busy) { $('videoManager').close(); ctx.preview(id); } });
  $('managerAll').onchange = ()=>{ selected = $('managerAll').checked ? new Set(items().map(v=>v.id)) : new Set(); render(); };
  $('managerDuplicates').onclick = ()=>{ selected=duplicateExtras(ctx.getProject().versions); render(); feedback(`已选 ${selected.size} 个多余重复项，每个相同路径保留最早添加的一份。`); };
  document.querySelectorAll('[data-manager-tab]').forEach(b=>{ b.onclick=()=>{ if(busy)return; tab=b.dataset.managerTab; selected.clear(); render(); feedback(tab==='active' ? '勾选要移除的视频，再点击下方按钮。' : '勾选要恢复的视频，原有批注与审核记录会一起回来。'); }; });
  $('managerClose').onclick = ()=>{ if(!busy) $('videoManager').close(); };
  $('videoManager').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('managerSubmit').onclick = safe(()=>move(tab==='removed',[...selected]));
  $('managerUndo').onclick = safe(()=>move(true,[...lastRemoved]));
  return { show(currentId, removed = false) { if(!ctx.getProject())return; tab=removed ? 'removed' : 'active'; selected=new Set(currentId ? [currentId] : []); lastRemoved=[]; render(); feedback(removed ? '勾选要恢复的视频，原有批注与审核记录会一起回来。' : currentId ? '已选中当前视频，点击“移除选中的视频”即可移除，之后可恢复。' : '勾选要移除的视频，再点击下方按钮。'); $('videoManager').showModal(); } };
}
