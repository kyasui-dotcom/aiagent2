const $ = (id) => document.getElementById(id);
const els = {
  stream: $('stream'),
  activeJobs: $('activeJobs'),
  onlineAgents: $('onlineAgents'),
  grossVolume: $('grossVolume'),
  platformRevenue: $('platformRevenue'),
  todayCost: $('todayCost'),
  failedJobs: $('failedJobs'),
  storageBadge: $('storageBadge'),
  storageDetail: $('storageDetail'),
  agentsTable: $('agentsTable'),
  jobsTable: $('jobsTable'),
  billingTable: $('billingTable'),
  jobDetail: $('jobDetail'),
  flash: $('flash'),
  seedBtn: $('seedBtn'),
  refreshBtn: $('refreshBtn'),
  registerAgentBtn: $('registerAgentBtn'),
  importManifestBtn: $('importManifestBtn'),
  importUrlBtn: $('importUrlBtn'),
  createJobBtn: $('createJobBtn'),
  manualExampleBtn: $('manualExampleBtn'),
  manifestExampleBtn: $('manifestExampleBtn'),
  manifestFormatBtn: $('manifestFormatBtn'),
  urlExampleBtn: $('urlExampleBtn'),
  jobResearchExampleBtn: $('jobResearchExampleBtn'),
  jobCodeExampleBtn: $('jobCodeExampleBtn'),
  jobFailExampleBtn: $('jobFailExampleBtn'),
  agentName: $('agentName'),
  agentDesc: $('agentDesc'),
  agentTasks: $('agentTasks'),
  agentPremium: $('agentPremium'),
  agentBasic: $('agentBasic'),
  manifestJson: $('manifestJson'),
  manifestUrl: $('manifestUrl'),
  jobParent: $('jobParent'),
  jobType: $('jobType'),
  jobPrompt: $('jobPrompt'),
  jobBudget: $('jobBudget'),
  jobDeadline: $('jobDeadline'),
  jobMode: $('jobMode')
};

const state = { snapshot: null };

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function yen(value) {
  return `¥${Number(value || 0).toFixed(1)}`;
}

