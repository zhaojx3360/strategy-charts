import { createPlanning, stageComplete } from './planning.js';
import { createFolderDialog, videoOrder, materialTime, materialDate } from './folder-import.js';
import { createVideoManager } from './video-manager.js';
const paths = {
  film: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4v16M16 4v16M3 9h5m-5 6h5m8-6h5m-5 6h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="m9 5 11 7-11 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  refresh: '<path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v5l3 2"/>',
  export: '<path d="M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 15v6h14v-6"/>',
  back: '<path d="m8 7-5 5 5 5M3 12h11a5 5 0 0 1 0 10" transform="translate(0 -3)"/>',
  forward: '<path d="m16 7 5 5-5 5m5-5H10a5 5 0 0 0 0 10" transform="translate(0 -3)"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  expand: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  comment: '<path d="M20 15a3 3 0 0 1-3 3H9l-6 4V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9Z"/><path d="M7 8h9M7 12h6"/>',
  pin: '<path d="m9 3 6 0-1 5 4 4H6l4-4-1-5Zm3 9v9"/>',
  edit: '<path d="m16 3 5 5L9 20l-6 1 1-6L16 3Zm-2 2 5 5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7"/>',
  file: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v6h5M8 13h8m-8 4h6"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9l10-6Zm-10 11 10 6 10-6M2 19l10 6 10-6" transform="translate(0 -2)"/>',
  alert: '<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v1"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.film}</svg>`;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const statusNames = { pending: '待审核', approved: '已通过', changes_requested: '需要修改' };
const stageNames = { 1: '想法与选题', 2: '口播提纲', 3: '录制与素材', 4: '粗剪审核', 5: '精剪审核', 6: '发布定稿' };
let workspace, projectId, versionId, activeStage = 4, loadedVersionId = null;
let filter = 'open', selectedCommentId = null, pendingSeek = null, importMode = 'file', importFile = null, reviewStatus = 'approved';
let toastTimer, importing = false, copyingCut = false;
const drafts = new Map();
const video = $('video');

function paintIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); node.removeAttribute('data-icon'); }); }
function project() { return workspace?.projects.find(p => p.id === projectId); }
function version() { return project()?.versions.find(v => v.id === versionId); }
function currentComments() { return project()?.comments.filter(c => $('allVersions').checked || c.versionId === versionId) || []; }
function time(t, decimals = false) {
  t = Number.isFinite(Number(t)) ? Math.max(0, Number(t)) : 0;
  const hours = Math.floor(t / 3600), minutes = Math.floor(t / 60) % 60, seconds = t % 60;
  return `${hours ? String(hours).padStart(2, '0') + ':' : ''}${String(minutes).padStart(2, '0')}:${decimals ? seconds.toFixed(1).padStart(4, '0') : String(Math.floor(seconds)).padStart(2, '0')}`;
}
function parseTime(text) {
  const value = text.trim();
  if (!/^(?:\d+:){0,2}\d+(?:\.\d+)?$/.test(value)) return NaN;
  return value.split(':').reduce((total, piece) => total * 60 + Number(piece), 0);
}
function dateText(date, full = false) {
  return new Date(date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', ...(full ? { year: 'numeric' } : {}) });
}
function toast(message, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').className = `toast visible${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4500);
}
function errorToast(error) { toast(error.message || '操作未完成，请重试。', true); }
function safe(fn) { return event => Promise.resolve().then(() => fn(event)).catch(errorToast); }
async function api(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } }); }
  catch { throw new Error('本地服务暂时没有响应。请用启动脚本重新打开，再点刷新。'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作未完成，请重试。');
  return result;
}
function remember() { localStorage.setItem('jianpian-selection', JSON.stringify({ projectId, versionId, activeStage })); }
function stashDraft() {
  if (!versionId) return;
  drafts.set(versionId, { text: $('commentText').value, time: $('commentTime').value, end: $('commentEnd').value, range: !$('commentEnd').hidden, category: $('commentCategory').value });
}
function restoreDraft() {
  const draft = drafts.get(versionId);
  $('commentText').value = draft?.text || '';
  $('commentTime').value = draft?.time || time(video.currentTime || 0, true);
  $('commentEnd').value = draft?.end || '';
  $('commentEnd').hidden = $('rangeDash').hidden = !draft?.range;
  $('rangeToggle').textContent = draft?.range ? '取消区间' : '＋标记区间';
  $('commentCategory').value = draft?.category || '内容';
}
async function loadWorkspace(choose = {}) {
  workspace = await api('/api/workspace');
  if (choose.projectId) projectId = choose.projectId;
  if (!workspace.projects.some(p => p.id === projectId)) projectId = workspace.projects[0]?.id || null;
  if (choose.versionId) { versionId = choose.versionId; activeStage = version()?.stage || activeStage; }
  if (versionId && !version()) versionId = null;
  if (!versionId && activeStage >= 3 && !choose.keepEmptyStage && project()?.versions.length) {
    const preferred = project().versions.filter(v => v.stage === activeStage).at(-1) || project().versions.filter(v => v.stage === 4).at(-1) || project().versions.at(-1);
    versionId = preferred.id; activeStage = preferred.stage;
  }
  render(); remember();
}
function selectProject(nextId) {
  planning.stash();
  stashDraft(); video.pause(); projectId = nextId; versionId = null; selectedCommentId = null;
  const p = project(); const preferred = p.versions.filter(v => v.stage === 4).at(-1) || p.versions.at(-1);
  versionId = preferred?.id || null; activeStage = preferred?.stage || 1;
  render(); restoreDraft(); remember();
}
function selectVersion(nextId, seekTo = null) {
  planning.stash();
  stashDraft(); selectedCommentId = null; versionId = nextId; activeStage = version().stage;
  pendingSeek = seekTo; render(); restoreDraft(); remember();
  if (seekTo !== null && video.readyState >= 1) { video.currentTime = Math.min(seekTo, video.duration || seekTo); pendingSeek = null; }
}
function selectStage(stage) {
  planning.stash();
  stashDraft(); video.pause(); activeStage = stage; selectedCommentId = null;
  versionId = project()?.versions.filter(v => v.stage === stage).at(-1)?.id || null;
  render(); restoreDraft(); remember();
}
function render() {
  const p = project(), v = version();
  const sourceMode = activeStage === 3;
  const originals = p?.versions.filter(item => item.stage === 3) || [];
  const originalIds = new Set(originals.map(item => item.id));
  const originalNotes = p?.comments.filter(c => originalIds.has(c.versionId)) || [];
  $('projectCount').textContent = workspace.projects.length;
  $('projectList').innerHTML = workspace.projects.map(item => `<button class="project-item${item.id === projectId ? ' active' : ''}" data-project="${item.id}" aria-current="${item.id === projectId ? 'page' : 'false'}"><span class="project-icon">${icon('film')}</span><span><strong>${esc(item.title)}</strong><small>${item.demo ? '演示项目' : item.versions.length + ' 个视频版本'} · ${dateText(item.updatedAt).slice(0, 5)}</small></span></button>`).join('');
  $('connection').textContent = '本地存储已连接';
  $('storageLocation').textContent = workspace.dataDir; $('storageLocation').title = `素材与审核记录：${workspace.dataDir}`;
  $('projectTitle').innerHTML = p ? esc(p.title) + (p.demo ? '<span class="demo-tag">演示作品</span>' : '') : '开始你的第一份作品';
  $('projectBrief').textContent = p?.brief || (p ? '围绕一个主旨，把你的想法做成一条作品。' : '创建作品，写下想法，或者直接导入已有视频。');
  $('projectEyebrow').textContent = p?.demo ? 'DEMO PROJECT / 体验完整流程' : 'CREATOR WORKSPACE / 创作工作区';
  $('importButton').disabled = !p;
  $('historyButton').disabled = $('exportButton').disabled = !p;
  $('stageNavigation').innerHTML = workspace.stages.map(s => {
    const versions = p?.versions.filter(v => v.stage === s.id) || [], approved = stageComplete(p, s.id);
    return `<button class="stage-item${activeStage === s.id ? ' active' : ''}${approved ? ' completed' : ''}" data-stage="${s.id}" aria-current="${activeStage === s.id ? 'step' : 'false'}"><span class="stage-number">${approved ? icon('check') : String(s.id).padStart(2, '0')}</span>${s.name}${s.id >= 3 ? `<span class="stage-count">${versions.length}</span>` : ''}</button>`;
  }).join('');
  $('reviewLayout').hidden = activeStage < 3;
  planning.render(p, activeStage);
  $('currentVersion').textContent = v?.label || `${stageNames[activeStage]} · 尚未添加视频`;
  $('videoDimensions').textContent = v?.width ? `${v.width} × ${v.height}` : '';
  $('reviewBadge').textContent = v?.stage === 3 ? '原始素材' : v ? statusNames[v.review.status] : '等待素材';
  $('reviewBadge').className = `status-badge ${v?.stage === 3 ? 'source' : v?.review.status || 'pending'}`;
  $('emptyVideo').hidden = Boolean(v);
  $('playerControls').hidden = !v;
  $('bigPlay').hidden = !v;
  $('videoError').hidden = true;
  if (loadedVersionId !== (v?.id || null)) {
    video.pause(); loadedVersionId = v?.id || null;
    if (v) { video.src = v.url; if (v.posterUrl) video.poster = v.posterUrl; else video.removeAttribute('poster'); video.load(); }
    else { video.removeAttribute('src'); video.removeAttribute('poster'); video.load(); }
    $('seek').value = 0; $('seekProgress').style.width = '0%';
    $('timeDisplay').innerHTML = `00:00 <i>/</i> ${time(v?.duration)}`;
  }
  $('versionCount').textContent = p?.versions.length || 0;
  $('manageVideos').disabled = !p;
  $('restoreVideosTop').hidden = !p?.removedVersions?.length;
  $('removeCurrentVideo').disabled = !v;
  $('removedVideoCount').textContent = p?.removedVersions?.length ? ` · 已移除 ${p.removedVersions.length}` : '';
  $('versionList').innerHTML = videoOrder(p?.versions || []).map(item => `<button class="version-card${item.id === versionId ? ' active' : ''}" data-version="${item.id}" aria-pressed="${item.id === versionId}"><div class="version-thumb">${item.posterUrl ? `<img src="${item.posterUrl}" alt="${esc(item.label)}预览" loading="lazy">` : ''}<span class="duration">${time(item.duration)}</span>${item.id === versionId ? `<span class="selected-check">${icon('check')}</span>` : ''}</div><div class="version-caption"><strong>${esc(item.label)}</strong><small><span class="tiny-dot" style="background:${item.review.status === 'approved' ? 'var(--green)' : '#818b99'}"></span>${item.stage === 3 ? '原片' : statusNames[item.review.status]}<span>·</span>${stageNames[item.stage]}</small>${item.stage === 3 ? `<small class="material-time" title="${esc(materialTime(item)?.timeLabel || '旧素材未记录拍摄时间')}">${materialTime(item) ? esc(materialDate(materialTime(item).sortAt)) + (materialTime(item).timeSource === 'modified' ? ' · 备用时间' : '') : '未记录拍摄时间'}</small>` : ''}</div></button>`).join('') + (p ? `<button class="version-add" id="addVersionCard">${icon('plus')}添加版本</button>` : '');
  const open = p?.comments.filter(c => c.versionId === versionId && !c.resolved).length || 0;
  $('reviewSummaryTitle').textContent = !v ? '这一阶段还没有视频' : v.review.status === 'approved' ? `${stageNames[v.stage]}已通过` : v.review.status === 'changes_requested' ? '等待下一轮修改' : `正在审核：${v.label}`;
  $('reviewSummaryText').textContent = !v ? '添加对应的视频版本，再开始预览与审核。' : v.review.note || (open ? `还有 ${open} 条批注待处理，完成后可通过本阶段。` : '确认内容与视听效果后，可以通过本阶段。');
  $('reviewButtons').hidden = sourceMode;
  $('sourceActions').hidden = !sourceMode;
  $('roughCopyStatus').hidden = true;
  $('reviewSummary').classList.toggle('source-handoff', sourceMode);
  $('reviewSummaryIcon').innerHTML = icon(sourceMode ? 'comment' : 'shield');
  $('notesEyebrow').textContent = sourceMode ? 'SOURCE NOTES' : 'REVIEW NOTES';
  $('notesHeading').textContent = sourceMode ? '素材批注' : '审片批注';
  if (sourceMode) {
    $('reviewSummaryTitle').textContent = '批注完成，交给第 4 步粗剪';
    $('reviewSummaryText').textContent = originals.length ? `${originals.length} 段原片 · ${originalNotes.length} 条批注。复制请求，粘贴到当前对话发送。` : '添加原片并留下批注后，在这里复制粗剪请求。';
  }
  $('copyRoughRequest').disabled = copyingCut || !originals.length;
  $('approveStage').disabled = !v || v.review.status === 'approved';
  $('approveStage').innerHTML = icon('check') + (v?.review.status === 'approved' ? '已通过审核' : '通过本阶段');
  $('requestChanges').disabled = !v;
  $('commentText').disabled = $('saveComment').disabled = !v;
  $('commentTime').disabled = $('captureTime').disabled = $('rangeToggle').disabled = !v;
  $('downloadVideo').hidden = !v;
  if (v) { $('downloadVideo').href = v.url; $('downloadVideo').download = v.originalName; }
  renderComments(); updatePlayState();
}
function renderComments() {
  const p = project(), comments = currentComments();
  const open = comments.filter(c => !c.resolved).length;
  $('openCount').textContent = open; $('allCount').textContent = comments.length; $('resolvedCount').textContent = comments.length - open;
  $('commentCount').textContent = comments.length;
  $('notesVersion').textContent = $('allVersions').checked ? '这份作品的所有版本' : version()?.label || '当前阶段还没有视频';
  const visible = comments.filter(c => filter === 'all' || (filter === 'resolved' ? c.resolved : !c.resolved)).sort((a, b) => a.time - b.time);
  $('commentList').innerHTML = visible.map(c => {
    const v = p.versions.find(v => v.id === c.versionId);
    return `<article class="comment-card${c.resolved ? ' resolved' : ''}${c.id === selectedCommentId ? ' selected' : ''}" data-comment-card="${c.id}"><div class="comment-card-top"><span class="avatar">${c.demo ? '例' : '我'}</span><span class="comment-author">${c.demo ? '演示批注' : '我的批注'}</span><span class="comment-date">${dateText(c.createdAt)}</span></div><button class="time-pill" data-jump="${c.id}" aria-label="跳到${esc(v?.label)} ${time(c.time, true)}">${icon('pin')}${time(c.time, true)}${c.end == null ? '' : ' — ' + time(c.end, true)}</button>${$('allVersions').checked ? `<span class="comment-version">${esc(v?.label)}</span>` : ''}<p>${esc(c.text)}</p><div class="comment-card-bottom"><span class="category-tag">${esc(c.category)}</span>${v?.stage === 3 ? `<span class="source-note-state">${c.resolved ? '已落实' : '粗剪时处理'}</span>` : `<button class="resolve-button${c.resolved ? ' done' : ''}" data-resolve="${c.id}" aria-label="${c.resolved ? '重新标为待处理' : '标为已处理'}：${esc(c.text.slice(0, 20))}">${icon(c.resolved ? 'check' : 'circle')}${c.resolved ? '已处理 · 撤回' : '标为已处理'}</button>`}</div></article>`;
  }).join('') || `<div class="comments-empty">${icon(filter === 'resolved' ? 'check' : 'comment')}<strong>${filter === 'resolved' ? '暂时没有已处理批注' : filter === 'all' ? '这里还没有批注' : '没有待处理批注'}</strong><p>${version() ? '播放视频，在想调整的位置暂停，写下你的意见。' : '添加视频后，就可以在这里记录具体修改意见。'}</p></div>`;
  const v = version();
  $('commentMarkers').innerHTML = v?.duration ? p.comments.filter(c => c.versionId === v.id).map(c => `<button class="comment-marker${c.resolved ? ' resolved' : ''}" style="left:${Math.min(100, c.time / v.duration * 100)}%" data-jump="${c.id}" title="${time(c.time, true)} ${esc(c.text)}" aria-label="批注 ${time(c.time, true)}"></button>`).join('') : '';
  document.querySelectorAll('[data-filter]').forEach(button => { const active = button.dataset.filter === filter; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
}
function updatePlayState() {
  $('playPause').innerHTML = icon(video.paused ? 'play' : 'pause');
  $('playPause').setAttribute('aria-label', video.paused ? '播放' : '暂停');
  $('bigPlay').classList.toggle('is-playing', !video.paused);
  $('mute').innerHTML = icon(video.muted ? 'muted' : 'volume');
  $('mute').setAttribute('aria-label', video.muted ? '取消静音' : '静音');
}
async function togglePlay() { if (!version()) return; if (video.paused) await video.play(); else video.pause(); }
function jumpComment(commentId) {
  const c = project()?.comments.find(c => c.id === commentId); if (!c) return;
  video.pause();
  if (versionId !== c.versionId) selectVersion(c.versionId, c.time);
  else video.currentTime = Math.min(c.time, video.duration || c.time);
  selectedCommentId = c.id; renderComments();
}
function showImport() {
  if (!project()) { $('projectDialog').showModal(); return; }
  $('importForm').reset(); importFile = null; $('fileLabel').textContent = '点击选择，或拖入视频文件';
  $('importStage').value = String(activeStage >= 3 ? activeStage : 3);
  $('importNotice').textContent = Number($('importStage').value) === 3 ? '原片添加后即可批注，批注完成后直接交给粗剪。' : '剪辑版添加后等待审核。';
  $('importProgress').hidden = true; setImportMode('file'); $('importDialog').showModal();
}
function setImportMode(mode) {
  importMode = mode; $('fileMode').hidden = mode !== 'file'; $('pathMode').hidden = mode !== 'path';
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}
function chooseFile(file) {
  if (!file) return;
  importFile = file; $('fileLabel').textContent = `${file.name} · ${(file.size / 1024 ** 2).toFixed(1)} MB`;
  if (!$('importLabel').value) $('importLabel').value = file.name.replace(/\.[^.]+$/, '');
}
function uploadFile(url, file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('POST', url); xhr.setRequestHeader('X-Review-Client', 'workbench'); xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = event => { const percent = event.lengthComputable ? Math.round(event.loaded / event.total * 100) : 0; $('importProgressBar').style.width = `${percent}%`; $('importProgressText').textContent = percent === 100 ? '文件已传入，正在生成预览…' : `正在保存到本地素材区 ${percent}%`; };
    xhr.onload = () => { let result; try { result = JSON.parse(xhr.responseText); } catch { reject(new Error('导入未完成，请检查本地服务。')); return; } xhr.status < 300 ? resolve(result) : reject(new Error(result.error || '导入失败。')); };
    xhr.onerror = () => reject(new Error('导入连接中断，原文件不受影响，请重试。')); xhr.send(file);
  });
}
function showReview(status) {
  const v = version(); if (!v || v.stage === 3) return;
  const remaining = project().comments.filter(c => c.versionId === v.id && !c.resolved).length;
  if (status === 'approved' && remaining) { toast(`还有 ${remaining} 条待处理批注，请处理后再通过。`, true); return; }
  video.pause(); reviewStatus = status; $('reviewNote').value = '';
  $('reviewDialogTitle').textContent = status === 'approved' ? '通过本阶段' : '这一版需要修改';
  $('reviewDialogDescription').textContent = `${v.label} · ${stageNames[v.stage]}\n${status === 'approved' ? '确认后，会记录这一版的审核结论。添加新版本仍需单独审核。' : '保存修改结论，接下来可在对话里让我按批注处理。'}`;
  $('reviewNoteOptional').textContent = status === 'approved' || remaining ? '选填' : '请填写';
  $('reviewSubmit').textContent = status === 'approved' ? '确认通过' : '保存修改结论';
  $('reviewDialog').showModal();
}

const folders = createFolderDialog({ getProject: project, api, esc, safe, icon, reload: async firstVersion => { stashDraft(); await loadWorkspace(firstVersion ? { versionId: firstVersion } : { keepEmptyStage: true }); restoreDraft(); } });
const videoManager = createVideoManager({ getProject: project, api, esc, safe, icon, preview: selectVersion, reload: async () => {
  planning.stash(); stashDraft(); video.pause(); await loadWorkspace({ keepEmptyStage: true });
  if (!version() && activeStage >= 3) { versionId = project()?.versions.filter(v => v.stage === activeStage).at(-1)?.id || null; selectedCommentId = null; render(); remember(); }
  restoreDraft();
} });
function showFolderImport() { $('importDialog').close(); folders.show(); }
const planning = createPlanning({ getProject: project, api, reload: () => loadWorkspace({ keepEmptyStage: true }), selectStage, showImport, showFolderImport, toast, safe, esc, icon });
paintIcons();
document.addEventListener('click', safe(async event => {
  const target = event.target.closest('button, a'); if (!target) return;
  if (target.dataset.close) { if (importing && target.dataset.close === 'importDialog') return; $(target.dataset.close).close(); }
  if (target.dataset.project) selectProject(target.dataset.project);
  if (target.dataset.version) selectVersion(target.dataset.version);
  if (target.dataset.stage) selectStage(Number(target.dataset.stage));
  if (target.dataset.filter) { filter = target.dataset.filter; renderComments(); }
  if (target.dataset.mode) setImportMode(target.dataset.mode);
  if (target.dataset.jump) jumpComment(target.dataset.jump);
  if (target.dataset.resolve) {
    const comment = project().comments.find(c => c.id === target.dataset.resolve);
    await api(`/api/projects/${projectId}/comments/${comment.id}`, { method: 'PATCH', body: JSON.stringify({ resolved: !comment.resolved }) });
    await loadWorkspace({ keepEmptyStage: true }); toast(comment.resolved ? '批注已恢复为待处理。' : '已标为处理完成。');
  }
  if (target.id === 'addVersionCard') showImport();
  if (target.id === 'importFolderButton') showFolderImport();
}));
$('newProject').onclick = () => { $('projectForm').reset(); $('projectDialog').showModal(); };
$('projectForm').onsubmit = safe(async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  try {
    const result = await api('/api/projects', { method: 'POST', body: JSON.stringify({ title: $('newTitle').value, brief: $('newBrief').value }) });
    planning.stash(); stashDraft(); projectId = result.project.id; versionId = null; activeStage = 1;
    await loadWorkspace({ keepEmptyStage: true }); restoreDraft(); $('projectDialog').close(); toast('作品已创建，先随意写下你想说的内容。');
  } finally { submit.disabled = false; }
});
$('importButton').onclick = $('emptyImport').onclick = showImport;
$('manageVideos').onclick = () => { video.pause(); videoManager.show(); };
$('restoreVideosTop').onclick = () => { video.pause(); videoManager.show(null, true); };
$('removeCurrentVideo').onclick = () => { video.pause(); videoManager.show(versionId); };
$('videoFile').onchange = event => chooseFile(event.target.files[0]);
$('importStage').onchange = () => { $('importNotice').textContent = Number($('importStage').value) === 3 ? '原片添加后即可批注，批注完成后直接交给粗剪。' : '剪辑版添加后等待审核。'; };
for (const name of ['dragenter', 'dragover']) $('dropZone').addEventListener(name, event => { event.preventDefault(); $('dropZone').classList.add('dragging'); });
for (const name of ['dragleave', 'drop']) $('dropZone').addEventListener(name, event => { event.preventDefault(); $('dropZone').classList.remove('dragging'); if (name === 'drop') chooseFile(event.dataTransfer.files[0]); });
$('importDialog').addEventListener('cancel', event => { if (importing) event.preventDefault(); });
$('importForm').onsubmit = safe(async event => {
  event.preventDefault();
  if (importMode === 'file' && !importFile) throw new Error('请先选择一个视频文件。');
  if (importMode === 'path' && !$('videoPath').value.trim()) throw new Error('请填写视频的完整路径。');
  importing = true; $('importSubmit').disabled = true; $('importProgress').hidden = false; $('importProgressBar').style.width = '8%'; $('importProgressText').textContent = '正在读取视频并生成预览…';
  try {
    const values = { stage: Number($('importStage').value), label: $('importLabel').value.trim() };
    const result = importMode === 'path' ? await api(`/api/projects/${projectId}/import-path`, { method: 'POST', body: JSON.stringify({ ...values, filePath: $('videoPath').value.trim().replace(/^"|"$/g, '') }) }) : await uploadFile(`/api/projects/${projectId}/upload?${new URLSearchParams({ ...values, fileName: importFile.name })}`, importFile);
    stashDraft(); await loadWorkspace({ versionId: result.version.id }); restoreDraft(); $('importDialog').close(); toast(result.version.stage === 3 ? '原片已添加，可以开始批注。' : '视频版本已添加，等待本轮审核。');
  } finally { importing = false; $('importSubmit').disabled = false; $('importProgress').hidden = true; }
});
$('commentText').addEventListener('focus', () => { video.pause(); if (!$('commentText').value && !drafts.has(versionId)) $('commentTime').value = time(video.currentTime, true); });
$('captureTime').onclick = () => { video.pause(); $('commentTime').value = time(video.currentTime, true); stashDraft(); };
$('rangeToggle').onclick = () => { const show = $('commentEnd').hidden; $('commentEnd').hidden = $('rangeDash').hidden = !show; $('rangeToggle').textContent = show ? '取消区间' : '＋标记区间'; if (show && !$('commentEnd').value) $('commentEnd').value = time(Math.min((parseTime($('commentTime').value) || 0) + 2, video.duration || 0), true); stashDraft(); };
$('commentForm').onsubmit = safe(async event => {
  event.preventDefault(); if (!version()) return;
  const start = parseTime($('commentTime').value), end = $('commentEnd').hidden ? null : parseTime($('commentEnd').value);
  if (!Number.isFinite(start) || (end !== null && !Number.isFinite(end))) throw new Error('时间格式示例：01:32.5，或者直接填写秒数。');
  $('saveComment').disabled = true;
  try {
    await api(`/api/projects/${projectId}/comments`, { method: 'POST', body: JSON.stringify({ versionId, time: start, end, text: $('commentText').value, category: $('commentCategory').value }) });
    $('commentText').value = ''; drafts.delete(versionId); filter = 'open'; await loadWorkspace({ keepEmptyStage: true }); toast('批注已保存到这个版本。');
    $('commentList').scrollTop = $('commentList').scrollHeight;
  } finally { $('saveComment').disabled = !version(); }
});
for (const name of ['commentText', 'commentTime', 'commentEnd', 'commentCategory']) $(name).addEventListener('input', stashDraft);
$('allVersions').onchange = renderComments;
$('playPause').onclick = $('bigPlay').onclick = safe(togglePlay);
video.onclick = safe(togglePlay);
$('skipBack').onclick = () => { video.currentTime = Math.max(0, video.currentTime - 5); };
$('skipForward').onclick = () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); };
$('mute').onclick = () => { video.muted = !video.muted; updatePlayState(); };
$('playbackRate').onchange = event => { video.playbackRate = Number(event.target.value); };
$('seek').oninput = event => { if (version()) video.currentTime = Number(event.target.value); };
$('fullscreen').onclick = safe(async () => { if (!document.fullscreenElement) await $('playerPanel').requestFullscreen(); else await document.exitFullscreen(); });
for (const event of ['play', 'pause', 'ended', 'volumechange']) video.addEventListener(event, updatePlayState);
video.addEventListener('loadedmetadata', () => {
  $('seek').max = video.duration || 1;
  video.playbackRate = Number($('playbackRate').value);
  if (pendingSeek !== null) { video.currentTime = Math.min(pendingSeek, video.duration || pendingSeek); pendingSeek = null; }
  if (!$('commentText').value) $('commentTime').value = time(video.currentTime, true);
  updateTime();
});
function updateTime() {
  const duration = video.duration || version()?.duration || 0;
  $('seek').value = video.currentTime || 0; $('seekProgress').style.width = `${duration ? video.currentTime / duration * 100 : 0}%`;
  $('timeDisplay').innerHTML = `${time(video.currentTime)} <i>/</i> ${time(duration)}`;
}
video.addEventListener('timeupdate', updateTime);
video.addEventListener('error', () => { if (version() && video.getAttribute('src')) { $('videoError').hidden = false; $('bigPlay').hidden = true; } });
$('requestChanges').onclick = () => showReview('changes_requested'); $('approveStage').onclick = () => showReview('approved');
$('copyRoughRequest').onclick = safe(async () => {
  if (copyingCut) return;
  if ($('commentText').value.trim()) throw new Error('当前批注还未保存，请先点击保存批注。');
  copyingCut = true; $('copyRoughRequest').disabled = true; video.pause();
  try {
    const copied = await planning.copyCutRequest();
    if (copied) { $('roughCopyStatus').hidden = false; $('roughCopyStatus').textContent = '已复制。粘贴到当前对话发送后，开始制作粗剪。'; }
  } finally { copyingCut = false; $('copyRoughRequest').disabled = !project()?.versions.some(v => v.stage === 3); }
});
$('reviewForm').onsubmit = safe(async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  try { await api(`/api/projects/${projectId}/review`, { method: 'POST', body: JSON.stringify({ versionId, status: reviewStatus, note: $('reviewNote').value }) }); await loadWorkspace({ keepEmptyStage: true }); $('reviewDialog').close(); toast(reviewStatus === 'approved' ? '这一版已通过审核，记录已保存。' : '修改结论已保存，可在对话中继续处理。'); }
  finally { submit.disabled = false; }
});
$('historyButton').onclick = () => {
  $('historyList').innerHTML = project().history.map(item => `<div class="history-item"><span class="history-icon">${icon(item.action === 'stage_reviewed' ? 'shield' : item.action === 'version_added' ? 'layers' : 'comment')}</span><div><p>${esc(item.detail)}</p><small>${dateText(item.at, true)}${item.versionId ? ' · ' + esc(project().versions.find(v => v.id === item.versionId)?.label || '') : ''}</small></div></div>`).join('') || '<div class="comments-empty">暂时没有审核记录。</div>';
  $('historyDialog').showModal();
};
$('exportButton').onclick = () => { $('exportMarkdown').href = `/api/projects/${projectId}/export?format=md`; $('exportJson').href = `/api/projects/${projectId}/export?format=json`; $('exportDialog').showModal(); };
$('refresh').onclick = safe(async () => { planning.stash(); stashDraft(); await loadWorkspace({ keepEmptyStage: true }); toast('已读取最新想法、选题、提纲和视频记录。'); });
document.addEventListener('keydown', safe(async event => {
  if (event.target.closest('input,textarea,select') || document.querySelector('dialog[open]')) return;
  if (event.code === 'Space') { event.preventDefault(); await togglePlay(); }
  if (event.code === 'ArrowLeft' && version()) { event.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
  if (event.code === 'ArrowRight' && version()) { event.preventDefault(); video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); }
  if (event.code === 'KeyC' && version()) { event.preventDefault(); video.pause(); $('commentText').focus(); }
}));
window.addEventListener('beforeunload', () => { planning.stash(); stashDraft(); });
try { const saved = JSON.parse(localStorage.getItem('jianpian-selection') || '{}'); projectId = saved.projectId; versionId = saved.versionId; activeStage = saved.activeStage || 4; } catch { /* Use the first project. */ }
loadWorkspace().then(restoreDraft).catch(error => { $('connection').textContent = '本地服务未连接'; $('projectTitle').textContent = '连接暂时中断'; $('projectBrief').textContent = error.message; toast(error.message, true); });
