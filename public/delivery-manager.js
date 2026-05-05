import { buildCaitAppContext, downloadContextJson, fetchCaitAppContextFromUrl, sendContextToCait } from './cait-app-bridge.js?v=20260505b';

let deliveries = [];
let selectedId = '';
let selectedFileIndex = 0;
let filter = 'all';
let activeTab = 'overview';
let searchText = '';
let importedContext = null;

const els = {
  filterButtons: [...document.querySelectorAll('[data-filter]')],
  tabButtons: [...document.querySelectorAll('[data-tab]')],
  tabPanels: {
    overview: document.getElementById('overviewPanel'),
    files: document.getElementById('filesPanel'),
    context: document.getElementById('contextPanel')
  },
  deliverySearchInput: document.getElementById('deliverySearchInput'),
  deliveryInboxMeta: document.getElementById('deliveryInboxMeta'),
  deliveryList: document.getElementById('deliveryList'),
  fileTable: document.getElementById('fileTable'),
  deliveryTitleInput: document.getElementById('deliveryTitleInput'),
  deliverySummaryInput: document.getElementById('deliverySummaryInput'),
  deliveryStatusPill: document.getElementById('deliveryStatusPill'),
  deliveryUpdatedMeta: document.getElementById('deliveryUpdatedMeta'),
  summaryCount: document.getElementById('summaryCount'),
  nextActionText: document.getElementById('nextActionText'),
  packageMetaText: document.getElementById('packageMetaText'),
  sourceMetaText: document.getElementById('sourceMetaText'),
  previewTitle: document.getElementById('previewTitle'),
  outputPreview: document.getElementById('outputPreview'),
  fileMetaText: document.getElementById('fileMetaText'),
  deliveryContextPreview: document.getElementById('deliveryContextPreview'),
  refreshDeliveriesBtn: document.getElementById('refreshDeliveriesBtn'),
  sendDeliveryContextBtn: document.getElementById('sendDeliveryContextBtn'),
  runFollowupBtn: document.getElementById('runFollowupBtn'),
  downloadJsonBtn: document.getElementById('downloadJsonBtn'),
  downloadSelectedBtn: document.getElementById('downloadSelectedBtn'),
  copySelectedBtn: document.getElementById('copySelectedBtn'),
  copyPreviewBtn: document.getElementById('copyPreviewBtn'),
  railDownloadBtn: document.getElementById('railDownloadBtn'),
  railCopyBtn: document.getElementById('railCopyBtn'),
  railJsonBtn: document.getElementById('railJsonBtn'),
  actionRailSummary: document.getElementById('actionRailSummary'),
  readinessScore: document.getElementById('readinessScore'),
  readinessMeter: document.getElementById('readinessMeter'),
  readinessList: document.getElementById('readinessList'),
  readinessNote: document.getElementById('readinessNote'),
  allCount: document.getElementById('allCount'),
  completedCount: document.getElementById('completedCount'),
  blockedCount: document.getElementById('blockedCount'),
  filesCount: document.getElementById('filesCount'),
  reusableCount: document.getElementById('reusableCount')
};

function selectedDelivery() {
  return deliveries.find((delivery) => delivery.id === selectedId) || deliveries[0] || null;
}

function deliverySearchBlob(delivery = {}) {
  return [
    delivery.title,
    delivery.status,
    delivery.summary,
    delivery.agentName,
    delivery.nextAction,
    ...(delivery.files || []).map((file) => `${file.name} ${file.type}`)
  ].join('\n').toLowerCase();
}

function filteredDeliveries() {
  let list = deliveries;
  if (filter === 'completed') list = list.filter((item) => item.status === 'completed');
  if (filter === 'blocked') list = list.filter((item) => /blocked|failed|timed_out|waiting/i.test(item.status));
  if (filter === 'files') list = list.filter((item) => (item.files || []).length);
  if (filter === 'reusable') list = list.filter((item) => item.summary || (item.files || []).length);
  const query = searchText.trim().toLowerCase();
  if (query) list = list.filter((item) => deliverySearchBlob(item).includes(query));
  return list;
}

function statusClass(value = '') {
  const safe = String(value || '').toLowerCase();
  if (/completed|ready|reusable/.test(safe)) return 'approved';
  if (/blocked|failed|timeout|waiting/.test(safe)) return 'blocked';
  return 'pending';
}

