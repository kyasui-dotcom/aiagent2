const $ = (id) => document.getElementById(id);
const els = {
  stream: $('stream'),
  eventFilter: $('eventFilter'),
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
  billingAuditTable: $('billingAuditTable'),
  openJobsTable: $('openJobsTable'),
  jobDetail: $('jobDetail'),
  agentDetail: $('agentDetail'),
  jobTrace: $('jobTrace'),
  flash: $('flash'),
  authStatus: $('authStatus'),
  githubLoginBtn: $('githubLoginBtn'),
  logoutBtn: $('logoutBtn'),
  loadReposBtn: $('loadReposBtn'),
  importSelectedRepoBtn: $('importSelectedRepoBtn'),
  repoPicker: $('repoPicker'),
  repoPreview: $('repoPreview'),
  repoSearch: $('repoSearch'),
  repoPrevBtn: $('repoPrevBtn'),
  repoNextBtn: $('repoNextBtn'),
  repoPagerStatus: $('repoPagerStatus'),
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
  jobMode: $('jobMode'),
  claimAgentId: $('claimAgentId'),
  claimJobId: $('claimJobId'),
  submitOutput: $('submitOutput'),
  claimJobBtn: $('claimJobBtn'),
  submitResultBtn: $('submitResultBtn')
};

