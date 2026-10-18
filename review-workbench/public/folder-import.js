const $ = id => document.getElementById(id);
export const materialTime = v => v.material || v.mediaTime;
export function videoOrder(versions) {
  const cuts = versions.filter(v => v.stage !== 3).reverse();
  const originals = versions.filter(v => v.stage === 3).sort((a,b) => Date.parse(materialTime(a)?.sortAt || a.createdAt) - Date.parse(materialTime(b)?.sortAt || b.createdAt) || a.originalName.localeCompare(b.originalName, 'zh-CN', { numeric: true }));
  return [...cuts, ...originals];
}
export const materialDate = at => at ? new Date(at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '时间未知';

export function createFolderDialog(ctx) {
  const { api, esc, safe } = ctx;
  let scan, targetId, busy = false, stop = false, generation = 0, scanningId;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="folderDialog" class="folder-dialog"><form id="folderForm" class="dialog-content">
    <div class="dialog-heading"><div><span class="eyebrow">03 / IMPORT YOUR FOOTAGE</span><h2>整批原片，一次放进来。</h2></div><button type="button" class="icon-button" id="folderClose" aria-label="关闭文件夹导入">${ctx.icon('close')}</button></div>
    <p class="dialog-description" id="folderProject"></p>
    <label class="field-label" for="folderPath">本机文件夹路径</label><div class="folder-path-row"><input id="folderPath" required placeholder="例如：C:\\素材\\本期口播"><button class="button secondary" id="folderScan" type="submit">扫描文件夹</button></div>
    <label class="folder-check"><input type="checkbox" id="folderRecursive">包含子文件夹</label>
    <p class="field-help">支持 MP4 / MOV / M4V / WebM。只建立本地引用，原片保留在原处。拍摄元数据优先，缺失时用文件修改时间；所有时间显示为北京时间。</p>
    <div class="folder-feedback" id="folderFeedback" role="status" aria-live="polite">粘贴路径并扫描，先核对顺序，再批量导入。</div>
    <div id="folderPreview" hidden><div class="folder-preview-heading"><strong id="folderSummary"></strong><label class="folder-check"><input type="checkbox" id="folderSelectAll">全选可导入项</label></div><div class="folder-table-wrap"><table class="folder-table"><thead><tr><th>选取</th><th>视频文件</th><th>排序时间 / 来源</th><th>状态</th></tr></thead><tbody id="folderRows"></tbody></table></div><p class="field-help" id="folderWarnings"></p></div>
    <div class="dialog-footer"><span class="field-help">导入后进入“录制与素材”，原片按时间从早到晚排列。</span><button class="button secondary" type="button" id="folderStop" hidden>停止后续导入</button><button class="button primary" type="button" id="folderImport" disabled>按顺序导入所选</button></div>
  </form></dialog>`);
  function lock(value) {
    busy = value;
    for (const id of ['folderPath','folderRecursive','folderScan','folderSelectAll']) $(id).disabled = value;
    $('folderClose').disabled = value && Boolean(scan);
    $('folderRows').querySelectorAll('input').forEach(n => { n.disabled = value || n.dataset.blocked === 'true'; });
    $('folderImport').disabled = value || !selected().length;
  }
  function selected() { return scan?.entries.filter(e => e.selected && !e.error && !e.duplicate && e.result !== 'imported') || []; }
  function feedback(text, failed = false) { $('folderFeedback').textContent = text; $('folderFeedback').classList.toggle('failed', failed); }
  function render() {
    if (!scan) return;
    $('folderPreview').hidden = false;
    const missing = scan.entries.filter(e => !e.error && e.timeSource === 'modified').length;
    const duplicates = scan.entries.filter(e => e.duplicate).length;
    const errors = scan.entries.filter(e => e.error).length;
    $('folderSummary').textContent = `${scan.entries.length} 个视频 · ${missing} 个使用备用时间 · ${duplicates} 个已存在${errors ? ` · ${errors} 个不可读` : ''}`;
    $('folderRows').innerHTML = scan.entries.map(e => {
      const blocked = Boolean(e.error || e.duplicate || e.result === 'imported');
      const status = e.error || (e.result === 'imported' ? '已导入' : e.duplicate ? '已存在 · 跳过' : e.importError || (e.result === 'importing' ? '正在导入…' : '待导入'));
      return `<tr class="${e.error || e.importError ? 'folder-row-error' : ''}"><td><input type="checkbox" data-entry="${e.id}" data-blocked="${blocked}" aria-label="选择 ${esc(e.name)}" ${e.selected && !blocked ? 'checked' : ''} ${busy || blocked ? 'disabled' : ''}><small>${String(e.order).padStart(2, '0')}</small></td><td><strong title="${esc(e.filePath)}">${esc(e.relativePath)}</strong><small>${((e.size || 0) / 1024 ** 2).toFixed(1)} MB${e.duration ? ' · ' + Math.round(e.duration) + ' 秒' : ''}</small></td><td><span>${esc(e.sortAt ? materialDate(e.sortAt) : '—')}</span><small class="${e.timeSource === 'modified' ? 'fallback-time' : ''}">${esc(e.timeLabel || '未读取')}${e.timezoneAssumed ? ' · 无时区，按北京解释' : ''}${e.warning ? ' · ' + esc(e.warning) : ''}</small></td><td><span class="folder-item-status" data-status-entry="${e.id}">${esc(status)}</span></td></tr>`;
    }).join('') || '<tr><td colspan="4">没有找到支持的视频文件。可以勾选“包含子文件夹”后重新扫描。</td></tr>';
    $('folderWarnings').textContent = `按时间从早到晚排序，同一时间按文件名排序。${missing ? '备用时间可能是拷贝或编辑日期，请核对。' : ''}视频内的创建时间也可能来自导出软件。${scan.ignoredFiles ? `已忽略 ${scan.ignoredFiles} 个其他文件。` : ''}${scan.skippedLinks ? `已跳过 ${scan.skippedLinks} 个链接。` : ''}${scan.warnings.join('；')}`;
    updateSelection();
  }
  function updateSelection() {
    const candidates = scan?.entries.filter(e => !e.error && !e.duplicate && e.result !== 'imported') || [], count = selected().length;
    $('folderSelectAll').checked = Boolean(candidates.length && count === candidates.length);
    $('folderSelectAll').indeterminate = count > 0 && count < candidates.length;
    $('folderImport').textContent = count ? `按顺序导入 ${count} 个视频` : '按顺序导入所选';
    $('folderImport').disabled = busy || count === 0;
  }
  function invalidate() { if (!busy) { generation++; scan = null; $('folderPreview').hidden = true; $('folderImport').disabled = true; feedback('路径或范围已改变，请重新扫描。'); } }
  $('folderPath').oninput = $('folderRecursive').onchange = invalidate;
  $('folderRows').onchange = e => { const entry = scan?.entries.find(item => item.id === e.target.dataset.entry); if (entry) { entry.selected = e.target.checked; updateSelection(); } };
  $('folderSelectAll').onchange = () => { for (const entry of scan.entries) if (!entry.error && !entry.duplicate && entry.result !== 'imported') entry.selected = $('folderSelectAll').checked; render(); };
  async function close() {
    if (busy && scan) return;
    generation++;
    if (busy && scanningId) await api(`/api/projects/${targetId}/folder-scan/${scanningId}`, { method: 'DELETE' }).catch(() => {});
    lock(false); $('folderDialog').close();
  }
  $('folderClose').onclick = safe(close);
  $('folderDialog').addEventListener('cancel', e => { e.preventDefault(); void close(); });
  $('folderForm').onsubmit = safe(async event => {
    event.preventDefault(); if (busy) return;
    scan = null; scanningId = null; $('folderPreview').hidden = true; lock(true); const token = ++generation;
    feedback('正在扫描文件夹并读取拍摄时间…');
    try {
      const started = await api(`/api/projects/${targetId}/folder-scan`, { method: 'POST', body: JSON.stringify({ folderPath: $('folderPath').value, includeSubfolders: $('folderRecursive').checked }) });
      scanningId = started.scan.id;
      if (token !== generation) { await api(`/api/projects/${targetId}/folder-scan/${scanningId}`, { method: 'DELETE' }); return; }
      while (token === generation) {
        const result = await api(`/api/projects/${targetId}/folder-scan/${started.scan.id}`);
        if (result.scan.status === 'failed') throw new Error(result.scan.error);
        if (result.scan.status === 'cancelled') throw new Error('扫描已停止，请重新扫描文件夹。');
        if (result.scan.status === 'ready') { scan = result.scan; scan.entries.forEach(e => { e.selected = !e.error && !e.duplicate; }); render(); feedback('清单已就绪，请核对时间来源与顺序，再导入。'); break; }
        feedback(`正在读取拍摄时间 ${result.scan.processed} / ${result.scan.total || '…'}，可继续在对话中交流。`);
        await new Promise(resolve => setTimeout(resolve, 700));
      }
    } catch (e) { if (token === generation) feedback(e.message, true); }
    finally { if (token === generation) lock(false); }
  });
  $('folderStop').onclick = () => { stop = true; $('folderStop').disabled = true; feedback('正在完成当前文件，随后停止。已导入的素材会保留。'); };
  $('folderImport').onclick = safe(async () => {
    if (busy) return;
    const entries = selected(); if (!entries.length) return;
    lock(true); stop = false; $('folderStop').hidden = false; $('folderStop').disabled = false;
    let imported = 0, skipped = 0, failed = 0, firstVersion;
    try {
      for (let i = 0; i < entries.length && !stop; i++) {
        const entry = entries[i]; entry.result = 'importing'; entry.importError = ''; render();
        feedback(`正在导入 ${i + 1} / ${entries.length}：${entry.name}`);
        try {
          const result = await api(`/api/projects/${targetId}/folder-import`, { method: 'POST', body: JSON.stringify({ scanId: scan.id, entryId: entry.id }) });
          entry.selected = false;
          if (result.skipped) { entry.duplicate = true; entry.result = 'skipped'; skipped++; }
          else { entry.result = 'imported'; imported++; firstVersion ||= result.version.id; }
        } catch (e) { entry.result = 'failed'; entry.importError = e.message; failed++; }
        render();
      }
      feedback(`${stop ? '已停止后续导入。' : '本轮完成。'}成功 ${imported} 个，跳过 ${skipped} 个，失败 ${failed} 个。${failed ? '失败项保留在清单，可重试；文件变化请重新扫描。' : ''}`, failed > 0);
      await ctx.reload(firstVersion);
    } finally { $('folderStop').hidden = true; lock(false); render(); }
  });
  window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
  return {
    show() {
      const project = ctx.getProject(); if (!project) return;
      targetId = project.id; scan = null; generation++;
      $('folderProject').textContent = `导入到「${project.title}」 · 原始素材`;
      $('folderPreview').hidden = true; $('folderImport').disabled = true;
      feedback('粘贴路径并扫描，先核对顺序，再批量导入。'); $('folderDialog').showModal();
    }
  };
}
