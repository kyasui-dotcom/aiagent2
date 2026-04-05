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
  verifiedAgents: $('verifiedAgents'),
  readyAgents: $('readyAgents'),
  verifyFailedAgents: $('verifyFailedAgents'),
  missingEndpointAgents: $('missingEndpointAgents'),
  offlineAgents: $('offlineAgents'),
  agentCoverage: $('agentCoverage'),
  storageDetail: $('storageDetail'),
  agentsTable: $('agentsTable'),
  agentOpsBoard: $('agentOpsBoard'),
  jobsTable: $('jobsTable'),
  runSearch: $('runSearch'),
  runStatusFilter: $('runStatusFilter'),
  runActionFilter: $('runActionFilter'),
  billingTable: $('billingTable'),
  billingAuditTable: $('billingAuditTable'),
  openJobsTable: $('openJobsTable'),
  jobDetail: $('jobDetail'),
  runActionCard: $('runActionCard'),
  runEstimateCard: $('runEstimateCard'),
  agentDetail: $('agentDetail'),
  agentRunDraft: $('agentRunDraft'),
  jobTrace: $('jobTrace'),
  runHealthSummary: $('runHealthSummary'),
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
  heroTryBtn: $('heroTryBtn'),
  heroWorkBtn: $('heroWorkBtn'),
  heroAgentsBtn: $('heroAgentsBtn'),
  heroConnectBtn: $('heroConnectBtn'),
  heroSeedBtn: $('heroSeedBtn'),
  heroCliBtn: $('heroCliBtn'),
  agentSearch: $('agentSearch'),
  agentStatusFilter: $('agentStatusFilter'),
  agentAvailabilityFilter: $('agentAvailabilityFilter'),
  agentActionFilter: $('agentActionFilter'),
  agentTaskFilter: $('agentTaskFilter'),
  agentSort: $('agentSort'),
  refreshBtn: $('refreshBtn'),
  registerAgentBtn: $('registerAgentBtn'),
  importManifestBtn: $('importManifestBtn'),
  importUrlBtn: $('importUrlBtn'),
  sampleResearchManifestBtn: $('sampleResearchManifestBtn'),
  sampleCodeManifestBtn: $('sampleCodeManifestBtn'),
  sampleOpsManifestBtn: $('sampleOpsManifestBtn'),
  createJobBtn: $('createJobBtn'),
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
  cliStatus: $('cliStatus'),
  cliFlow: $('cliFlow'),
  cliQuickstart: $('cliQuickstart'),
  apiExamples: $('apiExamples'),
  jobParent: $('jobParent'),
  jobType: $('jobType'),
  jobPrompt: $('jobPrompt'),
  jobAgentId: $('jobAgentId'),
  jobBudget: $('jobBudget'),
  jobDeadline: $('jobDeadline'),
  jobMode: $('jobMode'),
  agentRunContext: $('agentRunContext'),
  clearRunAgentBtn: $('clearRunAgentBtn'),
  agentFilterSummary: $('agentFilterSummary'),
  showReadyAgentsBtn: $('showReadyAgentsBtn'),
  showVerifyFailuresBtn: $('showVerifyFailuresBtn'),
  showStaleVerifyBtn: $('showStaleVerifyBtn'),
  showMissingEndpointBtn: $('showMissingEndpointBtn'),
  showTaskMismatchBtn: $('showTaskMismatchBtn'),
  claimAgentId: $('claimAgentId'),
  claimJobId: $('claimJobId'),
  submitOutput: $('submitOutput'),
  claimJobBtn: $('claimJobBtn'),
  submitResultBtn: $('submitResultBtn'),
  retryDispatchBtn: $('retryDispatchBtn'),
  agentActionCard: $('agentActionCard'),
  useAgentForRunBtn: $('useAgentForRunBtn'),
  copyAgentCurlBtn: $('copyAgentCurlBtn'),
  agentRoutingCoverage: $('agentRoutingCoverage')
};

const state = {
  snapshot: null,
  repos: [],
  filteredRepos: [],
  repoPage: 0,
  repoPageSize: 50,
  eventFilter: '',
  currentTab: 'start',
  runSearch: '',
  runStatusFilter: '',
  runActionFilter: '',
  agentSearch: '',
  agentStatusFilter: '',
  agentAvailabilityFilter: '',
  agentActionFilter: '',
  agentTaskFilter: '',
  agentSort: 'readiness',
  selectedJobId: null,
  selectedAgentId: null
};

const TAB_SUMMARY = {
  start: 'Public beta overview, live stream, price clarity, and why this runtime matters.',
  work: 'Create work cycles, inspect execution state, compare estimate vs actual, and debug failures.',
  agents: 'Register, import, verify, and publish AI agents into the runtime.',
  connect: 'Copyable CLI / API entry points for engineers connecting local workflows.',
  ops: 'Manual claim/result actions, billing board, and operator-only controls.'
};

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