function setDetail(value) {
  els.jobDetail.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function flash(message, kind = 'ok') {
  els.flash.hidden = false;
  els.flash.textContent = message;
  els.flash.className = `box flash ${kind}`;
}

function clearFlash() {
  els.flash.hidden = true;
  els.flash.textContent = '';
  els.flash.className = 'box flash';
}

function renderStream(events) {
  els.stream.innerHTML = '';
  events.slice(-60).forEach((event) => {
    const row = document.createElement('div');
    row.className = 'log';
    row.innerHTML = `<span class="ts">${new Date(event.ts).toLocaleTimeString('ja-JP')}</span><span class="${event.type}">[${event.type}]</span> ${event.message}`;
    els.stream.appendChild(row);
  });
}

function renderAgents(agents) {
  els.agentsTable.innerHTML = `<div class="table-header agents-grid"><div>NAME</div><div>TASKS</div><div>PREM</div><div>SUCCESS</div><div>STATUS</div><div>EARNINGS</div></div>${agents.map((agent) => `
    <div class="table-row agents-grid" data-agent-id="${agent.id}">
      <div>${agent.name}<div class="row-muted">${agent.owner || '-'}</div></div>
      <div>${agent.taskTypes.join(', ')}</div>
      <div>${Math.round(agent.premiumRate * 100)}%</div>
      <div>${Math.round(agent.successRate * 100)}%</div>
      <div class="${agent.online ? 'online' : 'failed'}">${agent.online ? 'ONLINE' : 'OFFLINE'}</div>
      <div>${yen(agent.earnings)}</div>
    </div>`).join('')}`;
  [...els.agentsTable.querySelectorAll('[data-agent-id]')].forEach((row) => {
    row.onclick = () => {
      const agent = agents.find((item) => item.id === row.dataset.agentId);
      setDetail(agent);
    };
  });
}

function renderJobs(jobs) {
  els.jobsTable.innerHTML = `<div class="table-header jobs-grid"><div>JOB</div><div>TYPE</div><div>STATUS</div><div>AGENT</div><div>SCORE</div><div>CREATED</div></div>${jobs.map((job) => `
    <div class="table-row jobs-grid" data-job-id="${job.id}">
      <div>${job.id.slice(0, 8)}</div>
      <div>${job.taskType}</div>
      <div class="${job.status}">${job.status.toUpperCase()}</div>
      <div>${job.assignedAgentId ? job.assignedAgentId.slice(0, 14) : '-'}</div>
      <div>${job.score ?? '-'}</div>
      <div>${new Date(job.createdAt).toLocaleString('ja-JP')}</div>
    </div>`).join('')}`;
  [...els.jobsTable.querySelectorAll('[data-job-id]')].forEach((row) => {
    row.onclick = () => {
      const job = jobs.find((item) => item.id === row.dataset.jobId);
      setDetail(job);
    };
  });
}

function renderBilling(jobs) {
  const billed = jobs.filter((job) => job.actualBilling);
  if (!billed.length) {
    els.billingTable.innerHTML = '<div class="empty">No billed jobs yet.</div>';
    return;
  }
  els.billingTable.innerHTML = `<div class="table-header billing-grid"><div>JOB</div><div>STATUS</div><div>API</div><div>PAYOUT</div><div>PLATFORM</div><div>TOTAL</div></div>${billed.map((job) => `
    <div class="table-row billing-grid" data-bill-id="${job.id}">
      <div>${job.id.slice(0, 8)}</div>
      <div class="${job.status}">${job.status.toUpperCase()}</div>
      <div>${yen(job.actualBilling.apiCost)}</div>
      <div>${yen(job.actualBilling.agentPayout)}</div>
      <div>${yen(job.actualBilling.platformRevenue)}</div>
      <div>${yen(job.actualBilling.total)}</div>
    </div>`).join('')}`;
  [...els.billingTable.querySelectorAll('[data-bill-id]')].forEach((row) => {
    row.onclick = () => {
      const job = jobs.find((item) => item.id === row.dataset.billId);
      setDetail({ jobId: job.id, status: job.status, usage: job.usage, billing: job.actualBilling, output: job.output });
    };
  });
}

function render(snapshot) {
  state.snapshot = snapshot;
  const { stats, agents, jobs, events, storage } = snapshot;
  els.activeJobs.textContent = stats.activeJobs;
  els.onlineAgents.textContent = stats.onlineAgents;
  els.grossVolume.textContent = yen(stats.grossVolume);
  els.platformRevenue.textContent = yen(stats.platformRevenue);
  els.todayCost.textContent = yen(stats.todayCost);
  els.failedJobs.textContent = stats.failedJobs;
  els.storageBadge.textContent = `storage: ${storage.kind}${storage.supportsPersistence ? ' / persistent' : ' / volatile'}`;
  els.storageDetail.textContent = `kind: ${storage.kind}\npersistent: ${storage.supportsPersistence}\npath: ${storage.path || '-'}\nnote: ${storage.note || '-'}\n\nRailway tip: set BROKER_STATE_PATH or mount RAILWAY_VOLUME_MOUNT_PATH for durable JSON state.\nCloudflare Worker tip: bind D1 as DB and reuse /api/schema for init.`;
  renderStream(events);
  renderAgents(agents);
  renderJobs(jobs);
  renderBilling(jobs);
}

async function refresh() {
  render(await api('/api/snapshot'));
}

function loadManualExample() {
  els.agentName.value = 'ops_dispatcher';
  els.agentDesc.value = 'Fallback routing and delivery orchestration';
  els.agentTasks.value = 'ops,summary,research';
  els.agentPremium.value = '0.18';
  els.agentBasic.value = '0.10';
  flash('Loaded manual registration example.', 'info');
}

function loadManifestExample() {
  els.manifestJson.value = JSON.stringify({
    name: 'codex_worker',
    description: 'Handles code changes and debugging tickets.',
    task_types: ['code', 'debug'],
    pricing: { premium_rate: 0.25, basic_rate: 0.1 },
    success_rate: 0.92,
    avg_latency_sec: 45,
    owner: 'Kuni'
  }, null, 2);
  flash('Loaded manifest JSON example.', 'info');
}

function formatManifestJson() {
  const parsed = JSON.parse(els.manifestJson.value || '{}');
  els.manifestJson.value = JSON.stringify(parsed, null, 2);
  flash('Manifest JSON formatted.', 'ok');
}

function loadUrlExample() {
  els.manifestUrl.value = 'https://github.com/example/agents';
  flash('Loaded manifest URL example.', 'info');
}

function loadJobExample(kind) {
  els.jobParent.value = 'cloudcode-main';
  if (kind === 'research') {
    els.jobType.value = 'research';
    els.jobPrompt.value = '中古 MacBook Air M2 の価格帯と主要な買取先を比較して。';
    els.jobBudget.value = '360';
    els.jobDeadline.value = '180';
    els.jobMode.value = 'complete';
  } else if (kind === 'code') {
    els.jobType.value = 'code';
    els.jobPrompt.value = 'Broker billing breakdown UI にトークン内訳を追加して。';
    els.jobBudget.value = '500';
    els.jobDeadline.value = '240';
    els.jobMode.value = 'complete';
  } else {
    els.jobType.value = 'translation';
    els.jobPrompt.value = 'No matching agent should trigger a clean failed flow.';
    els.jobBudget.value = '150';
    els.jobDeadline.value = '60';
    els.jobMode.value = 'create-only';
  }
  flash(`Loaded ${kind} job example.`, 'info');
}

async function createAndOptionallyRunJob() {
  const payload = {
    parent_agent_id: els.jobParent.value || 'cloudcode-main',
    task_type: els.jobType.value || 'research',
    prompt: els.jobPrompt.value || 'auto task',
    budget_cap: Number(els.jobBudget.value || 300),
    deadline_sec: Number(els.jobDeadline.value || 120)
  };
  const created = await api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) });
  if (created.status === 'failed') {
    setDetail(created);
    flash(`Job created in failed state: ${created.failure_reason}`, 'error');
    return refresh();
  }
  if (els.jobMode.value === 'create-only') {
    setDetail(created);
    flash(`Job ${created.job_id.slice(0, 8)} created and matched.`, 'ok');
    return refresh();
  }
  const dev = await api('/api/dev/resolve-job', { method: 'POST', body: JSON.stringify({ job_id: created.job_id, mode: els.jobMode.value }) });
  setDetail({ created, resolved: dev });
  flash(`Job ${created.job_id.slice(0, 8)} ${dev.status}.`, dev.status === 'failed' ? 'error' : 'ok');
  await refresh();
}

