import { buildCaitAppContext, copyContextJson, fetchCaitAppContextFromUrl, sendContextToCait } from './cait-app-bridge.js?v=20260505b';

let leads = [];
let selectedId = '';
let filter = 'all';
let importedContext = null;

const els = {
  statusButtons: [...document.querySelectorAll('[data-status]')],
  leaderSelect: document.getElementById('leaderSelect'),
  markDraftBtn: document.getElementById('markDraftBtn'),
  leadTable: document.getElementById('leadTable'),
  leadNameInput: document.getElementById('leadNameInput'),
  leadSourceInput: document.getElementById('leadSourceInput'),
  emailSubjectInput: document.getElementById('emailSubjectInput'),
  emailBodyInput: document.getElementById('emailBodyInput'),
  leadStatusPill: document.getElementById('leadStatusPill'),
  leadContextPreview: document.getElementById('leadContextPreview'),
  sendLeadContextBtn: document.getElementById('sendLeadContextBtn'),
  copyLeadContextBtn: document.getElementById('copyLeadContextBtn'),
  leadTotalMetric: document.getElementById('leadTotalMetric'),
  leadDraftMetric: document.getElementById('leadDraftMetric'),
  leadApprovedMetric: document.getElementById('leadApprovedMetric'),
  leadBlockedMetric: document.getElementById('leadBlockedMetric'),
  leadAllNavCount: document.getElementById('leadAllNavCount'),
  leadReviewNavCount: document.getElementById('leadReviewNavCount'),
  leadDraftNavCount: document.getElementById('leadDraftNavCount'),
  leadApprovedNavCount: document.getElementById('leadApprovedNavCount'),
  leadBlockedNavCount: document.getElementById('leadBlockedNavCount')
};

function selectedLead() {
  return leads.find((lead) => lead.id === selectedId) || leads[0] || null;
}

function visibleLeads() {
  if (filter === 'all') return leads;
  return leads.filter((lead) => lead.status === filter);
}

function statusClass(value = '') {
  const safe = String(value || '').toLowerCase();
  if (/approved|draft/.test(safe)) return 'approved';
  if (/blocked/.test(safe)) return 'blocked';
  return 'pending';
}

function artifactRows(context = {}, type = '') {
  const match = (Array.isArray(context.artifacts) ? context.artifacts : [])
    .find((artifact) => String(artifact?.type || '').toLowerCase() === String(type || '').toLowerCase());
  return Array.isArray(match?.rows) ? match.rows : [];
}

function applyInboundContext(context = null) {
  if (!context) return;
  importedContext = context;
  const leadRows = artifactRows(context, 'lead_rows');
  const emailDraft = (Array.isArray(context.artifacts) ? context.artifacts : [])
    .find((artifact) => String(artifact?.type || '').toLowerCase() === 'email_draft') || {};
  const importedLeads = leadRows.map((row, index) => ({
    id: String(row.id || `imported-lead-${index + 1}`),
    company: String(row.company || row.company_name || row.name || `Imported lead ${index + 1}`),
    segment: String(row.segment || row.persona || row.category || 'Imported lead'),
    evidenceUrl: String(row.evidenceUrl || row.evidence_url || row.source_url || row.contact_source_url || row.url || ''),
    fit: String(row.fit || row.why_fit || row.observed_signal || ''),
    status: String(row.status || row.review_status || 'review'),
    owner: String(row.owner || row.agent || 'CAIt'),
    nextAction: String(row.nextAction || row.next_action || row.review_note || 'Review source evidence and approval state.'),
    subject: String(row.subject || ''),
    body: String(row.body || '')
  }));
  if (!importedLeads.length) {
    importedLeads.push({
      id: String(context.id || 'imported-lead-context'),
      company: String(context.title || 'Imported CAIt lead context'),
      segment: String(context.source_app_label || context.source_app || 'Imported context'),
      evidenceUrl: '',
      fit: String(context.summary || ''),
      status: 'review',
      owner: 'CAIt',
      nextAction: 'Review the imported context and create lead rows only from public evidence.',
      subject: '',
      body: ''
    });
  }
  if (emailDraft?.lead_id || emailDraft?.subject || emailDraft?.body) {
    const target = importedLeads.find((lead) => lead.id === String(emailDraft.lead_id || '')) || importedLeads[0];
    target.subject = String(emailDraft.subject || target.subject || '');
    target.body = String(emailDraft.body || target.body || '');
    target.status = String(emailDraft.status || target.status || 'draft');
  }
  leads = importedLeads;
  selectedId = leads[0]?.id || '';
  const target = (Array.isArray(context.handoff_targets) ? context.handoff_targets : []).find(Boolean);
  if (target && [...els.leaderSelect.options].some((option) => option.value === target)) els.leaderSelect.value = target;
}

