import { VALUE_FIELDS, OUTLINE_CHECKS, CREATIVE_BRIEF } from './creative-standards.js';
const $ = id => document.getElementById(id);
const topicCurrent = p => p && p.topicsIdeasRevision === p.ideasRevision;
const outlineCurrent = p => topicCurrent(p) && p.selectedTopicId && p.outline.topicId === p.selectedTopicId && p.outline.topicRevision === p.topicRevision;
export function stageComplete(project, stage) {
  const p = project?.planning;
  if (stage === 1) return Boolean(topicCurrent(p) && p.selectedTopicId);
  if (stage === 2) return Boolean(outlineCurrent(p) && p.outline.status === 'approved');
  if (stage === 3) return Boolean(project?.versions.some(v => v.stage === 3));
  return project?.versions.filter(v => v.stage === stage).at(-1)?.review.status === 'approved';
}

export function createPlanning(ctx) {
  const { esc, icon, safe, toast } = ctx;
  let renderedProject = null, renderedStage = null;
  const panel = $('planningPanel');
  const dialog = document.createElement('dialog'); dialog.id = 'handoffDialog'; dialog.className = 'wide-dialog';
  dialog.innerHTML = `<div class="dialog-content"><div class="dialog-heading"><div><span class="eyebrow">CONTINUE WITH CODEX</span><h2 id="handoffTitle">交给 Codex</h2></div><button class="icon-button" data-close="handoffDialog" aria-label="关闭">${icon('close')}</button></div><p id="handoffDescription" class="dialog-description"></p><textarea id="handoffText" rows="12" aria-label="交接内容" spellcheck="false"></textarea><p class="field-help" id="handoffHelp"></p><div class="dialog-footer"><button class="button secondary" data-close="handoffDialog">关闭</button><button class="button primary" id="handoffSubmit">复制请求</button></div></div>`;
  document.body.append(dialog);
  const valueDialog = document.createElement('dialog'); valueDialog.id = 'topicValuesDialog'; valueDialog.className = 'wide-dialog';
  valueDialog.innerHTML = `<form id="topicValuesForm" class="dialog-content"><div class="dialog-heading"><div><span class="eyebrow">AUDIENCE & AUTHENTICITY</span><h2>补充观众价值与真实细节</h2></div><button class="icon-button" type="button" data-close="topicValuesDialog" aria-label="关闭">${icon('close')}</button></div><p id="topicValuesTitle" class="dialog-description"></p>${VALUE_FIELDS.map(([key,label,help]) => `<label class="field-label" for="topic-${key}">${label}</label><textarea id="topic-${key}" rows="3" maxlength="3000" placeholder="${esc(help)}"></textarea>`).join('')}<p class="field-help" id="topicValuesHelp"></p><div class="dialog-footer"><button class="button secondary" type="button" data-close="topicValuesDialog">取消</button><button class="button primary" type="submit">保存补充</button></div></form>`;
  document.body.append(valueDialog);
  let editingTopic = null;
  let handoffMode = 'copy', resultKind = 'topics';
  const draftKey = id => `jianpian-planning-draft:${id}`;
  function draftFor(id) { try { return JSON.parse(localStorage.getItem(draftKey(id)) || '{}'); } catch { return {}; } }
  function stash() {
    if (!renderedProject) return;
    const draft = draftFor(renderedProject);
    if (renderedStage === 1 && $('ideasText')) draft.ideas = { ideas: $('ideasText').value, audience: $('audienceText').value, duration: $('durationText').value, base: panel.dataset.ideasBase };
    if (renderedStage === 2 && $('outlineText')) draft.outline = { text: $('outlineText').value, note: $('outlineNote').value, checklist: readOutlineChecks(), base: panel.dataset.outlineBase };
    if (renderedStage === 3 && $('recordingNotes')) draft.recording = { notes: $('recordingNotes').value, checklist: Object.fromEntries([...panel.querySelectorAll('[data-check]')].map(n => [n.dataset.check, n.checked])), base: panel.dataset.recordingBase };
    try { localStorage.setItem(draftKey(renderedProject), JSON.stringify(draft)); } catch { toast('浏览器草稿空间不足，请及时保存到作品。', true); }
  }
  function clearDraft(kind) { const p = ctx.getProject(); if (!p) return; const d = draftFor(p.id); delete d[kind]; localStorage.setItem(draftKey(p.id), JSON.stringify(d)); }
  async function update(body, clearKind) {
    const p = ctx.getProject();
    await ctx.api(`/api/projects/${p.id}/planning`, { method: 'PATCH', body: JSON.stringify(body) });
    if (clearKind) clearDraft(clearKind);
    await ctx.reload();
  }
  const smallStatus = (label, complete) => `<span class="status-badge ${complete ? 'approved' : 'pending'}">${label}</span>`;
  const readOutlineChecks = () => Object.fromEntries([...panel.querySelectorAll('[data-outline-check]')].map(n => [n.dataset.outlineCheck, n.checked]));
  const valueSummary = topic => `<div class="topic-values">${VALUE_FIELDS.map(([key,label]) => `<div><span>${label}</span><p class="${topic[key] ? '' : 'value-missing'}">${esc(topic[key] || '待补充')}</p></div>`).join('')}</div>`;
  function topicCard(t, chosen, fresh) {
    const remaining = VALUE_FIELDS.filter(([key]) => !t[key]?.trim()).length;
    return `<article class="topic-card${chosen?.id === t.id && fresh ? ' selected' : ''}"><div class="topic-top"><span>DIRECTION ${String(t.number).padStart(2, '0')}</span>${t.recommended ? '<span class="recommend-tag">推荐方向</span>' : ''}</div><h3>${esc(t.title)}</h3>${valueSummary(t)}<dl><dt>一句话主旨</dt><dd>${esc(t.premise)}</dd><dt>核心矛盾</dt><dd class="conflict-text">${esc(t.conflict)}</dd><dt>我的观点</dt><dd>${esc(t.viewpoint)}</dd><dt>理由与依据</dt><dd>${esc(t.reasons)}</dd><dt>待补充</dt><dd>${esc(t.missing)}</dd></dl><button class="button secondary topic-values-button" data-topic-values="${t.id}" ${!fresh ? 'disabled' : ''}>${icon('edit')}${remaining ? '补充观众价值 · ' + remaining + ' 项待补' : '编辑观众价值与真实细节'}</button><button class="button ${chosen?.id === t.id && fresh ? 'approve' : 'secondary'}" data-topic="${t.id}" ${!fresh ? 'disabled' : ''}>${chosen?.id === t.id && fresh ? icon('check') + '方向已选 · 查看提纲' : '确认这个方向' + icon('arrow')}</button></article>`;
  }
  function render(project, stage) {
    renderedProject = project?.id || null; renderedStage = stage; panel.hidden = stage > 3;
    if (stage > 3) return;
    if (!project) { panel.innerHTML = '<div class="planning-empty"><h2>先给这份作品起个名字</h2><p>点击“新建作品”，从一段自由表达开始。</p></div>'; return; }
    const p = project.planning, d = draftFor(project.id), chosen = p.topics.find(t => t.id === p.selectedTopicId);
    panel.dataset.ideasBase = String(p.ideasRevision); panel.dataset.outlineBase = String(p.outline.revision); panel.dataset.recordingBase = p.recording.updatedAt || '';
    const demo = project.demo ? '<span class="demo-notice">演示内容 · 用于体验操作</span>' : '';
    if (stage === 1) {
      const local = d.ideas?.base === String(p.ideasRevision) ? d.ideas : p;
      const fresh = topicCurrent(p);
      panel.innerHTML = `<div class="planning-heading"><div><span class="eyebrow">01 / FIND THE STORY</span><h2>先把想说的话，放在这里。</h2><p>经历、困惑、零散判断都可以。选题再由我们一起提炼。</p></div>${smallStatus(chosen && fresh ? '方向已确认' : p.topics.length && fresh ? '等待选择方向' : '等待整理选题', chosen && fresh)}</div>
        <div class="planning-grid"><form id="ideasForm" class="planning-card ideas-card"><div class="section-heading"><h3>自由表达</h3><span>${p.ideasRevision ? '已保存 v' + p.ideasRevision : '还没有保存'} ${demo}</span></div><textarea id="ideasText" rows="13" maxlength="60000" required aria-label="自由想法" placeholder="比如：我做了很多研究，可是结果并没有想象中好。我想讲讲这段经历，但还不知道从哪里说起……">${esc(local.ideas)}</textarea><div class="form-grid"><div><label class="field-label" for="audienceText">想讲给谁听 <span>选填</span></label><input id="audienceText" maxlength="300" value="${esc(local.audience)}" placeholder="例如：有相似困惑的普通人"></div><div><label class="field-label" for="durationText">预计时长 <span>可调整</span></label><input id="durationText" maxlength="100" value="${esc(local.duration)}"></div></div><div class="planning-actions"><span class="field-help">未保存输入会暂存在当前浏览器。</span><button class="button secondary" type="submit">保存想法</button><button class="button primary" type="button" data-plan="request-topics">保存并整理选题 ${icon('arrow')}</button></div></form>
        <aside class="planning-card purpose-card"><span class="eyebrow">ONE VIDEO, ONE IDEA</span><h3>这一期，先抓住一个矛盾。</h3><p>我原以为怎样，<br>却遇到了怎样的现实？</p><div class="purpose-line"><span>主旨</span>观众最后记住什么</div><div class="purpose-line"><span>矛盾</span>为什么值得继续听</div><div class="purpose-line"><span>观点</span>我如何理解与选择</div><div class="purpose-line"><span>理由</span>哪些真实经历支持它</div><div class="purpose-line"><span>收获</span>观众得到启发、共鸣或笑点</div><div class="purpose-line"><span>真实</span>哪些不完美与本期有关</div><small>按真实素材选择切入点。无需每期自曝，也不必强行给出圆满答案。</small></aside></div>
        <section class="topics-section"><div class="section-heading"><div><h3>三个选题方向</h3><p class="field-help">每个方向都说明观众所得与真实切入点，选定以后再写提纲。</p></div><button class="button secondary" data-plan="import-topics">${icon('download')} 导入选题回复</button></div>${p.topics.length && !fresh ? '<p class="planning-alert">想法已更新。下面是旧选题，请按最新想法重新整理后再选择。</p>' : ''}<div class="topic-grid">${p.topics.map(t => topicCard(t, chosen, fresh)).join('') || '<div class="planning-empty"><span>' + icon('spark') + '</span><h3>选题会出现在这里</h3><p>先保存想法，把整理请求发到当前对话。我保存结果后，你刷新就能选择。</p></div>'}</div></section>`;
    } else if (stage === 2) {
      const ready = Boolean(chosen && topicCurrent(p)), valid = outlineCurrent(p);
      const local = d.outline?.base === String(p.outline.revision) ? d.outline : p.outline;
      panel.innerHTML = `<div class="planning-heading"><div><span class="eyebrow">02 / SHAPE YOUR VOICE</span><h2>把一个观点，讲得有起有落。</h2><p>先写能开口说的提纲，给自然发挥留一点空间。</p></div>${smallStatus(valid && p.outline.status === 'approved' ? '提纲已通过' : p.outline.status === 'changes_requested' ? '提纲需要修改' : p.outline.text ? '提纲待确认' : '等待提纲', valid && p.outline.status === 'approved')}</div>
      ${!ready ? '<div class="planning-empty"><h3>先选择本期的方向</h3><p>选题确认后，再围绕同一个矛盾组织提纲。</p><button class="button primary" data-go="1">返回选择选题</button></div>' : `<div class="selected-direction"><span class="eyebrow">本期已选</span><h3>${esc(chosen.title)}</h3><p>${esc(chosen.conflict)}</p>${valueSummary(chosen)}<button class="text-link" data-go="1">返回调整方向 ${icon('arrow')}</button></div><div class="planning-grid outline-grid"><form id="outlineForm" class="planning-card"><div class="section-heading"><h3>口播提纲 ${p.outline.revision ? '<span>v' + p.outline.revision + '</span>' : ''}</h3><button type="button" class="button secondary" data-plan="import-outline">导入提纲回复</button></div>${p.outline.text && !valid ? '<p class="planning-alert">下面保留旧提纲。方向已变化，请重新整理并保存，再审核。</p>' : ''}<textarea id="outlineText" rows="19" maxlength="60000" aria-label="口播提纲" placeholder="开头怎么说？\n第一段：先给判断\n第二段：理由和真实经历\n第三段：解释代价或反例\n结尾：回应开头的矛盾\n\n也可以先点击右侧，把请求交给 Codex。">${esc(local.text)}</textarea><div class="planning-actions"><span class="field-help">修改并保存会重新进入待审核。</span><button class="button secondary" type="submit">保存提纲草稿</button></div></form><aside class="planning-card outline-review"><span class="eyebrow">OUTLINE REVIEW</span><h3>这一版，可以开口了吗？</h3><p>具体处境 → 核心矛盾 → 真实反应 → 理解或转折 → 观众所得。</p><div class="outline-content-checks"><strong>内容自检</strong>${Object.entries(OUTLINE_CHECKS).map(([key,label]) => `<label><input type="checkbox" data-outline-check="${key}" ${(local.checklist || p.outline.checklist)?.[key] ? 'checked' : ''}>${esc(label)}</label>`).join('')}<button class="text-link" data-plan="save-outline-checks">保存自检</button><small>辅助你审核，可单独保存。真实切入点不足时先列待补素材。</small></div><button class="button secondary" data-plan="request-outline">${icon('spark')} 复制提纲整理请求</button><label class="field-label" for="outlineNote">提纲修改意见 <span>退回时必填</span></label><textarea id="outlineNote" rows="5" maxlength="3000" placeholder="例如：开头太绕，先讲我遇到的问题，再介绍背景。">${esc(local.note)}</textarea><button class="button secondary" data-plan="outline-changes">需要修改</button><button class="button primary" data-plan="outline-approve">${icon('check')} 通过提纲，进入录制</button><p class="field-help">只确认这份提纲。后续剪辑版本仍分别审核。</p></aside></div>${p.outlineHistory?.length ? `<details class="outline-history"><summary>查看过去的提纲（${p.outlineHistory.length}）</summary>${[...p.outlineHistory].reverse().map(o => `<details><summary>提纲 v${o.revision} · ${esc(o.status)}</summary><pre>${esc(o.text)}</pre></details>`).join('')}</details>` : ''}`}`;
    } else {
      const local = d.recording?.base === (p.recording.updatedAt || '') ? d.recording : p.recording;
      const originalCount = project.versions.filter(v => v.stage === 3).length;
      panel.innerHTML = `<div class="planning-heading"><div><span class="eyebrow">03 / RECORD YOUR STORY</span><h2>按提纲录，也可以自然发挥。</h2><p>讲错一句就停一下重录，原始素材完整保留。</p></div>${smallStatus(originalCount ? '已收到原始素材' : '等待录制上传', originalCount)}</div><div class="recording-grid"><div class="planning-card recording-outline"><div class="section-heading"><h3>录制时看这里</h3><button class="text-link" data-go="2">查看 / 修改提纲 ${icon('arrow')}</button></div>${p.outline.text ? `<p class="field-help">${stageComplete(project, 2) ? '已确认提纲' : '当前提纲尚未通过，可先回到第 2 步确认。'}</p><pre class="outline-reading">${esc(p.outline.text)}</pre>` : '<p class="field-help">还没有提纲。你也可以先录制自由表达，再把素材放进来整理。</p>'}</div><form id="recordingForm" class="planning-card"><h3>录制准备与备忘</h3><div class="recording-checks">${Object.entries({audio:'试录一小段，声音清楚',framing:'画面、光线和构图合适',facts:'数字、名称和事实已核对',materials:'配图、录屏等素材已准备'}).map(([key,label]) => `<label><input type="checkbox" data-check="${key}" ${local.checklist?.[key] ? 'checked' : ''}>${label}</label>`).join('')}</div><label class="field-label" for="recordingNotes">补充说明</label><textarea id="recordingNotes" rows="4" maxlength="10000" placeholder="哪一段重录了？哪些地方希望保留？还缺什么素材？">${esc(local.notes)}</textarea><div class="planning-actions"><button class="button secondary" type="submit">保存录制备忘</button><button class="button primary" type="button" data-plan="import-folder">${icon('upload')} 批量导入文件夹</button><button class="button secondary" type="button" data-plan="upload-original">添加单个视频</button></div><p class="field-help">粘贴文件夹路径，按拍摄时间批量引用。下方原片从早到晚排列，可逐段预览；原文件请保留在原处。</p>${originalCount ? '<p class="field-help">原片批注完成后，复制粗剪请求发到当前对话。进入粗剪审核用于查看结果，不会自动开始剪辑。</p><button class="button secondary" type="button" data-plan="request-cut">复制粗剪请求</button><button class="text-link recording-next" type="button" data-go="4">进入粗剪审核 ' + icon('arrow') + '</button>' : ''}</form></div>`;
    }
    panel.querySelectorAll('input,textarea').forEach(n => n.addEventListener('input', stash));
    if ($('ideasForm')) $('ideasForm').onsubmit = safe(async e => { e.preventDefault(); await saveIdeas(); toast('想法已保存到作品。'); });
    if ($('outlineForm')) $('outlineForm').onsubmit = safe(async e => { e.preventDefault(); await saveOutline(); toast('提纲已保存，等待审核。'); });
    if ($('recordingForm')) $('recordingForm').onsubmit = safe(async e => { e.preventDefault(); await saveRecording(); toast('录制备忘已保存。'); });
  }
  async function saveIdeas() {
    const body = { action: 'ideas', ideas: $('ideasText').value, audience: $('audienceText').value, duration: $('durationText').value };
    stash(); await update(body, 'ideas');
  }
  async function saveOutline() {
    const p = ctx.getProject().planning;
    const body = { action: 'outline', text: $('outlineText').value, topicId: p.selectedTopicId, topicRevision: p.topicRevision };
    stash(); await update(body, 'outline');
  }
  async function saveRecording() {
    await update({ action: 'recording', notes: $('recordingNotes').value, checklist: Object.fromEntries([...panel.querySelectorAll('[data-check]')].map(n => [n.dataset.check, n.checked])) }, 'recording');
  }
  function showHandoff(mode, kind, text = '') {
    handoffMode = mode; resultKind = kind;
    $('handoffTitle').textContent = mode === 'copy' ? '把这一轮交给 Codex' : `导入${kind === 'topics' ? '选题' : '提纲'}回复`;
    $('handoffDescription').textContent = mode === 'copy' ? '复制下面的请求，粘贴到当前对话发送。我完成并保存结果后，点击网页左下角刷新。' : kind === 'topics' ? '粘贴 Codex 返回的选题 JSON。你可以先检查内容，再保存到作品。' : '粘贴提纲正文，或包含 text 字段的 JSON。保存后由你审核。';
    $('handoffText').value = text; $('handoffText').readOnly = mode === 'copy';
    $('handoffText').placeholder = kind === 'topics' ? '{ "ideasRevision": 1, "topics": [ ...三个选题... ] }' : '粘贴提纲正文……';
    $('handoffHelp').textContent = mode === 'copy' ? '这里复制请求，不会自动发送消息或开始调用 AI。' : '只解析文字和 JSON，不执行回复中的代码。';
    $('handoffSubmit').textContent = mode === 'copy' ? '复制请求' : '保存到作品'; dialog.showModal();
  }
  function makeRequest(kind) {
    const project = ctx.getProject(), p = project.planning, chosen = p.topics.find(t => t.id === p.selectedTopicId);
    let text = `请处理见片工作区的作品「${project.title}」（ID：${project.id}）。\n请先读取 http://127.0.0.1:4317/api/workspace，按该作品的当前状态执行。\n知识库入口：C:/disk/self-space/agent-memory-vault/10-项目记忆/自媒体/自媒体创作.md\n${CREATIVE_BRIEF}\n`;
    if (kind === 'topics') text += `本轮只做第 1 步：根据已保存的自由想法 v${p.ideasRevision}，提出三个有实质区别的选题方向。每个提供标题 title、一句话主旨 premise、核心矛盾 conflict、观点 viewpoint、理由与推荐依据 reasons、待补充内容 missing（没有写“暂无”），用字符串填写；可附 recommended 布尔值。每个方向还需提供${VALUE_FIELDS.map(([key,label]) => label + ' ' + key).join('、')}，都用字符串填写；真实素材不足时写“待补充：具体需要的经历”，本期无需自曝也可说明。不要编造事实，也不要提前写完整提纲。\n完成后 PATCH http://127.0.0.1:4317/api/projects/${project.id}/planning，JSON：{"action":"topics","ideasRevision":${p.ideasRevision},"topics":[三个选题对象]}。若素材版本变动，请重新读取。无法直接保存时，请给可导入的 JSON：{"ideasRevision":${p.ideasRevision},"topics":[...]}。等待我选择。\n\n自由想法：\n${p.ideas}\n受众：${p.audience || '由素材判断'}\n时长：${p.duration}`;
    else if (kind === 'outline') text += `本轮只做第 2 步：根据已确认选题「${chosen?.title}」，组织适合口述的提纲，包含开头、分段观点与真实理由、过渡、结尾和画面建议，标明待补事实，等待我审核。\n按“具体处境 → 核心矛盾 → 我的真实反应 → 理解或转折 → 观众所得”组织，保留有用情绪。\n已选方向的内容约定：\n${VALUE_FIELDS.map(([key,label]) => label + '：' + (chosen?.[key] || '待补充，请向我指出缺少的素材')).join('\n')}\n修改意见：${$('outlineNote')?.value.trim() || p.outline.note || '暂无'}\n当前编辑的提纲：\n${$('outlineText')?.value || p.outline.text || '尚未起草'}\n完成后 PATCH http://127.0.0.1:4317/api/projects/${project.id}/planning，JSON：{"action":"outline","topicId":"${p.selectedTopicId}","topicRevision":${p.topicRevision},"text":"提纲正文"}。若选题变化，请重新读取。无法保存时返回同样的 JSON 供导入。不要替我通过提纲。`;
    else {
      const originals = project.versions.filter(v => v.stage === 3), ids = new Set(originals.map(v => v.id));
      const comments = project.comments.filter(c => ids.has(c.versionId));
      text += `本轮做第 4 步：按当前 ${originals.length} 段原片和 ${comments.length} 条原片批注制作粗剪 v1（已有粗剪时另存新版）。请读取工作区当前未移除的 stage=3 视频、每段的 comments、review.note、已选方向、已审提纲与录制备忘。无需把所有原片标为已通过，未处理批注正是本轮剪辑任务。\n先按素材 material.sortAt 或 mediaTime.sortAt 从早到晚整理（缺失或备用时间先核对），结合必要的转写和视听检查组织主线，合并成一条实际可播放的粗剪视频，再作为本作品 stage=4 待审核新版本导入。\n逐条核对批注的 versionId 和原片时间；区间批注结合前后语意落实删减，单时间点批注先确认停顿或句子的边界，不能一律把时间点之后整段删掉。已处理批注保留记录并核对，不重复执行删减。涉及改观点、改说法或补充没有录到的话时，列出具体补录点，不编造我的经历、不生成冒充我的口播，不仅靠修改字幕就声称原话已改正。\n保留原素材和原片批注，不代我通过审核。交付粗剪时逐条说明哪些批注已落实、对应删减的原片区间、顺序变化，以及哪些仍需补录或确认。只有实际完成并检查后才能将相应批注标为已处理；无法落实的批注继续待处理。检查成片声音、画面、拼接和可播放性，等我在第 4 步审核。不要仅修改批注状态或切换网页阶段就声称已剪辑。`;
    }
    return text;
  }
  panel.addEventListener('click', safe(async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go) { stash(); ctx.selectStage(Number(b.dataset.go)); return; }
    if (b.dataset.topicValues) {
      stash(); const project = ctx.getProject(), p = project.planning, t = p.topics.find(t => t.id === b.dataset.topicValues);
      if (!t) throw new Error('选题已变化，请刷新后重试。');
      editingTopic = { projectId: project.id, topicId: t.id, topicRevision: p.topicRevision };
      $('topicValuesTitle').textContent = t.title;
      for (const [key] of VALUE_FIELDS) $('topic-' + key).value = t[key] || '';
      $('topicValuesHelp').textContent = t.id === p.selectedTopicId ? '保存当前方向的新补充后，请重新核对提纲。空项会显示待补充，无需编造经历。' : '保留这个方向的观众所得和真实细节。空项会显示待补充。';
      valueDialog.showModal(); return;
    }
    if (b.dataset.topic) { stash(); await update({ action: 'select-topic', topicId: b.dataset.topic }); ctx.selectStage(2); toast('方向已确认，可以整理口播提纲。'); return; }
    const action = b.dataset.plan;
    if (action === 'request-topics') { await saveIdeas(); showHandoff('copy', 'topics', makeRequest('topics')); }
    if (action === 'request-outline') { stash(); showHandoff('copy', 'outline', makeRequest('outline')); }
    if (action === 'request-cut') { await saveRecording(); showHandoff('copy', 'cut', makeRequest('cut')); }
    if (action === 'import-topics') { if (!ctx.getProject().planning.ideas) throw new Error('先保存你的自由想法，再导入对应选题。'); showHandoff('import', 'topics'); }
    if (action === 'import-outline') showHandoff('import', 'outline');
    if (action === 'import-folder') { await saveRecording(); ctx.showFolderImport(); }
    if (action === 'upload-original') { await saveRecording(); ctx.showImport(); }
    if (action === 'save-outline-checks') {
      const checklist = readOutlineChecks();
      if ($('outlineText').value.trim() !== ctx.getProject().planning.outline.text || !outlineCurrent(ctx.getProject().planning)) await saveOutline();
      else stash();
      await update({ action: 'outline-checklist', outlineRevision: ctx.getProject().planning.outline.revision, checklist });
      toast('本版提纲的内容自检已保存。');
    }
    if (action === 'outline-approve' || action === 'outline-changes') {
      const note = $('outlineNote').value, checklist = readOutlineChecks();
      if (action === 'outline-changes' && !note.trim()) throw new Error('请先写下提纲修改意见。');
      if ($('outlineText').value.trim() !== ctx.getProject().planning.outline.text || !outlineCurrent(ctx.getProject().planning)) await saveOutline();
      else stash();
      await update({ action: 'outline-review', outlineRevision: ctx.getProject().planning.outline.revision, status: action === 'outline-approve' ? 'approved' : 'changes_requested', note, checklist }, 'outline');
      if (action === 'outline-approve') { ctx.selectStage(3); toast('提纲已通过，现在可以录制并上传原片。'); } else toast('修改意见已保存。可复制请求，让我修改提纲。');
    }
  }));
  $('topicValuesForm').onsubmit = safe(async event => {
    event.preventDefault();
    if (!editingTopic || ctx.getProject()?.id !== editingTopic.projectId) throw new Error('作品已变化，请重新打开选题补充。');
    const button = event.submitter; button.disabled = true;
    try {
      await update({ action: 'topic-values', topicId: editingTopic.topicId, topicRevision: editingTopic.topicRevision, ...Object.fromEntries(VALUE_FIELDS.map(([key]) => [key, $('topic-' + key).value])) });
      valueDialog.close(); toast('观众价值与真实切入点已保存。');
    } finally { button.disabled = false; }
  });
  $('handoffSubmit').onclick = safe(async () => {
    if (handoffMode === 'copy') {
      try { await navigator.clipboard.writeText($('handoffText').value); $('handoffSubmit').textContent = '已复制 · 可再次复制'; $('handoffHelp').textContent = '已复制，请粘贴到当前对话并发送。网页还没有自动发送消息。'; }
      catch { $('handoffText').focus(); $('handoffText').select(); $('handoffHelp').textContent = '请按 Ctrl+C 复制选中的请求，再粘贴到当前对话发送。'; }
      return;
    }
    let raw = $('handoffText').value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''), data;
    if (!raw) throw new Error('先粘贴回复内容。');
    if (resultKind === 'topics' || raw.startsWith('{')) { try { data = JSON.parse(raw); } catch { throw new Error('JSON 格式不正确，请复制完整回复中的 JSON 内容。'); } }
    if (resultKind === 'topics') await update({ action: 'topics', ideasRevision: data.ideasRevision, topics: data.topics });
    else { const p = ctx.getProject().planning; await update({ action: 'outline', topicId: data?.topicId || p.selectedTopicId, topicRevision: data?.topicRevision ?? p.topicRevision, text: data?.text ?? raw }, 'outline'); }
    dialog.close(); toast('回复已保存，现在可以在作品中审核。');
  });
  return { render, stash };
}
