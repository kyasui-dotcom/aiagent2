import { buildCaitAppContext, downloadContextJson, fetchCaitAppContextFromUrl, sendContextToCait } from './cait-app-bridge.js?v=20260505b';

let deliveries = [];
let selectedId = '';
let filter = 'all';
let importedContext = null;

const els = {
  filterButtons: [...document.querySelectorAll('[data-filter]')],
  deliveryList: document.getElementById('deliveryList'),
  fileTable: document.getElementById('fileTable'),
  deliveryTitleInput: document.getElementById('deliveryTitleInput'),
  deliverySummaryInput: document.getElementById('deliverySummaryInput'),
  deliveryStatusPill: document.getElementById('deliveryStatusPill'),
  deliveryContextPreview: document.getElementById('deliveryContextPreview'),
  refreshDeliveriesBtn: document.getElementById('refreshDeliveriesBtn'),
  sendDeliveryContextBtn: document.getElementById('sendDeliveryContextBtn'),
  runFollowupBtn: document.getElementById('runFollowupBtn'),
  downloadJsonBtn: document.getElementById('downloadJsonBtn'),
  downloadSelectedBtn: document.getElementById('downloadSelectedBtn'),
  copySelectedBtn: document.getElementById('copySelectedBtn'),
  allCount: document.getElementById('allCount'),
  completedCount: document.getElementById('completedCount'),
  blockedCount: document.getElementById('blockedCount'),
  filesCount: document.getElementById('filesCount'),
  reusableCount: document.getElementById('reusableCount')
};

function selectedDelivery() {
  return deliveries.find((delivery) => delivery.id === selectedId) || deliveries[0] || null;
}

function visibleDeliveries() {
  if (filter === 'completed') return deliveries.filter((item) => item.status === 'completed');
  if (filter === 'blocked') return deliveries.filter((item) => item.status === 'blocked');
  if (filter === 'files') return deliveries.filter((item) => (item.files || []).length);
  if (filter === 'reusable') return deliveries.filter((item) => item.summary || (item.files || []).length);
  return deliveries;
}

function statusClass(value = '') {
  const safe = String(value || '').toLowerCase();
  if (/completed|ready/.test(safe)) return 'approved';
  if (/blocked|failed|timeout/.test(safe)) return 'blocked';
  return 'pending';
}

function statusLabel(value = '') {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'blocked') return 'waiting';
  if (safe === 'timed_out') return 'timed out';
  return String(value || '').trim() || 'unknown';
}

function normalizeJobDelivery(job = {}) {
  const output = job.output && typeof job.output === 'object' ? job.output : {};
  const files = Array.isArray(output.files) ? output.files : [];
  return {
    id: String(job.id || `job-${Date.now()}`),
    title: String(output.title || output.summary || job.task || `Order ${String(job.id || '').slice(0, 8)}` || 'Delivery'),
    status: String(job.status || 'updated'),
    summary: String(output.summary || output.text || job.failureReason || `Order ${String(job.id || '').slice(0, 8)} is ${job.status || 'updated'}.`),
    files: files.map((file, index) => ({
      name: String(file.name || file.filename || `delivery-${index + 1}.md`),
      type: String(file.type || file.mime || 'text/plain'),
      content: String(file.content || file.body || '')
    })),
    nextAction: String(output.next_action || output.nextAction || 'Use this delivery as context for follow-up work.')
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
      content: String(file.content || file.body || '')
    })),
    nextAction: String((Array.isArray(context.recommended_next_actions) ? context.recommended_next_actions[0] : '') || 'Use this context for a follow-up order.'),
    sourceContext: context
  };
}

function applyInboundContext(context = null) {
  if (!context) return false;
  importedContext = context;
  const delivery = deliveryFromAppContext(context);
  deliveries = [delivery];
  selectedId = delivery.id;
  return true;
}