function safeText(el, value) {
  if (!el) return;
  el.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString('ja-JP') : '-';
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatDurationMs(ms) {
  const safeMs = Number(ms || 0);
  if (!Number.isFinite(safeMs) || safeMs <= 0) return '0s';
  const totalSec = Math.round(safeMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatSecRange(minSec, maxSec) {
  return `${formatDurationMs((minSec || 0) * 1000)} – ${formatDurationMs((maxSec || 0) * 1000)}`;
}

function sinceLabel(value) {
  if (!value) return '-';
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return '-';
  return `${formatDurationMs(Date.now() - ts)} ago`;
}

function untilLabel(value) {
  if (!value) return '-';
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return '-';
  const diff = ts - Date.now();
  if (diff <= 0) return 'now';
  return `in ${formatDurationMs(diff)}`;
}

function selectedJob() {
  return state.snapshot?.jobs?.find((job) => job.id === state.selectedJobId) || null;
}

function selectedAgent() {
  return state.snapshot?.agents?.find((agent) => agent.id === state.selectedAgentId) || null;
}

function currentRunTargetAgent() {
  const agentId = String(els.jobAgentId?.value || '').trim();
  if (!agentId) return null;
  return state.snapshot?.agents?.find((agent) => agent.id === agentId) || null;
}

function currentRoutingTask() {
  const requested = String(els.jobType?.value || '').trim();
  if (requested) return requested;
  const selected = selectedJob();
  return String(selected?.taskType || '').trim();
}

function estimateWindowOfAgent(agent, taskType = currentRoutingTask()) {
  if (!agent) return null;
  const map = {
    research: { minSec: 35, maxSec: 240, minApi: 36, maxApi: 120 },
    summary: { minSec: 25, maxSec: 120, minApi: 18, maxApi: 72 },
    writing: { minSec: 45, maxSec: 220, minApi: 28, maxApi: 110 },
    seo: { minSec: 40, maxSec: 180, minApi: 26, maxApi: 96 },
    code: { minSec: 90, maxSec: 720, minApi: 72, maxApi: 240 },
    debug: { minSec: 120, maxSec: 620, minApi: 68, maxApi: 220 },
    automation: { minSec: 110, maxSec: 560, minApi: 64, maxApi: 210 },
    ops: { minSec: 55, maxSec: 300, minApi: 44, maxApi: 150 }
  };
  const picked = map[String(taskType || '').toLowerCase()] || map.research;
  const premiumRate = Number(agent.premiumRate || 0);
  const basicRate = Number(agent.basicRate || 0.1);
  const calcTotal = (apiCost) => {
    const baseFee = apiCost * basicRate;
    const premiumFee = apiCost * premiumRate;
    const platformFee = apiCost * 0.1;
    return apiCost + baseFee + premiumFee + platformFee;
  };
  return {
    durationMinSec: picked.minSec,
    durationMaxSec: picked.maxSec,
    estimateMinTotal: calcTotal(picked.minApi),
    estimateMaxTotal: calcTotal(picked.maxApi),
    typicalTotal: calcTotal(Math.round((picked.minApi + picked.maxApi) / 2)),
    confidence: agent.verificationStatus === 'verified' ? 'high' : 'medium'
  };
}

function agentVerification(agent) {
  return agent?.verificationDetails && typeof agent.verificationDetails === 'object'
    ? agent.verificationDetails
    : {};
}

function agentManifest(agent) {
  return agent?.metadata?.manifest && typeof agent.metadata.manifest === 'object'
    ? agent.metadata.manifest
    : {};
}

function collectAgentEndpoints(agent) {
  const manifest = agentManifest(agent);
  const rawEndpoints = manifest.endpoints && typeof manifest.endpoints === 'object' ? manifest.endpoints : {};
  const endpointMap = new Map();
  const add = (label, value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    endpointMap.set(label, normalized);
  };
  add('jobs', manifest.jobEndpoint || manifest.job_endpoint || manifest.jobsUrl || manifest.jobs_url || rawEndpoints.jobs || rawEndpoints.job || rawEndpoints.dispatch || rawEndpoints.submit);
  add('health', manifest.healthcheckUrl || manifest.health_url || manifest.healthUrl || rawEndpoints.health);
  Object.entries(rawEndpoints).forEach(([key, value]) => add(String(key), value));
  return {
    primaryJob: endpointMap.get('jobs') || '',
    healthcheck: endpointMap.get('health') || '',
    entries: [...endpointMap.entries()].map(([label, value]) => ({ label, value }))
  };
}

function shortUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  try {
    const parsed = new URL(text);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return text;
  }
}

function agentVerifyAction(agent) {
  const verification = agentVerification(agent);
  const code = String(verification.code || '').trim();
  if (!code || agent?.verificationStatus === 'verified') {
    return {
      title: 'Verification healthy',
      body: 'Healthcheck passed. Use endpoint and capability fit to decide whether to route runs here.'
    };
  }
  if (code === 'missing_healthcheck_url') {
    return {
      title: 'Add a health endpoint',
      body: 'Set `healthcheck_url` or `endpoints.health` in the manifest, then verify again.'
    };
  }
  if (code === 'healthcheck_http_error') {
    return {
      title: 'Fix the healthcheck response',
      body: `The broker reached the health URL but did not get HTTP 200. Check ${verification.healthcheckUrl || 'the configured health URL'} and return 200.`
    };
  }
  if (code === 'healthcheck_unhealthy_body') {
    return {
      title: 'Return ok=true from healthcheck',
      body: 'The endpoint responded, but the body did not prove health. Return JSON with `ok: true` and retry verification.'
    };
  }
  if (code === 'ownership_challenge_failed') {
    return {
      title: 'Fix ownership challenge hosting',
      body: `Publish the expected challenge token at ${verification.challengeUrl || 'the configured challenge URL'}, then verify again.`
    };
  }
  if (code === 'healthcheck_fetch_error') {
    return {
      title: 'Restore network reachability',
      body: 'The broker could not fetch the health URL. Check DNS/TLS/public reachability and retry verification.'
    };
  }
  return {
    title: 'Inspect verify configuration',
    body: verification.reason || 'Review manifest fields, healthcheck reachability, and ownership challenge configuration.'
  };
}

function agentVerifyFailureSummary(agent) {
  const verification = agentVerification(agent);
  const action = agentVerifyAction(agent);
  const code = String(verification.code || '').trim();
  const statusCode = verification.details?.statusCode;
  let cause = agent?.verificationError || verification.reason || 'Verification is incomplete.';
  if (code === 'missing_healthcheck_url') cause = 'Manifest is missing a healthcheck URL.';
  else if (code === 'healthcheck_http_error') cause = `Healthcheck returned HTTP ${statusCode ?? 'non-200'}.`;
  else if (code === 'healthcheck_unhealthy_body') cause = 'Healthcheck body did not prove ok=true.';
  else if (code === 'ownership_challenge_failed') cause = `Ownership challenge could not be proved at ${verification.challengeUrl || 'the configured challenge URL'}.`;
  else if (code === 'healthcheck_fetch_error') cause = `Broker could not reach ${verification.healthcheckUrl || 'the configured health URL'}.`;
  else if (agent?.verificationStatus === 'verified') cause = 'Verification succeeded.';
  return {
    cause,
    next: `${action.title}: ${action.body}`
  };
}

function agentHealth(agent) {
  const verification = agentVerification(agent);
  const verified = agent?.verificationStatus === 'verified';
  const endpoints = collectAgentEndpoints(agent);
  const endpoint = endpoints.primaryJob;
  const healthcheck = endpoints.healthcheck;
  const capabilityCount = (agent?.taskTypes || []).length;
  const ready = Boolean(agent?.online && verified && endpoint && capabilityCount);
  let label = 'DEGRADED';
  let tone = 'warn';
  let reason = agent?.verificationError || verification.reason || 'Agent needs verification and endpoint review.';
  let verifyLabel = verified ? 'VERIFIED' : 'UNVERIFIED';
  if (!agent?.online) {
    label = 'OFFLINE';
    tone = 'error';
    reason = 'Agent is marked offline.';
  } else if (ready) {
    label = 'READY';
    tone = 'ok';
    reason = 'Verified, online, and exposes a job endpoint.';
  } else if (verified && !endpoint) {
    label = 'NO ENDPOINT';
    tone = 'warn';
    reason = 'Verified, but no dispatch job endpoint is configured.';
  } else if (verified) {
    label = 'VERIFIED';
    tone = 'info';
    reason = 'Healthcheck passed. Review endpoint/capability fit before dispatch.';
  } else if (String(agent?.verificationStatus || '').includes('failed')) {
    label = 'VERIFY FAIL';
    tone = 'error';
    verifyLabel = 'VERIFY FAIL';
    reason = agent?.verificationError || verification.reason || 'Verification failed.';
  } else if (agent?.verificationStatus === 'manifest_loaded') {
    verifyLabel = 'MANIFEST LOADED';
  } else if (agent?.verificationStatus === 'legacy_unverified') {
    verifyLabel = 'LEGACY';
  }
  return {
    verified,
    endpoint,
    healthcheck,
    endpoints: endpoints.entries,
    ready,
    label,
    tone,
    reason,
    verifyLabel,
    capabilityCount,
    availability: agent?.online ? 'ONLINE' : 'OFFLINE',
    endpointLabel: endpoint ? 'JOB ENDPOINT' : 'NO ENDPOINT',
    healthLabel: healthcheck ? 'HEALTHCHECK' : 'NO HEALTHCHECK'
  };
}

function runTiming(job) {
  if (!job) return null;
  const createdAt = job.createdAt ? new Date(job.createdAt).getTime() : null;
  const claimedAt = job.claimedAt ? new Date(job.claimedAt).getTime() : null;
  const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : null;
  const terminalAtValue = job.completedAt || job.failedAt || job.timedOutAt || null;
  const terminalAt = terminalAtValue ? new Date(terminalAtValue).getTime() : null;
  const now = Date.now();
  return {
    age: createdAt ? formatDurationMs(now - createdAt) : '-',
    queuedFor: createdAt ? formatDurationMs((claimedAt || startedAt || terminalAt || now) - createdAt) : '-',
    activeFor: startedAt ? formatDurationMs((terminalAt || now) - startedAt) : '-',
    endToEnd: createdAt ? formatDurationMs((terminalAt || now) - createdAt) : '-',
    lastUpdatedAt: terminalAtValue || job.lastCallbackAt || job.dispatchedAt || job.startedAt || job.claimedAt || job.createdAt || null
  };
}

function traceTimeline(job) {
  if (!job) return [];
  return [
    ['created', job.createdAt],
    ['claimed', job.claimedAt],
    ['dispatched', job.dispatchedAt],
    ['started', job.startedAt],
    ['last_callback', job.lastCallbackAt],
    ['completed', job.completedAt],
    ['failed', job.failedAt],
    ['timed_out', job.timedOutAt]
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${formatTime(value)} (${sinceLabel(value)})`);
}

function agentReadinessScore(agent) {
  const health = agentHealth(agent);
  return (health.ready ? 1000 : 0) + (health.verified ? 300 : 0) + (agent.online ? 120 : 0) + Math.round(Number(agent.successRate || 0) * 100) - Math.round(Number(agent.avgLatencySec || 0));
}

function compareAgents(a, b) {
  const mode = state.agentSort || 'readiness';
  const verifyRank = (agent) => {
    const status = String(agent?.verificationStatus || '');
    if (status === 'verified') return 3;
    if (status === 'manifest_loaded') return 2;
    if (status === 'legacy_unverified') return 1;
    if (status.includes('failed')) return 0;
    return 1;
  };
  if (mode === 'verify') return verifyRank(b) - verifyRank(a);
  if (mode === 'success') return Number(b.successRate || 0) - Number(a.successRate || 0);
  if (mode === 'latency') return Number(a.avgLatencySec || 0) - Number(b.avgLatencySec || 0);
  if (mode === 'earnings') return Number(b.earnings || 0) - Number(a.earnings || 0);
  if (mode === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
  return agentReadinessScore(b) - agentReadinessScore(a);
}

function parseSearchTokens(raw = '') {
  const tokens = [];
  const free = [];
  String(raw || '').split(/\s+/).filter(Boolean).forEach((token) => {
    const idx = token.indexOf(':');
    if (idx > 0) {
      tokens.push({ key: token.slice(0, idx).toLowerCase(), value: token.slice(idx + 1).toLowerCase() });
      return;
    }
    free.push(token.toLowerCase());
  });
  return { tokens, free };
}

function agentTaskFit(agent, taskType = currentRoutingTask()) {
  const normalizedTask = String(taskType || '').trim().toLowerCase();
  const tasks = (agent?.taskTypes || []).map((task) => String(task).trim().toLowerCase()).filter(Boolean);
  if (!normalizedTask) {
    return {
      taskType: '',
      matches: true,
      label: 'GENERAL FIT',
      tone: 'info',
      reason: 'No specific task is selected. Judge this agent by readiness, endpoint, and verification state.'
    };
  }
  if (tasks.includes(normalizedTask)) {
    return {
      taskType: normalizedTask,
      matches: true,
      label: 'TASK MATCH',
      tone: 'ok',
      reason: `Supports ${normalizedTask}.`
    };
  }
  return {
    taskType: normalizedTask,
    matches: false,
    label: 'TASK MISMATCH',
    tone: 'warn',
    reason: `Does not advertise ${normalizedTask}.`
  };
}

function agentNextAction(agent) {
  if (!agent) return { title: 'NO AGENT SELECTED', body: 'Select an agent to inspect readiness, dispatch path, and recommended next step.', tone: 'info' };
  const health = agentHealth(agent);
  const fit = agentTaskFit(agent);
  const verifyAction = agentVerifyAction(agent);
  const requestedTask = fit.taskType || currentRoutingTask();
  if (!agent.online) return { title: 'ACTION: RESTORE AVAILABILITY', body: 'This agent is offline. Fix service availability before creating runs against it.', tone: 'error' };
  if (!health.verified) return { title: 'ACTION: VERIFY AGENT', body: `${health.reason} Next: ${verifyAction.title}. ${verifyAction.body}${requestedTask ? ` Requested task: ${requestedTask}.` : ''}`, tone: health.tone === 'error' ? 'error' : 'info' };
  if (!health.endpoint) return { title: 'ACTION: ADD JOB ENDPOINT', body: 'Verification passed, but the manifest does not expose a dispatch endpoint. Add `job_endpoint` or `endpoints.jobs` before routing runs here.', tone: 'error' };
  if (!fit.matches) return { title: 'ACTION: CHOOSE A BETTER TASK MATCH', body: `Current routing task is ${requestedTask}. This agent is healthy, but it does not advertise that capability. Use auto-routing or pick an agent that explicitly supports the task.`, tone: 'warn' };
  return { title: requestedTask ? `READY FOR DISPATCH (${requestedTask})` : 'READY FOR DISPATCH', body: `Best used for ${(agent.taskTypes || []).join(', ') || 'general work'}. Use the run form with explicit agent selection when you need deterministic routing.`, tone: 'ok' };
}

function runNextAction(job) {
  if (!job) return { title: 'NO RUN SELECTED', body: 'Select a run to inspect current state and recommended next action.', tone: 'info' };
  if (job.status === 'completed') return { title: 'RUN COMPLETED', body: 'Delivery and billing are recorded. Review output or launch another run.', tone: 'ok' };
  if (job.status === 'failed' || job.status === 'timed_out') {
    if (String(job.failureReason || '').toLowerCase().includes('no verified agent')) {
      return { title: 'ACTION: VERIFY OR REGISTER AN AGENT', body: 'No verified agent could accept this run. Verify an agent or choose one manually, then rerun.', tone: 'error' };
    }
    if (job.dispatch?.retryable) {
      const nextRetryAt = job.dispatch?.nextRetryAt;
      const overdue = nextRetryAt && new Date(nextRetryAt).getTime() <= Date.now();
      return {
        title: overdue ? 'ACTION: RETRY DISPATCH NOW' : 'ACTION: RETRY DISPATCH',
        body: `Dispatch can be retried.${nextRetryAt ? ` Recommended ${overdue ? 'now' : `after ${nextRetryAt}`}.` : ''} Review trace/logs first if the same endpoint keeps failing.`,
        tone: overdue ? 'ok' : 'info'
      };
    }
    return { title: 'ACTION: INSPECT FAILURE', body: `${job.failureReason || 'Run failed.'} ${job.failureCategory ? `Category: ${job.failureCategory}.` : ''} Fix the root cause before retrying.`, tone: 'error' };
  }
  if (job.status === 'dispatched') return { title: 'RUN IN FLIGHT', body: 'The run was accepted by an agent. Watch telemetry/logs or wait for callback/result.', tone: 'info' };
  if (job.status === 'queued') return { title: 'RUN QUEUED', body: 'The run is waiting for claim/dispatch. Confirm agent selection and status.', tone: 'info' };
  if (job.status === 'claimed' || job.status === 'running') return { title: 'RUN EXECUTING', body: 'An agent is currently working. Check telemetry/logs before taking action.', tone: 'ok' };
  return { title: 'CHECK RUN STATE', body: 'Inspect the trace and run detail for the latest execution state.', tone: 'info' };
}

function runActionKey(job) {
  const action = runNextAction(job);
  if (action.title.includes('RETRY DISPATCH')) return 'retry';
  if (action.title.includes('VERIFY AGENT')) return 'verify-agent';
  if (action.title.includes('INSPECT FAILURE')) return 'inspect';
  if (action.title.includes('RUN IN FLIGHT') || action.title.includes('RUN EXECUTING') || action.title.includes('RUN QUEUED')) return 'watch';
  if (action.title.includes('RUN COMPLETED')) return 'done';
  return 'inspect';
}

function summarizeRun(job) {
  if (!job) return 'No run selected.';
  const timing = runTiming(job);
  const estimate = job.estimateWindow || null;
  const lines = [
    `id: ${job.id}`,
    `status: ${job.status}`,
    `taskType: ${job.taskType}`,
    `selectionMode: ${job.selectionMode || '-'}`,
    `agent: ${job.assignedAgentId || '-'}`,
    `score: ${job.score ?? '-'}`,
    `createdAt: ${job.createdAt || '-'}`,
    `createdAgo: ${sinceLabel(job.createdAt)}`,
    `claimedAt: ${job.claimedAt || '-'}`,
    `startedAt: ${job.startedAt || '-'}`,
    `completedAt: ${job.completedAt || '-'}`,
    `age: ${timing?.age || '-'}`,
    `queueWait: ${timing?.queuedFor || '-'}`,
    `activeFor: ${timing?.activeFor || '-'}`,
    `endToEnd: ${timing?.endToEnd || '-'}`,
    `lastUpdatedAt: ${timing?.lastUpdatedAt || '-'}`,
    `lastUpdatedAgo: ${sinceLabel(timing?.lastUpdatedAt)}`,
    `failure: ${job.failureReason || '-'}`,
    `failureCategory: ${job.failureCategory || '-'}`,
    `retryable: ${job.dispatch?.retryable ?? '-'}`,
    `nextRetryAt: ${job.dispatch?.nextRetryAt || '-'}`,
    `nextRetryIn: ${untilLabel(job.dispatch?.nextRetryAt)}`,
    `dispatchStatus: ${job.dispatch?.responseStatus || '-'}`,
    `dispatchAttempts: ${job.dispatch?.attempts ?? '-'}`,
    `endpoint: ${job.dispatch?.endpoint || '-'}`,
    '',
    'estimate:',
    `range: ${job.billingEstimate ? yen(job.billingEstimate.total) : '-'}${estimate ? ` → ${yen(estimate.estimateMax?.total || 0)}` : ''}`,
    `typical: ${estimate?.typical ? yen(estimate.typical.total) : '-'}`,
    `duration: ${estimate ? formatSecRange(estimate.durationMinSec, estimate.durationMaxSec) : '-'}`,
    `confidence: ${estimate?.confidence || '-'}`,
    `actual: ${job.actualBilling ? yen(job.actualBilling.total) : '-'}`,
    '',
    'timeline:',
    ...(traceTimeline(job).length ? traceTimeline(job) : ['-']),
    '',
    'prompt:',
    job.prompt || '-'
  ];
  if (job.output) lines.push('', 'output:', JSON.stringify(job.output, null, 2));
  if (job.actualBilling) lines.push('', 'billing:', JSON.stringify(job.actualBilling, null, 2));
  return lines.join('\n');
}

function setDetail(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && ('taskType' in value || 'assignedAgentId' in value) && els.runActionCard) {
    const action = runNextAction(value);
    els.runActionCard.textContent = `${action.title}\n\n${action.body}`;
    els.runActionCard.className = `detail-box action-card ${action.tone}`;
  }
  safeText(els.jobDetail, typeof value === 'string' ? value : summarizeRun(value));
}

function setAgentRunDraft(agent) {
  if (!els.agentRunDraft) return;
  if (!agent) {
    els.agentRunDraft.textContent = 'Select an agent row.';
    return;
  }
  const fit = agentTaskFit(agent);
  const health = agentHealth(agent);
  const estimate = estimateWindowOfAgent(agent, fit.matches && fit.taskType ? fit.taskType : agent.taskTypes?.[0] || 'research');
  const taskType = fit.matches && fit.taskType ? fit.taskType : agent.taskTypes?.[0] || 'research';
  const prompt = `Inspect ${agent.name} and execute ${taskType} work with deterministic routing.`;
  const nextAction = agentNextAction(agent).title.replace('ACTION: ', '');
  els.agentRunDraft.textContent = `# exact run draft for ${agent.name}
curl -X POST http://127.0.0.1:8787/api/jobs \\
  -H 'content-type: application/json' \\
  -d '{
    "parent_agent_id":"cloudcode-main",
    "task_type":"${taskType}",
    "agent_id":"${agent.id}",
    "prompt":"${prompt}"
  }'

# operator notes
readiness: ${health.label}
availability: ${health.availability}
verify: ${health.verifyLabel}
endpoint: ${health.endpoint || 'missing'}
estimated_total: ${estimate ? `${yen(estimate.estimateMinTotal)} – ${yen(estimate.estimateMaxTotal)}` : '-'}
estimated_time: ${estimate ? formatSecRange(estimate.durationMinSec, estimate.durationMaxSec) : '-'}
handoff: explicit agent_id will be used
create_run_now: ${health.ready && fit.matches ? 'yes' : 'no'}
next_action: ${nextAction}`;
}

function setAgentDetail(agent) {
  const action = agentNextAction(agent);
  if (els.agentActionCard) {
    els.agentActionCard.textContent = `${action.title}\n\n${action.body}`;
    els.agentActionCard.className = `detail-box action-card ${action.tone}`;
  }
  if (!agent) {
    safeText(els.agentDetail, 'Select an agent row.');
    setAgentRunDraft(null);
    return;
  }
  const health = agentHealth(agent);
  const verification = agentVerification(agent);
  const fit = agentTaskFit(agent);
  const verifyAction = agentVerifyAction(agent);
  const verifyFailure = agentVerifyFailureSummary(agent);
  const estimate = estimateWindowOfAgent(agent, fit.matches && fit.taskType ? fit.taskType : agent.taskTypes?.[0] || 'research');
  const relatedJobs = (state.snapshot?.jobs || []).filter((job) => job.assignedAgentId === agent.id);
  const activeJobs = relatedJobs.filter((job) => ['queued', 'claimed', 'running', 'dispatched'].includes(job.status));
  const failedJobs = relatedJobs.filter((job) => ['failed', 'timed_out'].includes(job.status));
  const completedJobs = relatedJobs.filter((job) => job.status === 'completed');
  const endpointLines = health.endpoints.length ? health.endpoints.map((entry) => `${entry.label}: ${entry.value}`) : ['-'];
  const lines = [
    `summary: ${health.availability} / ${health.label} / ${health.verifyLabel} / ${fit.label}`,
    `dispatch_path: ${health.endpoint ? 'ready' : 'missing endpoint'}`,
    `verify_next: ${verifyAction.title}`,
    '',
    `readiness: ${health.label}`,
    `availability: ${health.availability}`,
    `verify: ${health.verifyLabel}`,
    `next_action: ${action.title.replace('ACTION: ', '')}`,
    '',
    'identity:',
    `id: ${agent.id}`,
    `name: ${agent.name}`,
    `owner: ${agent.owner || '-'}`,
    `description: ${agent.description || '-'}`,
    '',
    'selected_agent_fit: ' + fit.label,
    '',
    'pricing / performance:',
    `capabilities: ${(agent.taskTypes || []).join(', ') || '-'}`,
    `successRate: ${formatPercent(agent.successRate)}`,
    `avgLatencySec: ${agent.avgLatencySec ?? '-'}`,
    `premiumRate: ${formatPercent(agent.premiumRate)}`,
    `basicRate: ${formatPercent(agent.basicRate)}`,
    `earnings: ${yen(agent.earnings)}`,
    `estimatedRunCost: ${estimate ? `${yen(estimate.estimateMinTotal)} – ${yen(estimate.estimateMaxTotal)}` : '-'}`,
    `estimatedRunTime: ${estimate ? formatSecRange(estimate.durationMinSec, estimate.durationMaxSec) : '-'}`,
    '',
    'routing:',
    `requestedTask: ${fit.taskType || '-'}`,
    `taskFit: ${fit.label}`,
    `taskFitReason: ${fit.reason}`,
    `jobEndpoint: ${health.endpoint || '-'}`,
    `healthcheckUrl: ${health.healthcheck || '-'}`,
    `manifestUrl: ${agent.manifestUrl || '-'}`,
    `manifestSource: ${agent.manifestSource || '-'}`,
    '',
    'endpoint_inventory:',
    ...endpointLines,
    '',
    'verify_detail:',
    'LAST VERIFY: ' + formatTime(agent.verificationCheckedAt),
    `verificationStatus: ${agent.verificationStatus || '-'}`,
    `verificationCheckedAt: ${formatTime(agent.verificationCheckedAt)}`,
    `verificationAge: ${sinceLabel(agent.verificationCheckedAt)}`,
    `verifyCategory: ${verification.category || '-'}`,
    `verifyCode: ${verification.code || '-'}`,
    `verificationError: ${agent.verificationError || verification.reason || '-'}`,
    `verificationCause: ${verifyFailure.cause}`,
    `verifyNextAction: ${verifyAction.title}`,
    `verifyActionReason: ${verifyAction.body}`,
    `verifyOperatorNext: ${verifyFailure.next}`,
    '',
    'load:',
    `activeRuns: ${activeJobs.length}`,
    `failedRuns: ${failedJobs.length}`,
    `completedRuns: ${completedJobs.length}`,
    '',
    'operator_note:',
    health.reason,
    '',
    'dispatch_recommendation:',
    `route_mode: ${health.ready ? 'explicit agent_id is safe' : 'fix readiness before deterministic routing'}`,
    `run_task: ${fit.taskType || agent.taskTypes?.[0] || '-'}`,
    `routing_warning: ${fit.matches ? 'none' : fit.reason}`
  ];
  safeText(els.agentDetail, lines.join('\n'));
  setAgentRunDraft(agent);
}

function setJobTrace(job) {
  if (!els.jobTrace) return;
  if (!job) {
    els.jobTrace.textContent = 'Select a run row.';
    return;
  }
  const timing = runTiming(job);
  const lines = [
    `status: ${job.status}`,
    `failureReason: ${job.failureReason || '-'}`,
    `failureCategory: ${job.failureCategory || '-'}`,
    `age: ${timing?.age || '-'}`,
    `queueWait: ${timing?.queuedFor || '-'}`,
    `activeFor: ${timing?.activeFor || '-'}`,
    `lastUpdatedAgo: ${sinceLabel(timing?.lastUpdatedAt)}`,
    '',
    'timeline:',
    ...(traceTimeline(job).length ? traceTimeline(job) : ['-']),
    '',
    'dispatch:',
    JSON.stringify(job.dispatch || null, null, 2),
    '',
    'logs:',
    ...((job.logs || []).length ? job.logs.map((line, index) => `${index + 1}. ${line}`) : ['-'])
  ];
  els.jobTrace.textContent = lines.join('\n');
}

function renderRunHealth(stats = {}) {
  if (!els.runHealthSummary) return;
  const nextRetry = stats.nextRetryAt ? new Date(stats.nextRetryAt).toLocaleString('ja-JP') : '-';
  els.runHealthSummary.textContent = [
    `activeRuns: ${stats.activeJobs ?? 0}`,
    `retryableRuns: ${stats.retryableRuns ?? 0}`,
    `timedOutRuns: ${stats.timedOutRuns ?? 0}`,
    `terminalRuns: ${stats.terminalRuns ?? 0}`,
    `nextRetryAt: ${nextRetry}`,
    `failedRuns: ${stats.failedJobs ?? 0}`
  ].join('\n');
}

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('[data-screen]').forEach((node) => {
    node.hidden = node.dataset.screen !== tab;
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  safeText($('tabSummary'), TAB_SUMMARY[tab] || '');
}

function flash(message, kind = 'ok') {
  if (!els.flash) return;
  els.flash.hidden = false;
  els.flash.textContent = message;
  els.flash.className = `box flash ${kind}`;
}

function clearFlash() {
  if (!els.flash) return;
  els.flash.hidden = true;
  els.flash.textContent = '';
  els.flash.className = 'box flash';
}

function renderStream(events = []) {
  if (!els.stream) return;
  const q = (state.eventFilter || '').trim().toLowerCase();
  const filtered = !q ? events : events.filter((event) => `${event.type} ${event.message}`.toLowerCase().includes(q));
  els.stream.innerHTML = '';
  filtered.slice(-100).reverse().forEach((event) => {
    const row = document.createElement('div');
    row.className = 'log-line';
    const costText = event.meta?.settlement?.total ? ` · ${yen(event.meta.settlement.total)}` : event.meta?.billable?.totalCostBasis ? ` · basis ${yen(event.meta.billable.totalCostBasis)}` : '';
    row.innerHTML = `<span class="ts">${new Date(event.ts).toLocaleTimeString('ja-JP')}</span><span class="type-${event.type}">[${event.type}]</span> ${event.message}${costText}`;
    row.onclick = () => setDetail(event);
    els.stream.appendChild(row);
  });
}

function renderAgentTaskFilter(agents = []) {
  if (!els.agentTaskFilter) return;
  const previous = state.agentTaskFilter || '';
  const taskTypes = [...new Set(agents.flatMap((agent) => agent.taskTypes || []))].sort();
  els.agentTaskFilter.innerHTML = `<option value="">all capabilities</option>${taskTypes.map((taskType) => `<option value="${taskType}">${taskType}</option>`).join('')}`;
  els.agentTaskFilter.value = taskTypes.includes(previous) ? previous : '';
  state.agentTaskFilter = els.agentTaskFilter.value || '';
}

function applyAgentQuickFilter(mode) {
  if (!els.agentSearch || !els.agentStatusFilter || !els.agentAvailabilityFilter || !els.agentActionFilter || !els.agentTaskFilter) return;
  const routingTask = currentRoutingTask();
  if (mode === 'ready') {
    els.agentSearch.value = routingTask ? `fit:match task:${routingTask}` : '';
    els.agentStatusFilter.value = 'ready';
    els.agentAvailabilityFilter.value = 'online';
    els.agentActionFilter.value = 'dispatch';
    els.agentTaskFilter.value = routingTask || '';
  } else if (mode === 'verify-failures') {
    els.agentSearch.value = 'verify:failed';
    els.agentStatusFilter.value = 'unverified';
    els.agentAvailabilityFilter.value = '';
    els.agentActionFilter.value = 'verify';
    els.agentTaskFilter.value = '';
  } else if (mode === 'missing-endpoint') {
    els.agentSearch.value = 'endpoint:missing';
    els.agentStatusFilter.value = 'verified';
    els.agentAvailabilityFilter.value = '';
    els.agentActionFilter.value = 'endpoint';
    els.agentTaskFilter.value = '';
  } else if (mode === 'task-mismatch') {
    els.agentSearch.value = routingTask ? `fit:mismatch task:${routingTask}` : 'fit:mismatch';
    els.agentStatusFilter.value = 'ready';
    els.agentAvailabilityFilter.value = 'online';
    els.agentActionFilter.value = '';
    els.agentTaskFilter.value = '';
  }
  state.agentSearch = els.agentSearch.value || '';
  if (state.snapshot) renderAgents(state.snapshot.agents || []);
}

function renderAgentOps(agents = []) {
  const verified = agents.filter((agent) => agentHealth(agent).verified);
  const ready = agents.filter((agent) => agentHealth(agent).ready);
  const verifyFailed = agents.filter((agent) => agentHealth(agent).label === 'VERIFY FAIL');
  const degraded = agents.filter((agent) => agentHealth(agent).tone !== 'ok');
  const offline = agents.filter((agent) => !agent.online);
  const noEndpoint = agents.filter((agent) => agentHealth(agent).verified && !agentHealth(agent).endpoint);
  const capabilityCoverage = new Set(agents.flatMap((agent) => agent.taskTypes || [])).size;
  const routingTask = currentRoutingTask();
  const taskReady = ready.filter((agent) => agentTaskFit(agent, routingTask).matches);
  safeText(els.verifiedAgents, verified.length);
  safeText(els.readyAgents, ready.length);
  safeText(els.verifyFailedAgents, verifyFailed.length);
  safeText(els.missingEndpointAgents, noEndpoint.length);
  safeText(els.offlineAgents, offline.length);
  safeText(els.agentCoverage, capabilityCoverage);
  if (els.agentRoutingCoverage) {
    els.agentRoutingCoverage.textContent = `ROUTING TASK COVERAGE · task=${routingTask || '-'} · ready=${taskReady.length}/${ready.length || 0}`;
  }
  if (!els.agentOpsBoard) return;
  const list = taskReady.slice(0, 4).map((agent) => `${agent.name} · ${(agent.taskTypes || []).join('/')} · ${yen(estimateWindowOfAgent(agent, routingTask || agent.taskTypes?.[0])?.typicalTotal || 0)}`).join('\n') || '-';
  const mismatchList = ready.filter((agent) => !agentTaskFit(agent, routingTask).matches).slice(0, 4).map((agent) => `${agent.name}: ${(agent.taskTypes || []).join('/') || 'no declared capability'}`).join('\n') || '-';
  els.agentOpsBoard.textContent = [
    `connected_agents: ${agents.length}`,
    `verified: ${verified.length}`,
    `ready_now: ${ready.length}`,
    `needs_attention: ${degraded.length}`,
    `offline: ${offline.length}`,
    `routing_task: ${routingTask || '-'}`,
    '',
    'best current dispatch candidates:',
    list,
    '',
    'task_mismatch_examples:',
    mismatchList
  ].join('\n');
}

function renderRunAgentContext() {
  if (!els.agentRunContext) return;
  const enteredAgentId = String(els.jobAgentId?.value || '').trim();
  const agent = currentRunTargetAgent();
  if (!enteredAgentId) {
    els.agentRunContext.textContent = 'No agent pinned. Auto-routing is active.';
    els.agentRunContext.className = 'detail-box action-card info compact-card';
    return;
  }
  if (!agent) {
    els.agentRunContext.textContent = [
      `Pinned agent_id: ${enteredAgentId}`,
      'handoff: explicit agent_id will be used on CREATE RUN',
      'status: agent is not loaded in the current registry snapshot',
      'next: verify the exact id or clear the pin to return to auto-routing'
    ].join('\n');
    els.agentRunContext.className = 'detail-box action-card warn compact-card';
    return;
  }
  const health = agentHealth(agent);
  const fit = agentTaskFit(agent);
  const verifyAction = agentVerifyAction(agent);
  const runAction = agentNextAction(agent);
  const selected = selectedAgent();
  const source = selected?.id === agent.id ? 'selected agent row' : 'manual agent_id entry';
  const createNow = health.ready && fit.matches;
  els.agentRunContext.textContent = [
    `Pinned agent: ${agent.name}`,
    `agent_id: ${agent.id}`,
    `handoff: CREATE RUN will use explicit agent_id from ${source}`,
    `readiness: ${health.label}`,
    `availability: ${health.availability}`,
    `task_fit: ${fit.label}`,
    `requested_task: ${fit.taskType || '-'}`,
    `capabilities: ${(agent.taskTypes || []).join(', ') || '-'}`,
    `endpoint: ${health.endpoint || 'missing'}`,
    `create_run_now: ${createNow ? 'yes' : 'no'}`,
    `verify_next: ${verifyAction.title}`,
    `next: ${runAction.title.replace('ACTION: ', '')}`
  ].join('\n');
  els.agentRunContext.className = `detail-box action-card ${createNow ? 'ok' : (fit.matches ? health.tone : 'warn')} compact-card`;
}

function renderRunEstimateCard() {
  if (!els.runEstimateCard) return;
  const taskType = String(els.jobType?.value || '').trim().toLowerCase() || 'research';
  const agent = currentRunTargetAgent() || selectedAgent() || (state.snapshot?.agents || []).find((item) => agentHealth(item).ready && agentTaskFit(item, taskType).matches) || null;
  if (!agent) {
    els.runEstimateCard.textContent = `Task: ${taskType}\nEstimate: choose or register a verified agent first.\nTime: unavailable\nWhy: no ready agent currently matches this routing context.`;
    els.runEstimateCard.className = 'detail-box action-card warn compact-card';
    return;
  }
  const estimate = estimateWindowOfAgent(agent, taskType);
  const why = [
    `agent=${agent.name}`,
    `task=${taskType}`,
    `success=${formatPercent(agent.successRate)}`,
    `latency=${agent.avgLatencySec || '-'}s`,
    `confidence=${estimate.confidence}`
  ].join(' · ');
  els.runEstimateCard.textContent = [
    `Estimated cost: ${yen(estimate.estimateMinTotal)} – ${yen(estimate.estimateMaxTotal)}`,
    `Typical: ${yen(estimate.typicalTotal)}`,
    `Estimated time: ${formatSecRange(estimate.durationMinSec, estimate.durationMaxSec)}`,
    `Why this estimate: ${why}`
  ].join('\n');
  els.runEstimateCard.className = 'detail-box action-card ok compact-card';
}

function renderAgentFilterSummary(agents = []) {
  if (!els.agentFilterSummary) return;
  const filtered = agents.filter(agentMatchesFilters);
  const selected = selectedAgent();
  const filters = [
    state.agentSearch && `search="${state.agentSearch}"`,
    state.agentStatusFilter && `state=${state.agentStatusFilter}`,
    state.agentAvailabilityFilter && `availability=${state.agentAvailabilityFilter}`,
    state.agentActionFilter && `next=${state.agentActionFilter}`,
    state.agentTaskFilter && `task=${state.agentTaskFilter}`,
    state.agentSort && `sort=${state.agentSort}`
  ].filter(Boolean);
  els.agentFilterSummary.textContent = `${filtered.length}/${agents.length} agents shown${filters.length ? ` • ${filters.join(' • ')}` : ''}${selected ? ` • selected=${selected.name}` : ''}`;
}

function agentActionKey(agent) {
  const action = agentNextAction(agent);
  if (action.title.includes('READY FOR DISPATCH')) return 'dispatch';
  if (action.title.includes('VERIFY AGENT')) return 'verify';
  if (action.title.includes('RESTORE AVAILABILITY')) return 'restore';
  if (action.title.includes('ADD JOB ENDPOINT')) return 'endpoint';
  return 'verify';
}

function agentMatchesFilters(agent) {
  const { tokens, free } = parseSearchTokens(state.agentSearch);
  const statusFilter = state.agentStatusFilter.trim().toLowerCase();
  const availabilityFilter = state.agentAvailabilityFilter.trim().toLowerCase();
  const actionFilter = state.agentActionFilter.trim().toLowerCase();
  const taskFilter = state.agentTaskFilter.trim().toLowerCase();
  const health = agentHealth(agent);
  const nextAction = agentNextAction(agent);
  const verification = agentVerification(agent);
  const fit = agentTaskFit(agent);
  const verifyAction = agentVerifyAction(agent);
  const endpointText = health.endpoints.map((entry) => `${entry.label} ${entry.value}`).join(' ');
  const hay = [
    agent.name,
    agent.description,
    agent.owner,
    (agent.taskTypes || []).join(' '),
    agent.verificationStatus,
    health.verifyLabel,
    health.label,
    health.availability,
    health.endpoint,
    health.healthcheck,
    health.reason,
    verification.category,
    verification.code,
    verification.reason,
    nextAction.title,
    nextAction.body,
    fit.label,
    fit.reason,
    verifyAction.title,
    verifyAction.body,
    agent.manifestUrl,
    agent.manifestSource,
    endpointText
  ].filter(Boolean).join(' ').toLowerCase();
  const matchesSearch = !free.length || free.every((part) => hay.includes(part));
  const matchesToken = tokens.every(({ key, value }) => {
    if (!value) return true;
    if (['status', 'state'].includes(key)) return [health.label, health.availability, health.verifyLabel, agent.verificationStatus].join(' ').toLowerCase().includes(value);
    if (['availability', 'avail'].includes(key)) return [health.availability, agent.online ? 'online' : 'offline'].join(' ').toLowerCase().includes(value);
    if (['task', 'cap', 'capability'].includes(key)) return (agent.taskTypes || []).some((task) => String(task).toLowerCase().includes(value));
    if (key === 'owner') return String(agent.owner || '').toLowerCase().includes(value);
    if (key === 'verify') return [agent.verificationStatus, health.verifyLabel, verification.category, verification.code, verification.reason].join(' ').toLowerCase().includes(value);
    if (['action', 'next'].includes(key)) return [nextAction.title, nextAction.body].join(' ').toLowerCase().includes(value);
    if (['fit', 'route'].includes(key)) {
      if (value === 'match') return fit.matches;
      if (value === 'mismatch') return !fit.matches;
      return [fit.label, fit.reason].join(' ').toLowerCase().includes(value);
    }
    if (key === 'endpoint') {
      if (value === 'missing') return !health.endpoint;
      if (value === 'present') return Boolean(health.endpoint);
      return [health.endpoint, health.healthcheck, endpointText].join(' ').toLowerCase().includes(value);
    }
    return hay.includes(value);
  });
  const matchesTask = !taskFilter || (agent.taskTypes || []).includes(taskFilter);
  const degraded = health.tone !== 'ok';
  const matchesStatus = !statusFilter || (statusFilter === 'ready' && health.ready) || (statusFilter === 'verified' && health.verified) || (statusFilter === 'unverified' && !health.verified) || (statusFilter === 'offline' && !agent.online) || (statusFilter === 'degraded' && degraded);
  const matchesAvailability = !availabilityFilter || (availabilityFilter === 'online' && agent.online) || (availabilityFilter === 'offline' && !agent.online);
  const matchesAction = !actionFilter || agentActionKey(agent) === actionFilter;
  return matchesSearch && matchesToken && matchesTask && matchesStatus && matchesAvailability && matchesAction;
}


function refreshRoutingViews() {
  renderRunAgentContext();
  renderRunEstimateCard();
  if (state.snapshot) {
    renderAgentOps(state.snapshot.agents || []);
    renderAgents(state.snapshot.agents || []);
    updateCliPanels(state.snapshot);
  }
  const agent = selectedAgent();
  if (agent) setAgentDetail(agent);
}

function updateCliPanels(snapshot) {
  const agents = snapshot?.agents || [];
  const jobs = snapshot?.jobs || [];
  const verified = agents.filter((agent) => agentHealth(agent).verified);
  const ready = agents.filter((agent) => agentHealth(agent).ready);
  const primaryAgent = selectedAgent() || ready[0] || verified[0] || agents[0] || null;
  const recentRun = selectedJob() || jobs[0] || null;
  const estimate = primaryAgent ? estimateWindowOfAgent(primaryAgent, primaryAgent.taskTypes?.[0] || 'research') : null;
  if (els.cliStatus) {
    els.cliStatus.textContent = [
      `guest_mode: ${snapshot?.auth?.loggedIn ? 'off' : 'on'}`,
      `github_login_available: ${snapshot?.auth?.githubConfigured}`,
      `storage_kind: ${snapshot?.storage?.kind || '-'}`,
      `deploy_target: cloudflare-worker`,
      `verified_agents: ${verified.length}`,
      `ready_agents: ${ready.length}`,
      `recent_run: ${recentRun?.id || '-'}`
    ].join('\n');
  }
  if (els.cliFlow) {
    els.cliFlow.textContent = [
      '1. register or import an agent manifest',
      '2. verify the agent until it reaches verified/ready',
      `3. create a run${primaryAgent ? ` with agent_id=${primaryAgent.id}` : ' with auto-matching'}`,
      '4. inspect /api/jobs, /api/jobs/:id, and /api/snapshot',
      '5. retry dispatch or submit callback/manual result when needed'
    ].join('\n');
  }
  if (els.cliQuickstart) {
    els.cliQuickstart.textContent = `# current operator path: wrangler + curl\n\nnpm install\nnpx wrangler dev\n\n# smoke check worker health\ncurl http://127.0.0.1:8787/api/health\ncurl http://127.0.0.1:8787/api/ready\ncurl http://127.0.0.1:8787/api/snapshot\n\n# inspect agent supply before routing work\ncurl http://127.0.0.1:8787/api/agents\n\n# create a run${primaryAgent ? ` against ${primaryAgent.id}` : ''}\ncurl -X POST http://127.0.0.1:8787/api/jobs \\
  -H 'content-type: application/json' \\
  -d '{\n    "parent_agent_id":"cloudcode-main",\n    "task_type":"${primaryAgent?.taskTypes?.[0] || 'research'}",\n    "agent_id":"${primaryAgent?.id || 'agent_id_optional'}",\n    "prompt":"${recentRun?.prompt || 'Compare used iPhone resale routes'}"\n  }'\n\n# typical estimate\n# ${estimate ? `${yen(estimate.estimateMinTotal)} – ${yen(estimate.estimateMaxTotal)} · ${formatSecRange(estimate.durationMinSec, estimate.durationMaxSec)}` : 'estimate unavailable'}\n\n# deploy to Cloudflare\nnpx wrangler deploy`;
  }
  if (els.apiExamples) {
    els.apiExamples.textContent = `# create run\ncurl -X POST /api/jobs \\
  -H 'content-type: application/json' \\
  -d '{\n    "parent_agent_id":"cloudcode-main",\n    "task_type":"${primaryAgent?.taskTypes?.[0] || 'research'}",\n    "agent_id":"${primaryAgent?.id || 'optional-agent-id'}",\n    "prompt":"Inspect a verified agent and route work deterministically"\n  }'\n\n# list agents and readiness\ncurl /api/agents\ncurl /api/snapshot\n\n# inspect one run\ncurl /api/jobs/${recentRun?.id || '<job_id>'}\n\n# claim a run for a connected agent\ncurl -X POST /api/jobs/${recentRun?.id || '<job_id>'}/claim \\n  -H 'content-type: application/json' \\n  -d '{"agent_id":"${primaryAgent?.id || '<agent_id>'}"}'\n\n# manual completion for a connected agent\ncurl -X POST /api/jobs/${recentRun?.id || '<job_id>'}/result \\
  -H 'content-type: application/json' \\
  -d '{\n    "agent_id":"${primaryAgent?.id || '<agent_id>'}",\n    "status":"completed",\n    "output":{"summary":"Connected agent finished the task"},\n    "usage":{"total_cost_basis":96,"compute_cost":28,"tool_cost":18,"labor_cost":50}\n  }'\n\n# retry a failed or timed_out dispatch\ncurl -X POST /api/dev/dispatch-retry \\
  -H 'content-type: application/json' \\
  -d '{"job_id":"${recentRun?.id || '<job_id>'}"}'\n\n# health\ncurl /api/health`;
  }
}

function renderAgents(agents = []) {
  if (!els.agentsTable) return;
  const myLogin = state.snapshot?.auth?.user?.login;
  const filtered = [...agents].filter(agentMatchesFilters).sort(compareAgents);
  renderAgentFilterSummary(agents);
  if (!filtered.length) {
    els.agentsTable.innerHTML = '<div class="empty">No agents match the current filter.</div>';
    return;
  }
  els.agentsTable.innerHTML = `<div class="table-header agents-grid"><div>NAME</div><div>CAPABILITIES / ENDPOINT</div><div>SUCCESS / LATENCY</div><div>STATUS</div><div>EST COST</div><div>NEXT ACTION</div><div>VERIFY</div></div>${filtered.map((agent) => {
    const health = agentHealth(agent);
    const nextAction = agentNextAction(agent);
    const verification = agentVerification(agent);
    const fit = agentTaskFit(agent);
    const verifyAction = agentVerifyAction(agent);
    const estimate = estimateWindowOfAgent(agent, fit.matches && fit.taskType ? fit.taskType : agent.taskTypes?.[0] || 'research');
    return `
    <div class="table-row agents-grid ${state.selectedAgentId === agent.id ? 'selected-row' : ''} ${agent.online ? 'agent-row-online' : 'agent-row-offline'}" data-agent-id="${agent.id}">
      <div>${agent.name}${myLogin && agent.owner === myLogin ? ' <span class="highlight">[MY AGENT]</span>' : ''}<div class="row-muted">${agent.owner || '-'}</div><div class="row-muted">${agent.id.slice(0, 12)}</div></div>
      <div>${(agent.taskTypes || []).join(', ') || 'no declared capability'}<div class="row-muted">${health.endpointLabel}: ${shortUrl(health.endpoint)}</div><div class="row-muted">${health.healthLabel}: ${shortUrl(health.healthcheck)}</div></div>
      <div>${Math.round((agent.successRate || 0) * 100)}%<div class="row-muted">${agent.avgLatencySec || '-'}s avg</div><div class="row-muted">premium ${Math.round((agent.premiumRate || 0) * 100)}%</div></div>
      <div><span class="status-pill ${agent.online ? 'ok' : 'error'}">${health.availability}</span> <span class="status-pill ${health.tone}">${health.label}</span><div class="row-muted">${health.verifyLabel} / ${agent.verificationStatus || 'legacy_unverified'}</div><div class="row-muted">${fit.label}</div></div>
      <div>${estimate ? `${yen(estimate.estimateMinTotal)} – ${yen(estimate.estimateMaxTotal)}` : '-'}<div class="row-muted">${estimate ? formatSecRange(estimate.durationMinSec, estimate.durationMaxSec) : '-'}</div><div class="row-muted">typical ${estimate ? yen(estimate.typicalTotal) : '-'}</div></div>
      <div><span class="status-pill ${nextAction.tone}">${nextAction.title.replace('ACTION: ', '')}</span><div class="row-muted">${nextAction.body}</div><div class="row-muted">next verify step: ${verifyAction.title}</div></div>
      <div>${formatTime(agent.verificationCheckedAt)}<div class="row-muted">${sinceLabel(agent.verificationCheckedAt)}</div><div class="row-muted">${verification.code || 'no verify code'} / ${verification.details?.statusCode ?? '-'}</div>${agent.verificationStatus === 'verified' ? '' : `<button class="mini-btn verify-agent-btn" data-verify-agent="${agent.id}" style="margin-top:6px">VERIFY</button>`}</div>
    </div>`;
  }).join('')}`;

  [...els.agentsTable.querySelectorAll('[data-agent-id]')].forEach((row) => {
    row.onclick = () => {
      const agent = agents.find((item) => item.id === row.dataset.agentId);
      state.selectedAgentId = agent?.id || null;
      setAgentDetail(agent);
      applyAgentToRunForm(agent);
      if (els.claimAgentId && agent?.id) els.claimAgentId.value = agent.id;
      renderRunAgentContext();
      renderRunEstimateCard();
      renderAgents(state.snapshot?.agents || []);
      updateCliPanels(state.snapshot);
    };
  });

  [...els.agentsTable.querySelectorAll('[data-verify-agent]')].forEach((btn) => {
    btn.onclick = async (event) => {
      event.stopPropagation();
      await runAction(btn, async () => {
        const id = btn.dataset.verifyAgent;
        const result = await api(`/api/agents/${id}/verify`, { method: 'POST' });
        state.selectedAgentId = id;
        setAgentDetail(result.agent);
        renderRunAgentContext();
        renderRunEstimateCard();
        const verifyFailure = agentVerifyFailureSummary(result.agent);
        flash(result.verification?.ok ? `Agent ${id.slice(0, 8)} verified.` : `Agent ${id.slice(0, 8)} verification failed: ${verifyFailure.cause} Next: ${verifyFailure.next}`, result.verification?.ok ? 'ok' : 'error');
        await refresh();
      });
    };
  });
}

function renderJobs(jobs = []) {
  if (!els.jobsTable) return;
  const q = state.runSearch.trim().toLowerCase();
  const statusFilter = state.runStatusFilter.trim().toLowerCase();
  const actionFilter = state.runActionFilter.trim().toLowerCase();
  const filtered = jobs.filter((job) => {
    const matchesStatus = !statusFilter || String(job.status || '').toLowerCase() === statusFilter;
    const hay = [job.id, job.taskType, job.status, job.assignedAgentId, job.failureReason, job.failureCategory, job.dispatch?.responseStatus, job.prompt].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !q || hay.includes(q);
    const matchesAction = !actionFilter || runActionKey(job) === actionFilter;
    return matchesStatus && matchesSearch && matchesAction;
  });
  if (!filtered.length) {
    els.jobsTable.innerHTML = '<div class="empty">No runs match the current filter.</div>';
    return;
  }
  els.jobsTable.innerHTML = `<div class="table-header runs-grid"><div>RUN</div><div>TYPE</div><div>STATUS</div><div>AGENT</div><div>ESTIMATE</div><div>NEXT ACTION</div><div>FAILURE</div><div>CREATED / AGE</div></div>${filtered.map((job) => {
    const nextAction = runNextAction(job);
    const estimate = job.estimateWindow;
    return `
    <div class="table-row runs-grid ${state.selectedJobId === job.id ? 'selected-row' : ''}" data-job-id="${job.id}">
      <div>${job.id.slice(0, 8)}</div>
      <div>${job.taskType}</div>
      <div class="${job.status}">${String(job.status || '').toUpperCase()}<div class="row-muted">${job.dispatch?.responseStatus || '-'}</div></div>
      <div>${job.assignedAgentId ? job.assignedAgentId.slice(0, 14) : '-'}<div class="row-muted">score=${job.score ?? '-'}</div></div>
      <div>${job.billingEstimate ? yen(job.billingEstimate.total) : '-'}<div class="row-muted">${estimate ? `${yen(estimate.estimateMin?.total || 0)} – ${yen(estimate.estimateMax?.total || 0)}` : '-'}</div><div class="row-muted">${estimate ? formatSecRange(estimate.durationMinSec, estimate.durationMaxSec) : '-'}</div></div>
      <div><span class="status-pill ${nextAction.tone}">${nextAction.title.replace('ACTION: ', '').replace('RUN ', '')}</span><div class="row-muted">${nextAction.body}</div></div>
      <div>${job.failureReason || '-'}<div class="row-muted">${job.failureCategory || '-'}</div></div>
      <div>${new Date(job.createdAt).toLocaleString('ja-JP')}<div class="row-muted">${sinceLabel(job.createdAt)}</div></div>
    </div>`;
  }).join('')}`;
  [...els.jobsTable.querySelectorAll('[data-job-id]')].forEach((row) => {
    row.onclick = () => {
      const job = jobs.find((item) => item.id === row.dataset.jobId);
      state.selectedJobId = job?.id || null;
      setDetail(job);
      setJobTrace(job);
      renderJobs(state.snapshot?.jobs || []);
    };
  });
}

function renderOpenJobs(jobs = []) {
  if (!els.openJobsTable) return;
  const open = jobs.filter((job) => ['queued', 'claimed', 'running', 'dispatched'].includes(job.status));
  if (!open.length) {
    els.openJobsTable.innerHTML = '<div class="empty">No open runs now.</div>';
    return;
  }
  els.openJobsTable.innerHTML = `<div class="table-header jobs-grid"><div>RUN</div><div>TYPE</div><div>STATUS</div><div>AGENT</div><div>SCORE</div><div>CREATED</div></div>${open.map((job) => `
    <div class="table-row jobs-grid" data-open-job-id="${job.id}">
      <div>${job.id.slice(0, 8)}</div>
      <div>${job.taskType}</div>
      <div class="${job.status}">${String(job.status || '').toUpperCase()}</div>
      <div>${job.assignedAgentId ? job.assignedAgentId.slice(0, 14) : '-'}</div>
      <div>${job.score ?? '-'}</div>
      <div>${new Date(job.createdAt).toLocaleString('ja-JP')}</div>
    </div>`).join('')}`;
  [...els.openJobsTable.querySelectorAll('[data-open-job-id]')].forEach((row) => {
    row.onclick = () => {
      const job = open.find((item) => item.id === row.dataset.openJobId);
      if (job) {
        if (els.claimJobId) els.claimJobId.value = job.id;
        if (els.claimAgentId && job.assignedAgentId) els.claimAgentId.value = job.assignedAgentId;
        setDetail(job);
        setJobTrace(job);
      }
    };
  });
}

function renderBilling(jobs = []) {
  if (!els.billingTable) return;
  const billed = jobs.filter((job) => job.actualBilling);
  if (!billed.length) {
    els.billingTable.innerHTML = '<div class="empty">No billed runs yet.</div>';
    return;
  }
  els.billingTable.innerHTML = `<div class="table-header billing-grid"><div>RUN</div><div>STATUS</div><div>BASIS</div><div>PAYOUT</div><div>PLATFORM</div><div>TOTAL</div></div>${billed.map((job) => `
    <div class="table-row billing-grid" data-bill-id="${job.id}">
      <div>${job.id.slice(0, 8)}</div>
      <div class="${job.status}">${String(job.status || '').toUpperCase()}</div>
      <div>${yen(job.actualBilling.totalCostBasis ?? job.actualBilling.apiCost)}</div>
      <div>${yen(job.actualBilling.agentPayout)}</div>
      <div>${yen(job.actualBilling.platformRevenue)}</div>
      <div>${yen(job.actualBilling.total)}</div>
    </div>`).join('')}`;
  [...els.billingTable.querySelectorAll('[data-bill-id]')].forEach((row) => {
    row.onclick = () => {
      const job = jobs.find((item) => item.id === row.dataset.billId);
      setDetail(job);
    };
  });
}

function renderBillingAudits(audits = []) {
  if (!els.billingAuditTable) return;
  if (!audits.length) {
    els.billingAuditTable.innerHTML = '<div class="empty">No billing audits yet.</div>';
    return;
  }
  els.billingAuditTable.innerHTML = `<div class="table-header billing-grid"><div>RUN</div><div>SOURCE</div><div>BASIS</div><div>PAYOUT</div><div>PLATFORM</div><div>TOTAL</div></div>${audits.map((audit) => `
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
  if (!auth || !els.authStatus) return;
  const lines = [
    `loggedIn: ${auth.loggedIn}`,
    `githubConfigured: ${auth.githubConfigured}`,
    `user: ${auth.user ? `${auth.user.login} (${auth.user.name || '-'})` : '-'}`,
    `profile: ${auth.user?.profileUrl || '-'}`
  ];
  els.authStatus.textContent = lines.join('\n');
  if (els.githubLoginBtn) els.githubLoginBtn.disabled = !auth.githubConfigured;
  if (els.logoutBtn) els.logoutBtn.disabled = !auth.loggedIn;
}

function render(snapshot) {
  state.snapshot = snapshot;
  const { stats, agents, jobs, events, storage, auth, billingAudits } = snapshot;
  renderAgentTaskFilter(agents);
  safeText(els.activeJobs, stats.activeJobs);
  safeText(els.onlineAgents, stats.onlineAgents);
  safeText(els.grossVolume, yen(stats.grossVolume));
  safeText(els.platformRevenue, yen(stats.platformRevenue));
  safeText(els.todayCost, yen(stats.todayCost));
  safeText(els.failedJobs, stats.failedJobs);
  safeText(els.storageDetail, `kind: ${storage.kind}\npersistent: ${storage.supportsPersistence}\npath: ${storage.path || '-'}\nnote: ${storage.note || '-'}\n\nCloudflare target: bind D1 in wrangler.jsonc and keep Worker APIs aligned with the UI.`);
  renderAuth(auth);
  renderStream(events);
  renderRunHealth(stats);
  renderAgentOps(agents);
  renderAgents(agents);
  renderRunAgentContext();
  renderRunEstimateCard();
  renderJobs(jobs);
  renderOpenJobs(jobs);
  renderBilling(jobs);
  renderBillingAudits(billingAudits || []);
  updateCliPanels(snapshot);
  if (state.selectedJobId) {
    const job = snapshot.jobs.find((item) => item.id === state.selectedJobId);
    if (job) {
      setDetail(job);
      setJobTrace(job);
    }
  }
  if (state.selectedAgentId) {
    const agent = snapshot.agents.find((item) => item.id === state.selectedAgentId);
    if (agent) setAgentDetail(agent);
  }
}

async function refresh() {
  render(await api('/api/snapshot'));
}

function applyRepoFilter() {
  const q = (els.repoSearch?.value || '').trim().toLowerCase();
  state.filteredRepos = !q ? [...state.repos] : state.repos.filter((repo) => `${repo.fullName} ${repo.description || ''}`.toLowerCase().includes(q));
  state.repoPage = 0;
  renderRepoPicker();
}

function renderRepoPicker() {
  if (!els.repoPicker) return;
  const start = state.repoPage * state.repoPageSize;
  const items = state.filteredRepos.slice(start, start + state.repoPageSize);
  els.repoPicker.innerHTML = items.length ? items.map((repo, index) => `<option value="${start + index}">${repo.fullName}${repo.private ? ' 🔒' : ''}</option>`).join('') : '<option value="">No repos found</option>';
  const totalPages = Math.max(1, Math.ceil(state.filteredRepos.length / state.repoPageSize));
  if (els.repoPagerStatus) els.repoPagerStatus.textContent = `${state.filteredRepos.length} repos / page ${state.repoPage + 1} of ${totalPages}`;
  if (els.repoPrevBtn) els.repoPrevBtn.disabled = state.repoPage <= 0;
  if (els.repoNextBtn) els.repoNextBtn.disabled = state.repoPage >= totalPages - 1;
}

function showSelectedRepo() {
  if (!els.repoPicker || !els.repoPreview) return;
  const repo = state.filteredRepos[Number(els.repoPicker.value)] || state.repos[Number(els.repoPicker.value)];
  if (!repo) {
    els.repoPreview.textContent = 'Select a repo to preview manifest load target.';
    return;
  }
  els.repoPreview.textContent = JSON.stringify(repo, null, 2);
}

function loadManifestExample() {
  if (!els.manifestJson) return;
  els.manifestJson.value = JSON.stringify({
    schema_version: 'agent-manifest/v1',
    name: 'codex_worker',
    description: 'Handles code changes and debugging tickets.',
    task_types: ['code', 'debug'],
    pricing: { premium_rate: 0.25, basic_rate: 0.1 },
    success_rate: 0.92,
    avg_latency_sec: 45,
    owner: 'Kuni',
    healthcheck_url: 'https://example.com/api/health',
    verification: {
      challenge_path: '/.well-known/agent-challenge.txt',
      challenge_token: 'replace-me'
    }
  }, null, 2);
}

async function loadBundledManifest(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load sample manifest (${response.status})`);
  const payload = await response.json();
  if (els.manifestJson) els.manifestJson.value = JSON.stringify(payload, null, 2);
  switchTab('agents');
  setDetail({ sample_manifest: path, manifest: payload });
}

function loadJobExample(kind) {
  if (!els.jobParent || !els.jobType || !els.jobPrompt || !els.jobBudget || !els.jobDeadline || !els.jobMode) return;
  els.jobParent.value = 'cloudcode-main';
  if (els.jobAgentId) els.jobAgentId.value = '';
  if (kind === 'research') {
    els.jobType.value = 'research';
    els.jobPrompt.value = 'Compare resale pricing routes for used iPhone 13 in Japan.';
    els.jobBudget.value = '360';
    els.jobDeadline.value = '180';
    els.jobMode.value = 'complete';
  } else if (kind === 'code') {
    els.jobType.value = 'code';
    els.jobPrompt.value = 'Improve run failure visibility and expose retryable state in the UI.';
    els.jobBudget.value = '500';
    els.jobDeadline.value = '240';
    els.jobMode.value = 'complete';
  } else {
    els.jobType.value = 'translation';
    els.jobPrompt.value = 'This should fail cleanly when no verified agent matches the task.';
    els.jobBudget.value = '150';
    els.jobDeadline.value = '60';
    els.jobMode.value = 'create-only';
  }
  renderRunEstimateCard();
}

function applyAgentToRunForm(agent, options = {}) {
  if (!agent) return;
  const fit = agentTaskFit(agent);
  if (els.jobAgentId) els.jobAgentId.value = agent.id;
  if (els.jobType) {
    const preferredTask = fit.matches && fit.taskType ? fit.taskType : agent.taskTypes?.[0] || els.jobType.value || 'research';
    els.jobType.value = preferredTask;
  }
  if (els.jobPrompt && !els.jobPrompt.value.trim()) {
    els.jobPrompt.value = `Run ${(els.jobType?.value || agent.taskTypes?.[0] || 'research')} work on ${agent.name}.`;
  }
  renderRunAgentContext();
  renderRunEstimateCard();
  if (options.switchToRuns) switchTab('work');
  if (options.announce) flash(options.message || `Run form pinned to ${agent.name}.`, 'ok');
}

async function createAndOptionallyRunJob() {
  const payload = {
    parent_agent_id: els.jobParent?.value || 'cloudcode-main',
    task_type: els.jobType?.value || 'research',
    agent_id: (els.jobAgentId?.value || '').trim() || undefined,
    prompt: els.jobPrompt?.value || 'auto task',
    budget_cap: Number(els.jobBudget?.value || 300),
    deadline_sec: Number(els.jobDeadline?.value || 120)
  };
  const created = await api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) });
  state.selectedJobId = created.job_id || state.selectedJobId;
  if (created.matched_agent_id) state.selectedAgentId = created.matched_agent_id;
  flash(`Run ${created.job_id?.slice(0, 8) || ''} ${created.status}.`, created.status === 'failed' ? 'error' : 'ok');
  if ((els.jobMode?.value || 'complete') === 'create-only' || created.status === 'completed' || created.status === 'dispatched' || created.status === 'failed') {
    await refresh();
    return;
  }
  if (els.jobMode?.value === 'external-demo') {
    const claim = await api(`/api/jobs/${created.job_id}/claim`, { method: 'POST', body: JSON.stringify({ agent_id: created.matched_agent_id }) });
    const submit = await api(`/api/jobs/${created.job_id}/result`, { method: 'POST', body: JSON.stringify({ agent_id: created.matched_agent_id, status: 'completed', output: { summary: `Connected aiagent handled: ${els.jobPrompt?.value}` }, usage: { api_cost: Math.max(60, Math.round(Number(els.jobBudget?.value || 300) * 0.3)) } }) });
    setDetail({ created, claim, submit });
    flash(`Run ${created.job_id.slice(0, 8)} dispatched to connected agent demo.`, 'ok');
    await refresh();
    return;
  }
  const dev = await api('/api/dev/resolve-job', { method: 'POST', body: JSON.stringify({ job_id: created.job_id, mode: els.jobMode?.value || 'complete' }) });
  setDetail({ created, resolved: dev });
  flash(`Run ${created.job_id.slice(0, 8)} ${dev.status}.`, dev.status === 'failed' ? 'error' : 'ok');
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
  if (els.repoPreview) els.repoPreview.textContent = state.repos.length ? 'Repos loaded. Select one.' : 'No repos found.';
  flash(`Loaded ${state.repos.length} repos.`, 'ok');
});
if (els.repoPicker) els.repoPicker.onchange = showSelectedRepo;
if (els.repoSearch) els.repoSearch.oninput = applyRepoFilter;
if (els.repoPrevBtn) els.repoPrevBtn.onclick = () => { if (state.repoPage > 0) { state.repoPage -= 1; renderRepoPicker(); } };
if (els.repoNextBtn) els.repoNextBtn.onclick = () => { const totalPages = Math.max(1, Math.ceil(state.filteredRepos.length / state.repoPageSize)); if (state.repoPage < totalPages - 1) { state.repoPage += 1; renderRepoPicker(); } };
if (els.importSelectedRepoBtn) els.importSelectedRepoBtn.onclick = () => runAction(els.importSelectedRepoBtn, async () => {
  const repo = state.filteredRepos[Number(els.repoPicker?.value)] || state.repos[Number(els.repoPicker?.value)];
  if (!repo) throw new Error('Select a repo first.');
  const res = await api('/api/github/load-manifest', { method: 'POST', body: JSON.stringify({ owner: repo.owner, repo: repo.name }) });
  setDetail(res);
  flash(`Loaded manifest-backed agent from ${repo.fullName}. Verify before dispatch.`, 'ok');
  await refresh();
});
if (els.githubLoginBtn) els.githubLoginBtn.onclick = () => { window.location.href = '/auth/github'; };
if (els.logoutBtn) els.logoutBtn.onclick = () => runAction(els.logoutBtn, async () => {
  await api('/auth/logout', { method: 'POST' });
  flash('Logged out.', 'ok');
  await refresh();
});
if (els.refreshBtn) els.refreshBtn.onclick = () => runAction(els.refreshBtn, refresh);
if (els.seedBtn) els.seedBtn.onclick = () => runAction(els.seedBtn, async () => {
  const seeded = await api('/api/seed', { method: 'POST' });
  setDetail(seeded);
  flash(`Seeded ${seeded.job_ids.length} demo runs.`, 'ok');
  await refresh();
});
if (els.heroTryBtn) els.heroTryBtn.onclick = () => { switchTab('work'); loadJobExample('research'); };
if (els.heroWorkBtn) els.heroWorkBtn.onclick = () => switchTab('work');
if (els.heroAgentsBtn) els.heroAgentsBtn.onclick = () => switchTab('agents');
if (els.heroConnectBtn) els.heroConnectBtn.onclick = () => switchTab('connect');
if (els.heroSeedBtn) els.heroSeedBtn.onclick = () => els.seedBtn?.click();
if (els.heroCliBtn) els.heroCliBtn.onclick = () => switchTab('connect');
if (els.registerAgentBtn) els.registerAgentBtn.onclick = () => runAction(els.registerAgentBtn, async () => {
  const res = await api('/api/agents', {
    method: 'POST',
    body: JSON.stringify({
      name: els.agentName?.value,
      description: els.agentDesc?.value,
      task_types: els.agentTasks?.value,
      premium_rate: Number(els.agentPremium?.value || 0.1),
      basic_rate: Number(els.agentBasic?.value || 0.1)
    })
  });
  setDetail(res);
  flash(`Registered ${res.agent.name}. Token shown in detail panel only once.`, 'ok');
  await refresh();
});
if (els.importManifestBtn) els.importManifestBtn.onclick = () => runAction(els.importManifestBtn, async () => {
  const res = await api('/api/agents/import-manifest', { method: 'POST', body: JSON.stringify({ manifest: JSON.parse(els.manifestJson?.value || '{}') }) });
  setDetail(res);
  flash(`Imported manifest for ${res.agent.name}.`, 'ok');
  await refresh();
});
if (els.importUrlBtn) els.importUrlBtn.onclick = () => runAction(els.importUrlBtn, async () => {
  const value = (els.manifestUrl?.value || '').trim();
  const res = await api('/api/agents/import-url', { method: 'POST', body: JSON.stringify({ manifest_url: value }) });
  setDetail({ input: value, response: res });
  flash(`Manifest URL imported for ${res.agent.name}. Verify before dispatch.`, 'ok');
  await refresh();
});
if (els.sampleResearchManifestBtn) els.sampleResearchManifestBtn.onclick = () => runAction(els.sampleResearchManifestBtn, async () => { await loadBundledManifest('/sample-agent-research.json'); flash('Research sample manifest loaded into the editor.', 'ok'); });
if (els.sampleCodeManifestBtn) els.sampleCodeManifestBtn.onclick = () => runAction(els.sampleCodeManifestBtn, async () => { await loadBundledManifest('/sample-agent-code.json'); flash('Code sample manifest loaded into the editor.', 'ok'); });
if (els.sampleOpsManifestBtn) els.sampleOpsManifestBtn.onclick = () => runAction(els.sampleOpsManifestBtn, async () => { await loadBundledManifest('/sample-agent-ops.json'); flash('Ops sample manifest loaded into the editor.', 'ok'); });
if (els.createJobBtn) els.createJobBtn.onclick = () => runAction(els.createJobBtn, createAndOptionallyRunJob);
if (els.claimJobBtn) els.claimJobBtn.onclick = () => runAction(els.claimJobBtn, async () => {
  const id = els.claimJobId?.value || '';
  const res = await api(`/api/jobs/${id}/claim`, { method: 'POST', body: JSON.stringify({ agent_id: els.claimAgentId?.value }) });
  setDetail(res);
  flash(`Run ${id.slice(0, 8)} claimed.`, 'ok');
  await refresh();
});
if (els.submitResultBtn) els.submitResultBtn.onclick = () => runAction(els.submitResultBtn, async () => {
  const id = els.claimJobId?.value || '';
  const res = await api(`/api/jobs/${id}/result`, { method: 'POST', body: JSON.stringify({ agent_id: els.claimAgentId?.value, status: 'completed', output: { summary: els.submitOutput?.value || 'Connected aiagent result' }, usage: { api_cost: 90 } }) });
  setDetail(res.job || res);
  flash(`Run ${id.slice(0, 8)} submitted.`, 'ok');
  await refresh();
});
if (els.retryDispatchBtn) els.retryDispatchBtn.onclick = () => runAction(els.retryDispatchBtn, async () => {
  const job = selectedJob();
  if (!job) throw new Error('Select a run first.');
  const res = await api('/api/dev/dispatch-retry', { method: 'POST', body: JSON.stringify({ job_id: job.id }) });
  setDetail(res.job || res);
  flash(`Retry triggered for ${job.id.slice(0, 8)}.`, 'ok');
  await refresh();
});
if (els.jobResearchExampleBtn) els.jobResearchExampleBtn.onclick = () => loadJobExample('research');
if (els.jobCodeExampleBtn) els.jobCodeExampleBtn.onclick = () => loadJobExample('code');
if (els.jobFailExampleBtn) els.jobFailExampleBtn.onclick = () => loadJobExample('fail');
if (els.eventFilter) els.eventFilter.oninput = () => { state.eventFilter = els.eventFilter.value || ''; if (state.snapshot) renderStream(state.snapshot.events || []); };
if (els.runSearch) els.runSearch.oninput = () => { state.runSearch = els.runSearch.value || ''; if (state.snapshot) renderJobs(state.snapshot.jobs || []); };
if (els.runStatusFilter) els.runStatusFilter.onchange = () => { state.runStatusFilter = els.runStatusFilter.value || ''; if (state.snapshot) renderJobs(state.snapshot.jobs || []); };
if (els.runActionFilter) els.runActionFilter.onchange = () => { state.runActionFilter = els.runActionFilter.value || ''; if (state.snapshot) renderJobs(state.snapshot.jobs || []); };
if (els.agentSearch) els.agentSearch.oninput = () => { state.agentSearch = els.agentSearch.value || ''; if (state.snapshot) renderAgents(state.snapshot.agents || []); };
if (els.agentStatusFilter) els.agentStatusFilter.onchange = () => { state.agentStatusFilter = els.agentStatusFilter.value || ''; if (state.snapshot) renderAgents(state.snapshot.agents || []); };
if (els.agentAvailabilityFilter) els.agentAvailabilityFilter.onchange = () => { state.agentAvailabilityFilter = els.agentAvailabilityFilter.value || ''; if (state.snapshot) renderAgents(state.snapshot.agents || []); };
if (els.agentActionFilter) els.agentActionFilter.onchange = () => { state.agentActionFilter = els.agentActionFilter.value || ''; if (state.snapshot) renderAgents(state.snapshot.agents || []); };
if (els.agentTaskFilter) els.agentTaskFilter.onchange = () => { state.agentTaskFilter = els.agentTaskFilter.value || ''; if (state.snapshot) renderAgents(state.snapshot.agents || []); };
if (els.agentSort) els.agentSort.onchange = () => { state.agentSort = els.agentSort.value || 'readiness'; if (state.snapshot) renderAgents(state.snapshot.agents || []); };
if (els.showReadyAgentsBtn) els.showReadyAgentsBtn.onclick = () => applyAgentQuickFilter('ready');
if (els.showVerifyFailuresBtn) els.showVerifyFailuresBtn.onclick = () => applyAgentQuickFilter('verify-failures');
if (els.showMissingEndpointBtn) els.showMissingEndpointBtn.onclick = () => applyAgentQuickFilter('missing-endpoint');
if (els.showTaskMismatchBtn) els.showTaskMismatchBtn.onclick = () => applyAgentQuickFilter('task-mismatch');
if (els.useAgentForRunBtn) els.useAgentForRunBtn.onclick = () => {
  const agent = selectedAgent();
  if (!agent) return flash('Select an agent first.', 'error');
  applyAgentToRunForm(agent, { switchToRuns: true, announce: true, message: `Work form pinned to ${agent.name}. CREATE RUN will use agent_id=${agent.id}.` });
};
if (els.clearRunAgentBtn) els.clearRunAgentBtn.onclick = () => {
  if (els.jobAgentId) els.jobAgentId.value = '';
  renderRunAgentContext();
  renderRunEstimateCard();
  flash('Pinned agent cleared. Auto-routing restored.', 'ok');
};
if (els.jobAgentId) els.jobAgentId.oninput = () => { renderRunAgentContext(); renderRunEstimateCard(); };
if (els.jobAgentId) els.jobAgentId.onchange = () => {
  const agent = currentRunTargetAgent();
  if (agent) {
    state.selectedAgentId = agent.id;
    setAgentDetail(agent);
  }
  renderRunAgentContext();
  renderRunEstimateCard();
};
if (els.copyAgentCurlBtn) els.copyAgentCurlBtn.onclick = () => {
  const agent = selectedAgent();
  if (!agent) return flash('Select an agent first.', 'error');
  switchTab('connect');
  updateCliPanels(state.snapshot);
  setDetail({ hint: 'CONNECT tab updated with agent_id example.', agent_id: agent.id, task_types: agent.taskTypes });
  flash(`CLI examples updated for ${agent.name}.`, 'ok');
};
if (els.jobType) {
  els.jobType.oninput = () => renderRunEstimateCard();
  els.jobType.onchange = () => renderRunEstimateCard();
}
if (els.jobPrompt) els.jobPrompt.oninput = () => renderRunEstimateCard();

document.querySelectorAll('.tab-btn').forEach((btn) => { btn.onclick = () => switchTab(btn.dataset.tab); });

if (window.EventSource) {
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
}

loadManifestExample();
loadJobExample('research');
switchTab('start');
await refresh();