function saveEditor() {
  const lead = selectedLead();
  if (!lead) return;
  lead.company = els.leadNameInput.value.trim();
  lead.evidenceUrl = els.leadSourceInput.value.trim();
  lead.subject = els.emailSubjectInput.value.trim();
  lead.body = els.emailBodyInput.value.trim();
}

function buildContext() {
  const target = String(els.leaderSelect.value || 'cmo_leader');
  const lead = selectedLead();
  if (!lead) {
    return buildCaitAppContext({
      source_app: 'lead_ops_console',
      source_app_label: 'Lead Ops Console',
      title: 'Lead Ops context',
      summary: 'No lead rows are loaded yet. Open this app from a CAIt context handoff before preparing outreach or email drafts.',
      facts: ['No lead rows, evidence URLs, or email drafts are loaded.'],
      assumptions: ['No built-in demo lead data is used.', 'This app does not send email. It prepares reviewable lead rows and draft copy only.'],
      recommended_next_actions: ['Load a CAIt app context that contains lead_rows or ask List Creator / CMO Leader to produce public-source rows.'],
      handoff_targets: [target, 'list_creator', 'email_ops']
    });
  }
  return buildCaitAppContext({
    source_app: 'lead_ops_console',
    source_app_label: 'Lead Ops Console',
    title: `Lead Ops packet - ${lead.company}`,
    summary: `Lead packet for ${lead.company}. Status is ${lead.status}. Email draft is prepared only as a draft; external sending still requires approval and connector proof.`,
    facts: [
      importedContext ? `Imported context: ${importedContext.title || importedContext.id || 'CAIt app context'}` : '',
      `Selected lead: ${lead.company}`,
      `Segment: ${lead.segment}`,
      `Evidence URL: ${lead.evidenceUrl || 'missing'}`,
      `Status: ${lead.status}`,
      `Next action: ${lead.nextAction}`
    ].filter(Boolean),
    assumptions: [
      'No guessed personal emails are used.',
      'This app does not send email. It prepares reviewable lead rows and draft copy only.'
    ],
    artifacts: [
      { type: 'lead_rows', rows: leads.map(({ id, company, segment, evidenceUrl, fit, status, owner, nextAction }) => ({ id, company, segment, evidenceUrl, fit, status, owner, nextAction })) },
      { type: 'email_draft', lead_id: lead.id, subject: lead.subject, body: lead.body, status: lead.status }
    ],
    approval_requests: [
      { id: `email-${lead.id}`, title: `Email draft for ${lead.company}`, action_type: 'email_draft', status: lead.status === 'approved' ? 'approved' : 'needs approval', target: lead.company }
    ],
    recommended_next_actions: [
      'Ask CMO Leader to choose whether this lead belongs in outreach, partner listing, or content collaboration.',
      'Route approved email drafts into Publisher & Approval Studio before external send.',
      'Block any row without a public source URL or consent-safe contact path.'
    ],
    handoff_targets: [target, 'list_creator', 'email_ops'],
    raw_context: importedContext ? { received_context: importedContext } : {}
  });
}