async function refreshDeliveries() {
  els.refreshDeliveriesBtn.textContent = 'Refreshing';
  try {
    const response = await fetch('/api/jobs?limit=30', { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`jobs ${response.status}`);
    const data = await response.json();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    deliveries = jobs.map(normalizeJobDelivery).filter((item) => item.id);
    selectedId = deliveries[0]?.id || '';
  } catch {
    deliveries = [];
    selectedId = '';
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
      `Files: ${(delivery.files || []).length}`
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

function renderCounts() {
  els.allCount.textContent = deliveries.length;
  els.completedCount.textContent = deliveries.filter((item) => item.status === 'completed').length;
  els.blockedCount.textContent = deliveries.filter((item) => item.status === 'blocked').length;
  els.filesCount.textContent = deliveries.filter((item) => (item.files || []).length).length;
  els.reusableCount.textContent = deliveries.filter((item) => item.summary || (item.files || []).length).length;
}

function renderList() {
  const list = visibleDeliveries();
  if (!list.some((item) => item.id === selectedId) && list[0]) selectedId = list[0].id;
  els.deliveryList.innerHTML = list.length ? list.map((delivery) => [
    `<button class="item-row ${delivery.id === selectedId ? 'active' : ''}" type="button" data-delivery="${escapeHtml(delivery.id)}">`,
    `<strong>${escapeHtml(delivery.title)}</strong>`,
    `<span>${escapeHtml(delivery.id)} · ${(delivery.files || []).length} files</span>`,
    `<span class="status-pill ${statusClass(delivery.status)}">${escapeHtml(statusLabel(delivery.status))}</span>`,
    '</button>'
  ].join('')).join('') : '<div class="item-row"><strong>No server delivery loaded</strong><span>Refresh jobs or open this app from a CAIt context handoff.</span></div>';
}

function renderSelected() {
  const delivery = selectedDelivery();
  els.deliveryTitleInput.value = delivery?.title || '';
  els.deliverySummaryInput.value = delivery?.summary || '';
  els.deliveryStatusPill.textContent = statusLabel(delivery?.status || '');
  els.deliveryStatusPill.className = `status-pill ${statusClass(delivery?.status || '')}`;
  const files = delivery?.files || [];
  els.fileTable.innerHTML = files.length ? [
    '<thead><tr><th>File</th><th>Type</th><th>Size</th></tr></thead><tbody>',
    ...files.map((file) => `<tr><td><strong>${escapeHtml(file.name)}</strong></td><td>${escapeHtml(file.type)}</td><td>${String(file.content || '').length.toLocaleString('en-US')} chars</td></tr>`),
    '</tbody>'
  ].join('') : '<tbody><tr><td>No files loaded.</td><td>-</td><td>-</td></tr></tbody>';
}

function render() {
  renderCounts();
  renderList();
  renderSelected();
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

els.filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    saveEditor();
    filter = String(button.dataset.filter || 'all');
    els.filterButtons.forEach((item) => item.classList.toggle('active', item === button));
    render();
  });
});

els.deliveryList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delivery]');
  if (!button) return;
  saveEditor();
  selectedId = String(button.dataset.delivery || selectedId);
  render();
});

[els.deliveryTitleInput, els.deliverySummaryInput].forEach((input) => {
  input.addEventListener('input', () => {
    saveEditor();
    els.deliveryContextPreview.textContent = JSON.stringify(buildContext(), null, 2);
  });
});

els.refreshDeliveriesBtn.addEventListener('click', refreshDeliveries);
els.sendDeliveryContextBtn.addEventListener('click', () => {
  saveEditor();
  void sendContextToCait(buildContext()).catch((error) => {
    window.alert(`CAIt context handoff failed: ${error.message}`);
  });
});
els.runFollowupBtn.addEventListener('click', () => {
  saveEditor();
  void sendContextToCait(buildContext()).catch((error) => {
    window.alert(`CAIt context handoff failed: ${error.message}`);
  });
});
els.downloadJsonBtn.addEventListener('click', () => {
  saveEditor();
  downloadContextJson(buildContext(), 'delivery-context.json');
});
els.downloadSelectedBtn.addEventListener('click', () => {
  const delivery = selectedDelivery();
  for (const file of delivery?.files || []) downloadTextFile(file.name, file.content || '', file.type || 'text/plain;charset=utf-8');
});
els.copySelectedBtn.addEventListener('click', async () => {
  const delivery = selectedDelivery();
  const text = [delivery?.title || '', delivery?.summary || '', ...(delivery?.files || []).map((file) => `\n# ${file.name}\n${file.content || ''}`)].join('\n\n').trim();
  await navigator.clipboard.writeText(text);
  els.copySelectedBtn.textContent = 'Copied';
  window.setTimeout(() => { els.copySelectedBtn.textContent = 'Copy selected'; }, 1200);
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