function statusLabel(value = '') {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'blocked') return 'waiting';
  if (safe === 'timed_out') return 'timed out';
  return String(value || '').trim() || 'unknown';
}

function compact(value = '', max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function fileSizeLabel(content = '') {
  const bytes = new Blob([String(content || '')]).size;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function normalizedDate(value = '') {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function normalizeJobDelivery(job = {}) {
  const output = job.output && typeof job.output === 'object' ? job.output : {};
  const files = Array.isArray(output.files) ? output.files : [];
  const createdAt = String(job.completedAt || job.updatedAt || job.createdAt || '');
  return {
    id: String(job.id || `job-${Date.now()}`),
    title: String(output.title || output.summary || job.task || `Order ${String(job.id || '').slice(0, 8)}` || 'Delivery'),
    status: String(job.status || 'updated'),
    summary: String(output.summary || output.text || job.failureReason || `Order ${String(job.id || '').slice(0, 8)} is ${job.status || 'updated'}.`),
    files: files.map((file, index) => ({
      name: String(file.name || file.filename || `delivery-${index + 1}.md`),
      type: String(file.type || file.mime || 'text/plain'),
      content: String(file.content || file.body || ''),
      updatedAt: createdAt
    })),
    nextAction: String(output.next_action || output.nextAction || 'Use this delivery as context for follow-up work.'),
    agentName: String(job.assignedAgentId || job.agentName || job.taskType || 'CAIt Agent'),
    updatedAt: createdAt,
    sourceLabel: 'Server job'
  };
}

function deliveryFromAppContext(context = {}) {
  const files = [
    ...(Array.isArray(context.delivery_files) ? context.delivery_files : []),
    ...(Array.isArray(context.artifacts) ? context.artifacts : [])
      .filter((artifact) => artifact?.content || artifact?.body || artifact?.markdown)
      .map((artifact, index) => ({
        name: artifact.name || artifact.title || `artifact-${index + 1}.md`,
        type: artifact.content_type || artifact.type || 'text/plain',
        content: artifact.content || artifact.body || artifact.markdown || ''
      }))
  ];
  return {
    id: String(context.id || `context-${Date.now()}`),
    title: String(context.title || 'Imported CAIt app context'),
    status: 'reusable',
    summary: String(context.summary || ''),
    files: files.map((file, index) => ({
      name: String(file.name || file.filename || `context-file-${index + 1}.md`),
      type: String(file.type || file.mime || file.content_type || 'text/plain'),
      content: String(file.content || file.body || ''),
      updatedAt: String(context.updated_at || context.updatedAt || '')
    })),
    nextAction: String((Array.isArray(context.recommended_next_actions) ? context.recommended_next_actions[0] : '') || 'Use this context for a follow-up order.'),
    agentName: String(context.source_app_label || context.source_app || 'CAIt app'),
    updatedAt: String(context.updated_at || context.updatedAt || ''),
    sourceLabel: 'App context',
    sourceContext: context
  };
}

function applyInboundContext(context = null) {
  if (!context) return false;
  importedContext = context;
  const delivery = deliveryFromAppContext(context);
  deliveries = [delivery];
  selectedId = delivery.id;
  selectedFileIndex = 0;
  return true;
}

async function refreshDeliveries() {
  els.refreshDeliveriesBtn.textContent = 'Refreshing';
  try {
    const response = await fetch('/api/jobs?limit=40', { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`jobs ${response.status}`);
    const data = await response.json();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    deliveries = jobs.map(normalizeJobDelivery).filter((item) => item.id);
    selectedId = deliveries[0]?.id || '';
    selectedFileIndex = 0;
  } catch {
    deliveries = [];
    selectedId = '';
    selectedFileIndex = 0;
  } finally {
    els.refreshDeliveriesBtn.textContent = 'Refresh';
    render();
  }
}

function saveEditor() {
  const delivery = selectedDelivery();
  if (!delivery) return;
  delivery.title = els.deliveryTitleInput.value.trim();
  delivery.summary = els.deliverySummaryInput.value.trim();
}

function buildContext() {
  const delivery = selectedDelivery();
  if (!delivery) {
    return buildCaitAppContext({
      source_app: 'delivery_manager',
      source_app_label: 'Delivery Manager',
      title: 'Delivery Manager context',
      summary: 'No delivery package is currently loaded. Refresh server jobs or open this app from a CAIt app context handoff.',
      facts: ['No delivery selected'],
      recommended_next_actions: ['Refresh server-side jobs or return to chat and select a delivery.'],
      handoff_targets: ['cmo_leader', 'seo_gap', 'build_team_leader']
    });
  }
  return buildCaitAppContext({
    source_app: 'delivery_manager',
    source_app_label: 'Delivery Manager',
    title: `Reusable delivery - ${delivery.title}`,
    summary: delivery.summary,
    facts: [
      importedContext ? `Imported context: ${importedContext.title || importedContext.id || 'CAIt app context'}` : '',
      `Delivery id: ${delivery.id}`,
      `Status: ${delivery.status}`,
      `Files: ${(delivery.files || []).length}`,
      delivery.updatedAt ? `Updated: ${delivery.updatedAt}` : ''
    ].filter(Boolean),
    assumptions: [
      importedContext ? 'Files and artifacts are loaded from a server-side CAIt app context.' : 'Files are loaded from server-side job output when available.',
      'Reusing a delivery creates a new CAIt context; it does not automatically execute follow-up work.'
    ],
    artifacts: [
      { type: 'delivery_package', id: delivery.id, status: delivery.status, summary: delivery.summary, next_action: delivery.nextAction }
    ],
    delivery_files: (delivery.files || []).map((file) => ({ name: file.name, type: file.type, content: file.content })),
    recommended_next_actions: [
      delivery.nextAction || 'Ask a leader to run follow-up with this delivery.',
      'Send to the appropriate app only after approval and connector state are visible.'
    ],
    handoff_targets: ['cmo_leader', 'seo_gap', 'build_team_leader'],
    raw_context: importedContext ? { received_context: importedContext } : {}
  });
}

function packageText(delivery = selectedDelivery()) {
  if (!delivery) return '';
  return [
    `# ${delivery.title || 'Delivery'}`,
    delivery.summary || '',
    delivery.nextAction ? `## Next action\n${delivery.nextAction}` : '',
    ...(delivery.files || []).map((file) => `\n## ${file.name}\n${file.content || ''}`)
  ].filter(Boolean).join('\n\n').trim();
}

function readinessItems(delivery = selectedDelivery()) {
  if (!delivery) {
    return [
      ['Delivery selected', false],
      ['Summary present', false],
      ['Status visible', false],
      ['Files attached', false],
      ['Next action captured', false],
      ['Reusable context built', false],
      ['No empty title', false]
    ];
  }
  const files = delivery?.files || [];
  const summary = String(delivery?.summary || '').trim();
  const context = buildContext();
  return [
    ['Summary present', Boolean(summary)],
    ['Delivery selected', Boolean(delivery?.id)],
    ['Status visible', Boolean(delivery?.status)],
    ['Files attached', files.length > 0],
    ['Next action captured', Boolean(String(delivery?.nextAction || '').trim())],
    ['Reusable context built', Boolean(context?.source_app === 'delivery_manager')],
    ['No empty title', Boolean(String(delivery?.title || '').trim())]
  ];
}

function renderCounts() {
  els.allCount.textContent = deliveries.length;
  els.completedCount.textContent = deliveries.filter((item) => item.status === 'completed').length;
  els.blockedCount.textContent = deliveries.filter((item) => /blocked|failed|timed_out|waiting/i.test(item.status)).length;
  els.filesCount.textContent = deliveries.filter((item) => (item.files || []).length).length;
  els.reusableCount.textContent = deliveries.filter((item) => item.summary || (item.files || []).length).length;
  const visible = filteredDeliveries().length;
  els.deliveryInboxMeta.textContent = `${visible} shown from ${deliveries.length} delivery package${deliveries.length === 1 ? '' : 's'}.`;
}

function renderList() {
  const list = filteredDeliveries();
  if (!list.some((item) => item.id === selectedId) && list[0]) {
    selectedId = list[0].id;
    selectedFileIndex = 0;
  }
  els.deliveryList.innerHTML = list.length ? list.map((delivery) => [
    `<button class="delivery-row ${delivery.id === selectedId ? 'active' : ''}" type="button" data-delivery="${escapeHtml(delivery.id)}">`,
    '<span>',
    `<strong>${escapeHtml(compact(delivery.title, 70))}</strong>`,
    `<small>${escapeHtml(compact(delivery.agentName || delivery.id, 64))}</small>`,
    '</span>',
    `<span class="status-pill ${statusClass(delivery.status)}">${escapeHtml(statusLabel(delivery.status))}</span>`,
    `<span class="delivery-file-count">${(delivery.files || []).length}</span>`,
    '</button>'
  ].join('')).join('') : [
    '<div class="delivery-empty">',
    '<strong>No matching delivery</strong>',
    '<span>Refresh jobs, clear search, or open this app from a CAIt context handoff.</span>',
    '</div>'
  ].join('');
}

function renderTabs() {
  els.tabButtons.forEach((button) => button.classList.toggle('active', button.dataset.tab === activeTab));
  Object.entries(els.tabPanels).forEach(([name, panel]) => {
    panel.classList.toggle('active', name === activeTab);
  });
}

function renderSelected() {
  const delivery = selectedDelivery();
  const files = delivery?.files || [];
  if (selectedFileIndex >= files.length) selectedFileIndex = 0;
  const selectedFile = files[selectedFileIndex] || null;
  const hasDelivery = Boolean(delivery);
  els.deliveryTitleInput.disabled = !hasDelivery;
  els.deliverySummaryInput.disabled = !hasDelivery;
  [
    els.sendDeliveryContextBtn,
    els.runFollowupBtn,
    els.downloadJsonBtn,
    els.downloadSelectedBtn,
    els.copySelectedBtn,
    els.copyPreviewBtn,
    els.railDownloadBtn,
    els.railCopyBtn,
    els.railJsonBtn
  ].forEach((button) => { button.disabled = !hasDelivery; });
  els.deliveryTitleInput.value = delivery?.title || 'No delivery selected';
  els.deliverySummaryInput.value = delivery?.summary || 'Refresh server jobs or open Delivery Manager from a CAIt context handoff to review reusable work.';
  els.deliveryStatusPill.textContent = hasDelivery ? statusLabel(delivery?.status || '') : 'waiting';
  els.deliveryStatusPill.className = `status-pill ${hasDelivery ? statusClass(delivery?.status || '') : 'pending'}`;
  els.deliveryUpdatedMeta.textContent = delivery?.updatedAt ? `Updated ${normalizedDate(delivery.updatedAt) || delivery.updatedAt}` : 'No timestamp';
  els.summaryCount.textContent = `${String(delivery?.summary || '').length.toLocaleString('en-US')} / 1000`;
  els.nextActionText.textContent = delivery?.nextAction || 'Load a delivery package before running follow-up.';
  els.packageMetaText.textContent = files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready` : 'No files attached';
  els.sourceMetaText.textContent = delivery?.sourceLabel || (importedContext ? 'App context' : 'Server jobs');
  els.previewTitle.textContent = selectedFile ? `Preview: ${selectedFile.name}` : 'Output preview';
  els.outputPreview.textContent = selectedFile?.content || delivery?.summary || 'No delivery output is available yet. Refresh jobs or return from chat with a completed delivery context.';
  els.fileMetaText.textContent = files.length ? `${files.length} file${files.length === 1 ? '' : 's'} in this package.` : 'No files loaded.';
  els.fileTable.innerHTML = files.length ? [
    '<thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Updated</th></tr></thead><tbody>',
    ...files.map((file, index) => [
      `<tr class="${index === selectedFileIndex ? 'active' : ''}" data-file-index="${index}">`,
      `<td><button class="file-pick-btn" type="button" data-file-index="${index}">${escapeHtml(file.name)}</button></td>`,
      `<td>${escapeHtml(file.type)}</td>`,
      `<td>${fileSizeLabel(file.content)}</td>`,
      `<td>${escapeHtml(normalizedDate(file.updatedAt) || '-')}</td>`,
      '</tr>'
    ].join('')),
    '</tbody>'
  ].join('') : '<tbody><tr><td>No files loaded.</td><td>-</td><td>-</td><td>-</td></tr></tbody>';
  els.actionRailSummary.textContent = delivery
    ? `Send "${compact(delivery.title, 58)}" to CAIt as context for the next order.`
    : 'No delivery is loaded yet. Refresh jobs or open this app from a completed CAIt delivery.';
}

function renderReadiness() {
  const items = readinessItems();
  const complete = items.filter(([, ok]) => ok).length;
  const total = items.length;
  els.readinessScore.textContent = `${complete} / ${total}`;
  els.readinessMeter.style.width = `${Math.round((complete / total) * 100)}%`;
  els.readinessList.innerHTML = items.map(([label, ok]) => [
    `<div class="readiness-item ${ok ? 'ready' : ''}">`,
    `<span>${ok ? 'Ready' : 'Missing'}</span>`,
    `<strong>${escapeHtml(label)}</strong>`,
    '</div>'
  ].join('')).join('');
  els.readinessNote.textContent = complete === total
    ? 'This delivery is ready to provide high-quality follow-up context.'
    : 'Complete the missing items before sending this package to a leader.';
}

function render() {
  renderCounts();
  renderList();
  renderTabs();
  renderSelected();
  renderReadiness();
  els.deliveryContextPreview.textContent = JSON.stringify(buildContext(), null, 2);
}

function downloadTextFile(name, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyPackage(button = els.copySelectedBtn) {
  await navigator.clipboard.writeText(packageText());
  const old = button.textContent;
  button.textContent = 'Copied';
  window.setTimeout(() => { button.textContent = old; }, 1200);
}

function downloadPackage() {
  const delivery = selectedDelivery();
  if (!delivery) return;
  const files = delivery.files || [];
  if (!files.length) {
    downloadTextFile(`${delivery.id || 'delivery'}-summary.md`, packageText(delivery));
    return;
  }
  for (const file of files) downloadTextFile(file.name, file.content || '', file.type || 'text/plain;charset=utf-8');
}

function downloadJson() {
  saveEditor();
  downloadContextJson(buildContext(), 'delivery-context.json');
}

function sendFollowup() {
  saveEditor();
  void sendContextToCait(buildContext()).catch((error) => {
    window.alert(`CAIt context handoff failed: ${error.message}`);
  });
}

els.filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    saveEditor();
    filter = String(button.dataset.filter || 'all');
    els.filterButtons.forEach((item) => item.classList.toggle('active', item === button));
    render();
  });
});

els.tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeTab = String(button.dataset.tab || 'overview');
    render();
  });
});

els.deliverySearchInput.addEventListener('input', () => {
  searchText = els.deliverySearchInput.value;
  render();
});

els.deliveryList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delivery]');
  if (!button) return;
  saveEditor();
  selectedId = String(button.dataset.delivery || selectedId);
  selectedFileIndex = 0;
  render();
});

els.fileTable.addEventListener('click', (event) => {
  const target = event.target.closest('[data-file-index]');
  if (!target) return;
  selectedFileIndex = Number(target.dataset.fileIndex || 0);
  activeTab = 'overview';
  render();
});

[els.deliveryTitleInput, els.deliverySummaryInput].forEach((input) => {
  input.addEventListener('input', () => {
    saveEditor();
    renderReadiness();
    els.deliveryContextPreview.textContent = JSON.stringify(buildContext(), null, 2);
    els.summaryCount.textContent = `${String(els.deliverySummaryInput.value || '').length.toLocaleString('en-US')} / 1000`;
  });
});

els.refreshDeliveriesBtn.addEventListener('click', refreshDeliveries);
els.sendDeliveryContextBtn.addEventListener('click', sendFollowup);
els.runFollowupBtn.addEventListener('click', sendFollowup);
els.downloadJsonBtn.addEventListener('click', downloadJson);
els.railJsonBtn.addEventListener('click', downloadJson);
els.downloadSelectedBtn.addEventListener('click', downloadPackage);
els.railDownloadBtn.addEventListener('click', downloadPackage);
els.copySelectedBtn.addEventListener('click', () => copyPackage(els.copySelectedBtn));
els.railCopyBtn.addEventListener('click', () => copyPackage(els.railCopyBtn));
els.copyPreviewBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(els.outputPreview.textContent || '');
  const old = els.copyPreviewBtn.textContent;
  els.copyPreviewBtn.textContent = 'Copied';
  window.setTimeout(() => { els.copyPreviewBtn.textContent = old; }, 1200);
});

async function bootstrap() {
  const imported = applyInboundContext(await fetchCaitAppContextFromUrl());
  if (imported) render();
  else await refreshDeliveries();
}

void bootstrap();

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