function renderMetrics() {
  els.leadTotalMetric.textContent = leads.length;
  els.leadDraftMetric.textContent = leads.filter((lead) => lead.status === 'draft').length;
  els.leadApprovedMetric.textContent = leads.filter((lead) => lead.status === 'approved').length;
  els.leadBlockedMetric.textContent = leads.filter((lead) => lead.status === 'blocked').length;
  els.leadAllNavCount.textContent = String(leads.length);
  els.leadReviewNavCount.textContent = String(leads.filter((lead) => lead.status === 'review').length);
  els.leadDraftNavCount.textContent = String(leads.filter((lead) => lead.status === 'draft').length);
  els.leadApprovedNavCount.textContent = String(leads.filter((lead) => lead.status === 'approved').length);
  els.leadBlockedNavCount.textContent = String(leads.filter((lead) => lead.status === 'blocked').length);
}

function renderTable() {
  const rows = visibleLeads();
  if (!rows.some((lead) => lead.id === selectedId) && rows[0]) selectedId = rows[0].id;
  els.leadTable.innerHTML = rows.length ? [
    '<thead><tr><th>Lead</th><th>Segment</th><th>Status</th><th>Next action</th></tr></thead><tbody>',
    ...rows.map((lead) => `<tr data-lead="${escapeHtml(lead.id)}"><td><strong>${escapeHtml(lead.company)}</strong><br>${escapeHtml(lead.evidenceUrl || 'missing source')}</td><td>${escapeHtml(lead.segment)}</td><td><span class="status-pill ${statusClass(lead.status)}">${escapeHtml(lead.status)}</span></td><td>${escapeHtml(lead.nextAction)}</td></tr>`),
    '</tbody>'
  ].join('') : '<tbody><tr><td>No lead rows loaded.</td><td>-</td><td>-</td><td>Open this app from a CAIt context handoff.</td></tr></tbody>';
}

function renderEditor() {
  const lead = selectedLead();
  els.leadNameInput.value = lead?.company || '';
  els.leadSourceInput.value = lead?.evidenceUrl || '';
  els.emailSubjectInput.value = lead?.subject || '';
  els.emailBodyInput.value = lead?.body || '';
  els.leadStatusPill.textContent = lead?.status || 'no rows';
  els.leadStatusPill.className = `status-pill ${statusClass(lead?.status || '')}`;
}

function render() {
  renderMetrics();
  renderTable();
  renderEditor();
  els.leadContextPreview.textContent = JSON.stringify(buildContext(), null, 2);
}

els.statusButtons.forEach((button) => {
  button.addEventListener('click', () => {
    saveEditor();
    filter = String(button.dataset.status || 'all');
    els.statusButtons.forEach((item) => item.classList.toggle('active', item === button));
    render();
  });
});

els.leadTable.addEventListener('click', (event) => {
  const row = event.target.closest('[data-lead]');
  if (!row) return;
  saveEditor();
  selectedId = String(row.dataset.lead || selectedId);
  render();
});

[els.leadNameInput, els.leadSourceInput, els.emailSubjectInput, els.emailBodyInput, els.leaderSelect].forEach((input) => {
  input.addEventListener('input', () => {
    saveEditor();
    els.leadContextPreview.textContent = JSON.stringify(buildContext(), null, 2);
  });
});

els.markDraftBtn.addEventListener('click', () => {
  saveEditor();
  if (selectedLead()) selectedLead().status = 'draft';
  render();
});

els.sendLeadContextBtn.addEventListener('click', () => {
  saveEditor();
  void sendContextToCait(buildContext()).catch((error) => {
    window.alert(`CAIt context handoff failed: ${error.message}`);
  });
});

els.copyLeadContextBtn.addEventListener('click', async () => {
  saveEditor();
  await copyContextJson(buildContext());
  els.copyLeadContextBtn.textContent = 'Copied';
  window.setTimeout(() => { els.copyLeadContextBtn.textContent = 'Copy context'; }, 1200);
});

async function bootstrap() {
  applyInboundContext(await fetchCaitAppContextFromUrl());
  render();
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