const state = { snapshot: null, repos: [], filteredRepos: [], repoPage: 0, repoPageSize: 50, eventFilter: '', currentTab: 'work', currentLang: 'en' };

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
function setAgentDetail(value) {
  els.agentDetail.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
function setJobTrace(job) {
  if (!job) {
    els.jobTrace.textContent = 'Select a job row.';
    return;
  }
  const trace = {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    claimedAt: job.claimedAt || null,
    dispatchedAt: job.dispatchedAt || null,
    startedAt: job.startedAt || null,
    lastCallbackAt: job.lastCallbackAt || null,
    completedAt: job.completedAt || null,
    failedAt: job.failedAt || null,
    timedOutAt: job.timedOutAt || null,
    failureReason: job.failureReason || null,
    failureCategory: job.failureCategory || null,
    dispatch: job.dispatch || null,
    logs: job.logs || []
  };
  els.jobTrace.textContent = JSON.stringify(trace, null, 2);
}

const I18N = {
  en: {
    tabSummary: {
      work: 'Create requests, track execution, review delivery, and inspect billing.',
      agents: 'Register agents, import manifests, verify health, and prepare supply-side capacity.',
      connect: 'Connect Cloudcode or external agents through callback, claim, and result flows.'
    },
    tabHint: 'Start with WORK if you are not sure. Use AGENTS for supply-side setup and CONNECT for external tools.'
  },
  ja: {
    tabSummary: {
      work: '依頼作成、実行状況、納品、課金を見る画面。',
      agents: 'Agent登録、manifest import、verify、受注準備の画面。',
      connect: 'Cloudcode や外部 agent からの接続、callback、claim/result の画面。'
    },
    tabHint: '迷ったら WORK から始める。AGENTS は受注側の準備、CONNECT は外部ツール接続用。'
  }
};

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('[data-screen]').forEach((node) => {
    node.hidden = node.dataset.screen !== tab;
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  const summaryEl = document.getElementById('tabSummary');
  if (summaryEl) summaryEl.textContent = I18N[state.currentLang].tabSummary[tab] || '';
}

function switchLang(lang) {
  state.currentLang = lang;
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  const hintEl = document.getElementById('tabHint');
  if (hintEl) hintEl.textContent = I18N[lang].tabHint;
  switchTab(state.currentTab);
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
  const q = (state.eventFilter || '').trim().toLowerCase();
  const filtered = !q ? events : events.filter((event) => `${event.type} ${event.message}`.toLowerCase().includes(q));
  els.stream.innerHTML = '';
  filtered.slice(-80).forEach((event) => {
    const row = document.createElement('div');
    row.className = 'log-line';
    row.innerHTML = `<span class="ts">${new Date(event.ts).toLocaleTimeString('ja-JP')}</span><span class="type-${event.type}">[${event.type}]</span> ${event.message}`;
    row.onclick = () => setDetail(event);
    els.stream.appendChild(row);
  });
}

function renderAgents(agents) {
  const myLogin = state.snapshot?.auth?.user?.login;
  els.agentsTable.innerHTML = `<div class="table-header agents-grid"><div>NAME</div><div>TASKS</div><div>PREM</div><div>SUCCESS</div><div>STATUS</div><div>EARNINGS</div></div>${agents.map((agent) => `
    <div class="table-row agents-grid" data-agent-id="${agent.id}">
      <div>${agent.name}${myLogin && agent.owner === myLogin ? ' <span style="color:var(--amber)">[MY AGENT]</span>' : ''}<div class="row-muted">${agent.owner || '-'}</div></div>
      <div>${agent.taskTypes.join(', ')}</div>
      <div>${Math.round(agent.premiumRate * 100)}%</div>
      <div>${Math.round(agent.successRate * 100)}%</div>
      <div class="${agent.online ? 'online' : 'failed'}">${agent.online ? 'ONLINE' : 'OFFLINE'}<div class="row-muted">${agent.verificationStatus || 'legacy_unverified'}</div>${agent.verificationStatus === 'verified' ? '' : `<button class="mini-btn verify-agent-btn" data-verify-agent="${agent.id}" style="margin-top:6px">VERIFY</button>`}</div>
      <div>${yen(agent.earnings)}</div>
    </div>`).join('')}`;
  [...els.agentsTable.querySelectorAll('[data-agent-id]')].forEach((row) => {
    row.onclick = () => {
      const agent = agents.find((item) => item.id === row.dataset.agentId);
      setAgentDetail(agent);
      setDetail(agent);
    };
  });
  [...els.agentsTable.querySelectorAll('[data-verify-agent]')].forEach((btn) => {
    btn.onclick = async (event) => {
      event.stopPropagation();
      await runAction(btn, async () => {
        const id = btn.dataset.verifyAgent;
        const result = await api(`/api/agents/${id}/verify`, { method: 'POST' });
        setDetail(result);
        flash(result.verification?.ok ? `Agent ${id.slice(0, 8)} verified.` : `Agent ${id.slice(0, 8)} verification failed.`, result.verification?.ok ? 'ok' : 'error');
        await refresh();
      });
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
      setJobTrace(job);
    };
  });
}

function renderOpenJobs(jobs) {
  const open = jobs.filter((job) => ['queued', 'claimed', 'running', 'dispatched'].includes(job.status));
  if (!open.length) {
    els.openJobsTable.innerHTML = '<div class="empty">No open jobs now.</div>';
    return;
  }
  els.openJobsTable.innerHTML = `<div class="table-header jobs-grid"><div>JOB</div><div>TYPE</div><div>STATUS</div><div>AGENT</div><div>SCORE</div><div>CREATED</div></div>${open.map((job) => `
    <div class="table-row jobs-grid" data-open-job-id="${job.id}">
      <div>${job.id.slice(0, 8)}</div>
      <div>${job.taskType}</div>
      <div class="${job.status}">${job.status.toUpperCase()}</div>
      <div>${job.assignedAgentId ? job.assignedAgentId.slice(0, 14) : '-'}</div>
      <div>${job.score ?? '-'}</div>
      <div>${new Date(job.createdAt).toLocaleString('ja-JP')}</div>
    </div>`).join('')}`;
  [...els.openJobsTable.querySelectorAll('[data-open-job-id]')].forEach((row) => {
    row.onclick = () => {
      const job = open.find((item) => item.id === row.dataset.openJobId);
      if (job) {
        els.claimJobId.value = job.id;
        if (job.assignedAgentId) els.claimAgentId.value = job.assignedAgentId;
        setDetail(job);
        setJobTrace(job);
      }
    };
  });
}

function renderBilling(jobs) {
  const billed = jobs.filter((job) => job.actualBilling);
  if (!billed.length) {
    els.billingTable.innerHTML = '<div class="empty">No billed jobs yet.</div>';
    return;
  }
  els.billingTable.innerHTML = `<div class="table-header billing-grid"><div>JOB</div><div>STATUS</div><div>BASIS</div><div>PAYOUT</div><div>PLATFORM</div><div>TOTAL</div></div>${billed.map((job) => `
    <div class="table-row billing-grid" data-bill-id="${job.id}">
      <div>${job.id.slice(0, 8)}</div>
      <div class="${job.status}">${job.status.toUpperCase()}</div>
      <div>${yen(job.actualBilling.totalCostBasis ?? job.actualBilling.apiCost)}</div>
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

function renderBillingAudits(audits = []) {
  if (!audits.length) {
    els.billingAuditTable.innerHTML = '<div class="empty">No billing audits yet.</div>';
    return;
  }
  els.billingAuditTable.innerHTML = `<div class="table-header billing-grid"><div>JOB</div><div>SOURCE</div><div>BASIS</div><div>PAYOUT</div><div>PLATFORM</div><div>TOTAL</div></div>${audits.map((audit) => `
    <div class="table-row billing-grid" data-audit-id="${audit.id}">
      <div>${audit.jobId.slice(0, 8)}</div>
      <div>${audit.source}</div>
      <div>${yen(audit.billable.totalCostBasis)}</div>
      <div>${yen(audit.settlement.agentPayout)}</div>
      <div>${yen(audit.settlement.platformRevenue)}</div>
      <div>${yen(audit.settlement.total)}</div>
    </div>`).join('')}`;
  [...els.billingAuditTable.querySelectorAll('[data-audit-id]')].forEach((row) => {
    row.onclick = () => {
      const audit = audits.find((item) => item.id === row.dataset.auditId);
      setDetail(audit);
    };
  });
}

function renderAuth(auth) {
  if (!auth) return;
  const lines = [
    `loggedIn: ${auth.loggedIn}`,
    `githubConfigured: ${auth.githubConfigured}`,
    `user: ${auth.user ? `${auth.user.login} (${auth.user.name || '-'})` : '-'}`,
    `profile: ${auth.user?.profileUrl || '-'}`
  ];
  els.authStatus.textContent = lines.join('\n');
  els.githubLoginBtn.disabled = !auth.githubConfigured;
  els.logoutBtn.disabled = !auth.loggedIn;
}

function render(snapshot) {
  state.snapshot = snapshot;
  const { stats, agents, jobs, events, storage, auth, billingAudits } = snapshot;
  els.activeJobs.textContent = stats.activeJobs;
  els.onlineAgents.textContent = stats.onlineAgents;
  els.grossVolume.textContent = yen(stats.grossVolume);
  els.platformRevenue.textContent = yen(stats.platformRevenue);
  els.todayCost.textContent = yen(stats.todayCost);
  els.failedJobs.textContent = stats.failedJobs;
  els.storageBadge.textContent = `storage: ${storage.kind}${storage.supportsPersistence ? ' / persistent' : ' / volatile'}`;
  els.storageDetail.textContent = `kind: ${storage.kind}\npersistent: ${storage.supportsPersistence}\npath: ${storage.path || '-'}\nnote: ${storage.note || '-'}\n\nRailway tip: set BROKER_STATE_PATH or mount RAILWAY_VOLUME_MOUNT_PATH for durable JSON state.\nCloudflare Worker tip: bind D1 as DB and reuse /api/schema for init.`;
  renderAuth(auth);
  renderStream(events);
  renderAgents(agents);
  renderJobs(jobs);
  renderOpenJobs(jobs);
  renderBilling(jobs);
  renderBillingAudits(billingAudits || []);
}

async function refresh() {
  render(await api('/api/snapshot'));
}

function applyRepoFilter() {
  const q = (els.repoSearch.value || '').trim().toLowerCase();
  state.filteredRepos = !q ? [...state.repos] : state.repos.filter((repo) => `${repo.fullName} ${repo.description || ''}`.toLowerCase().includes(q));
  state.repoPage = 0;
  renderRepoPicker();
}

function renderRepoPicker() {
  const start = state.repoPage * state.repoPageSize;
  const items = state.filteredRepos.slice(start, start + state.repoPageSize);
  els.repoPicker.innerHTML = items.length
    ? items.map((repo, index) => `<option value="${start + index}">${repo.fullName}${repo.private ? ' 🔒' : ''}</option>`).join('')
    : '<option value="">No repos found</option>';
  const totalPages = Math.max(1, Math.ceil(state.filteredRepos.length / state.repoPageSize));
  els.repoPagerStatus.textContent = `${state.filteredRepos.length} repos / page ${state.repoPage + 1} of ${totalPages}`;
  els.repoPrevBtn.disabled = state.repoPage <= 0;
  els.repoNextBtn.disabled = state.repoPage >= totalPages - 1;
}

function showSelectedRepo() {
  const repo = state.filteredRepos[Number(els.repoPicker.value)] || state.repos[Number(els.repoPicker.value)];
  if (!repo) {
    els.repoPreview.textContent = 'Select a repo to preview manifest load target.';
    return;
  }
  els.repoPreview.textContent = JSON.stringify(repo, null, 2);
}

function loadManualExample() {
  if (state.snapshot?.auth?.user?.login) {
    els.agentName.value = `${state.snapshot.auth.user.login}_agent`;
    els.agentDesc.value = 'GitHub user linked worker agent';
  }
  els.agentName.value = 'ops_dispatcher';
  els.agentDesc.value = 'Fallback routing and delivery orchestration';
  els.agentTasks.value = 'ops,summary,research';
  els.agentPremium.value = '0.18';
  els.agentBasic.value = '0.10';
  flash('Loaded manual registration example.', 'info');
}

function loadManifestExample() {
  els.manifestJson.value = JSON.stringify({
    schema_version: 'agent-manifest/v1',
    name: 'codex_worker',
    description: 'Handles code changes and debugging tickets.',
    task_types: ['code', 'debug'],
    pricing: { premium_rate: 0.25, basic_rate: 0.1 },
    success_rate: 0.92,
    avg_latency_sec: 45,
    owner: 'Kuni',
    verification: {
      challenge_path: '/.well-known/agent-challenge.txt',
      challenge_token: 'replace-me'
    }
  }, null, 2);
  flash('Loaded manifest JSON example.', 'info');
}

function formatManifestJson() {
  const parsed = JSON.parse(els.manifestJson.value || '{}');
  els.manifestJson.value = JSON.stringify(parsed, null, 2);
  flash('Manifest JSON formatted.', 'ok');
}

function loadUrlExample() {
  els.manifestUrl.value = 'https://example.com/.well-known/agent.json';
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
  if (els.jobMode.value === 'create-only' || created.status === 'completed' || created.status === 'dispatched') {
    setDetail(created);
    flash(`Job ${created.job_id.slice(0, 8)} ${created.status || 'created'}.`, created.status === 'failed' ? 'error' : 'ok');
    return refresh();
  }
  if (els.jobMode.value === 'external-demo') {
    const claim = await api(`/api/jobs/${created.job_id}/claim`, { method: 'POST', body: JSON.stringify({ agent_id: created.matched_agent_id }) });
    const submit = await api(`/api/jobs/${created.job_id}/result`, { method: 'POST', body: JSON.stringify({ agent_id: created.matched_agent_id, status: 'completed', output: { summary: `Connected aiagent handled: ${els.jobPrompt.value}` }, usage: { api_cost: Math.max(60, Math.round(Number(els.jobBudget.value || 300) * 0.3)) } }) });
    setDetail({ created, claim, submit });
    flash(`Job ${created.job_id.slice(0, 8)} dispatched to connected aiagent demo.`, 'ok');
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

if (els.loadReposBtn) els.loadReposBtn.onclick = () => runAction(els.loadReposBtn, async () => {
  const res = await api('/api/github/repos');
  state.repos = res.repos || [];
  state.filteredRepos = [...state.repos];
  state.repoPage = 0;
  renderRepoPicker();
  els.repoPreview.textContent = state.repos.length ? 'Repos loaded. Select one.' : 'No repos found.';
  flash(`Loaded ${state.repos.length} repos.`, 'ok');
});
if (els.repoPicker) els.repoPicker.onchange = showSelectedRepo;
if (els.repoSearch) els.repoSearch.oninput = applyRepoFilter;
if (els.repoPrevBtn) els.repoPrevBtn.onclick = () => { if (state.repoPage > 0) { state.repoPage -= 1; renderRepoPicker(); } };
if (els.repoNextBtn) els.repoNextBtn.onclick = () => { const totalPages = Math.max(1, Math.ceil(state.filteredRepos.length / state.repoPageSize)); if (state.repoPage < totalPages - 1) { state.repoPage += 1; renderRepoPicker(); } };
if (els.importSelectedRepoBtn) els.importSelectedRepoBtn.onclick = () => runAction(els.importSelectedRepoBtn, async () => {
  const repo = state.filteredRepos[Number(els.repoPicker.value)] || state.repos[Number(els.repoPicker.value)];
  if (!repo) throw new Error('Select a repo first.');
  const res = await api('/api/github/load-manifest', { method: 'POST', body: JSON.stringify({ owner: repo.owner, repo: repo.name }) });
  setDetail(res);
  flash(`Loaded manifest-backed agent from ${repo.fullName}. Verify before dispatch.`, 'ok');
  await refresh();
});
if (els.githubLoginBtn) els.githubLoginBtn.onclick = () => {
  window.location.href = '/auth/github';
};
if (els.logoutBtn) els.logoutBtn.onclick = () => runAction(els.logoutBtn, async () => {
  await api('/auth/logout', { method: 'POST' });
  flash('Logged out.', 'ok');
  await refresh();
});
if (els.refreshBtn) els.refreshBtn.onclick = () => runAction(els.refreshBtn, refresh);
if (els.seedBtn) els.seedBtn.onclick = () => runAction(els.seedBtn, async () => {
  const seeded = await api('/api/seed', { method: 'POST' });
  setDetail(seeded);
  flash(`Seeded ${seeded.job_ids.length} demo jobs.`, 'ok');
  await refresh();
});
if (els.registerAgentBtn) els.registerAgentBtn.onclick = () => runAction(els.registerAgentBtn, async () => {
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
if (els.importManifestBtn) els.importManifestBtn.onclick = () => runAction(els.importManifestBtn, async () => {
  const res = await api('/api/agents/import-manifest', { method: 'POST', body: JSON.stringify({ manifest: JSON.parse(els.manifestJson.value || '{}') }) });
  setDetail(res);
  flash(`Imported manifest for ${res.agent.name}.`, 'ok');
  await refresh();
});
if (els.importUrlBtn) els.importUrlBtn.onclick = () => runAction(els.importUrlBtn, async () => {
  const value = els.manifestUrl.value.trim();
  const res = await api('/api/agents/import-url', { method: 'POST', body: JSON.stringify({ manifest_url: value }) });
  setDetail({ input: value, response: res });
  flash(`Manifest URL imported for ${res.agent.name}. Verify before dispatch.`, 'ok');
  await refresh();
});
if (els.createJobBtn) els.createJobBtn.onclick = () => runAction(els.createJobBtn, createAndOptionallyRunJob);
if (els.claimJobBtn) els.claimJobBtn.onclick = () => runAction(els.claimJobBtn, async () => {
  const res = await api(`/api/jobs/${els.claimJobId.value}/claim`, { method: 'POST', body: JSON.stringify({ agent_id: els.claimAgentId.value }) });
  setDetail(res);
  flash(`Job ${els.claimJobId.value.slice(0, 8)} claimed.`, 'ok');
  await refresh();
});
if (els.submitResultBtn) els.submitResultBtn.onclick = () => runAction(els.submitResultBtn, async () => {
  const res = await api(`/api/jobs/${els.claimJobId.value}/result`, { method: 'POST', body: JSON.stringify({ agent_id: els.claimAgentId.value, status: 'completed', output: { summary: els.submitOutput.value || 'Connected aiagent result' }, usage: { api_cost: 90 } }) });
  setDetail(res);
  flash(`Job ${els.claimJobId.value.slice(0, 8)} submitted.`, 'ok');
  await refresh();
});
if (els.manualExampleBtn) els.manualExampleBtn.onclick = loadManualExample;
if (els.manifestExampleBtn) els.manifestExampleBtn.onclick = loadManifestExample;
if (els.manifestFormatBtn) els.manifestFormatBtn.onclick = () => runAction(els.manifestFormatBtn, async () => formatManifestJson());
if (els.urlExampleBtn) els.urlExampleBtn.onclick = loadUrlExample;
if (els.jobResearchExampleBtn) els.jobResearchExampleBtn.onclick = () => loadJobExample('research');
if (els.jobCodeExampleBtn) els.jobCodeExampleBtn.onclick = () => loadJobExample('code');
if (els.jobFailExampleBtn) els.jobFailExampleBtn.onclick = () => loadJobExample('fail');

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

els.eventFilter.oninput = () => {
  state.eventFilter = els.eventFilter.value || '';
  if (state.snapshot) renderStream(state.snapshot.events || []);
};

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.onclick = () => switchTab(btn.dataset.tab);
});
document.querySelectorAll('.lang-btn').forEach((btn) => {
  btn.onclick = () => switchLang(btn.dataset.lang);
});

loadManifestExample();
loadJobExample('research');
switchLang('en');
switchTab('work');
await refresh();