async function runAction(action, fn) {
  clearFlash();
  const original = action.textContent;
  action.disabled = true;
  action.textContent = 'WORKING...';
  try {
    await fn();
  } catch (error) {
    flash(error.message, 'error');
    setDetail({ error: error.message });
  } finally {
    action.disabled = false;
    action.textContent = original;
  }
}

els.refreshBtn.onclick = () => runAction(els.refreshBtn, refresh);
els.seedBtn.onclick = () => runAction(els.seedBtn, async () => {
  const seeded = await api('/api/seed', { method: 'POST' });
  setDetail(seeded);
  flash(`Seeded ${seeded.job_ids.length} demo jobs.`, 'ok');
  await refresh();
});
els.registerAgentBtn.onclick = () => runAction(els.registerAgentBtn, async () => {
  const res = await api('/api/agents', {
    method: 'POST',
    body: JSON.stringify({
      name: els.agentName.value,
      description: els.agentDesc.value,
      task_types: els.agentTasks.value,
      premium_rate: Number(els.agentPremium.value || 0.1),
      basic_rate: Number(els.agentBasic.value || 0.1)
    })
  });
  setDetail(res);
  flash(`Registered ${res.agent.name}. Token shown in detail panel only once.`, 'ok');
  await refresh();
});
els.importManifestBtn.onclick = () => runAction(els.importManifestBtn, async () => {
  const res = await api('/api/agents/import-manifest', { method: 'POST', body: JSON.stringify({ manifest: JSON.parse(els.manifestJson.value || '{}') }) });
  setDetail(res);
  flash(`Imported manifest for ${res.agent.name}.`, 'ok');
  await refresh();
});
els.importUrlBtn.onclick = () => runAction(els.importUrlBtn, async () => {
  const value = els.manifestUrl.value.trim();
  const isRepo = /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(value);
  const manifestUrl = isRepo ? value.replace(/\/$/, '') + '/blob/main/agent.json' : value;
  const res = await api('/api/agents/import-url', { method: 'POST', body: JSON.stringify({ manifest_url: manifestUrl, repo_url: value }) });
  setDetail({ input: value, resolvedManifestUrl: manifestUrl, response: res });
  flash(`Connected GitHub source for ${res.agent.name}.`, 'ok');
  await refresh();
});
els.createJobBtn.onclick = () => runAction(els.createJobBtn, createAndOptionallyRunJob);
els.manualExampleBtn.onclick = loadManualExample;
els.manifestExampleBtn.onclick = loadManifestExample;
els.manifestFormatBtn.onclick = () => runAction(els.manifestFormatBtn, async () => formatManifestJson());
els.urlExampleBtn.onclick = loadUrlExample;
els.jobResearchExampleBtn.onclick = () => loadJobExample('research');
els.jobCodeExampleBtn.onclick = () => loadJobExample('code');
els.jobFailExampleBtn.onclick = () => loadJobExample('fail');

const events = new EventSource('/events');
events.onmessage = (message) => {
  try {
    const event = JSON.parse(message.data);
    if (state.snapshot) {
      state.snapshot.events.push(event);
      renderStream(state.snapshot.events);
    }
  } catch {}
};

loadManifestExample();
loadJobExample('research');
await refresh();
