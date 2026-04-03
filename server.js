import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createLocalStorage } from './lib/storage.js';
import { buildAgentId, estimateBilling, computeScore, inferTaskType, makeEvent, normalizeTaskTypes, nowIso } from './lib/shared.js';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const storagePath = process.env.BROKER_STATE_PATH || join(process.cwd(), '.data', 'broker-state.json');
const storage = createLocalStorage(storagePath);
const sseClients = new Set();

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function serveStatic(res, path) {
  const file = join(process.cwd(), 'public', path === '/' ? 'index.html' : path.slice(1));
  if (!existsSync(file)) return false;
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'text/plain; charset=utf-8' });
  res.end(readFileSync(file));
  return true;
}
function broadcast(event) {
  const packet = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) res.write(packet);
}
async function touchEvent(type, message, meta = {}) {
  const event = makeEvent(type, message, meta);
  await storage.mutate(async (state) => {
    state.events.push(event);
    if (state.events.length > 300) state.events = state.events.slice(-300);
  });
  broadcast(event);
  return event;
}
function pickAgent(agents, taskType, budgetCap) {
  return agents
    .filter(a => a.online && a.taskTypes.includes(taskType))
    .map(agent => ({ agent, score: computeScore(agent, taskType, budgetCap) }))
    .sort((a, b) => b.score - a.score)[0] || null;
}
function statsOf(state) {
  const completed = state.jobs.filter(j => j.actualBilling);
  const grossVolume = completed.reduce((n, j) => n + (j.actualBilling?.total || 0), 0);
  const api = completed.reduce((n, j) => n + (j.actualBilling?.apiCost || 0), 0);
  const rev = completed.reduce((n, j) => n + (j.actualBilling?.platformRevenue || 0), 0);
  return {
    activeJobs: state.jobs.filter(j => ['queued', 'running'].includes(j.status)).length,
    onlineAgents: state.agents.filter(a => a.online).length,
    grossVolume: +grossVolume.toFixed(1),
    todayCost: +api.toFixed(1),
    platformRevenue: +rev.toFixed(1),
    failedJobs: state.jobs.filter(j => j.status === 'failed').length,
    totalJobs: state.jobs.length
  };
}
function publicAgent(agent) {
  const { token, ...rest } = agent;
  return rest;
}
function createAgentFromInput(body = {}) {
  const taskTypes = normalizeTaskTypes(body.task_types || body.taskTypes || 'summary');
  return {
    id: buildAgentId(body.name || 'agent'),
    name: String(body.name || 'custom_agent').toUpperCase(),
    description: body.description || 'Custom registered agent.',
    taskTypes: taskTypes.length ? taskTypes : ['summary'],
    premiumRate: Number(body.premium_rate ?? body.premiumRate ?? 0.1),
    basicRate: Number(body.basic_rate ?? body.basicRate ?? 0.1),
    successRate: Number(body.success_rate ?? body.successRate ?? 0.9),
    avgLatencySec: Number(body.avg_latency_sec ?? body.avgLatencySec ?? 20),
    online: true,
    token: `secret_${randomUUID().slice(0, 8)}`,
    earnings: 0,
    owner: body.owner || 'samurai',
    manifestUrl: body.manifest_url || body.manifestUrl || null,
    manifestSource: body.manifest_source || body.manifestSource || null,
    metadata: body.metadata || {},
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}
function inferAgentFromUrl(manifestUrl, repoUrl) {
  const repo = String(repoUrl || manifestUrl || '').trim();
  const repoName = repo.split('/').filter(Boolean).slice(-1)[0] || 'github_agent';
  const inferredTasks = [];
  if (/(code|broker|worker|api|server)/i.test(repo)) inferredTasks.push('code');
  if (/(seo|content|writer|copy)/i.test(repo)) inferredTasks.push('writing');
  if (/(research|compare|market)/i.test(repo)) inferredTasks.push('research');
  if (!inferredTasks.length) inferredTasks.push('summary');
  return createAgentFromInput({
    name: repoName,
    description: `Imported from GitHub source ${repo}`,
    task_types: inferredTasks,
    premium_rate: inferredTasks.includes('code') ? 0.25 : 0.15,
    basic_rate: 0.1,
    owner: 'samurai',
    manifest_url: manifestUrl,
    manifest_source: repoUrl || manifestUrl,
    metadata: { importMode: 'url-inferred' }
  });
}
async function snapshot() {
  const state = await storage.getState();
  return {
    stats: statsOf(state),
    agents: state.agents.map(publicAgent),
    jobs: state.jobs,
    events: state.events,
    storage: { kind: storage.kind, supportsPersistence: storage.supportsPersistence, path: storagePath, note: storage.note || null }
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/app') || url.pathname === '/styles.css' || url.pathname === '/client.js')) {
    if (serveStatic(res, url.pathname === '/' ? '/index.html' : url.pathname)) return;
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    sseClients.add(res);
    const state = await storage.getState();
    for (const event of state.events.slice(-25)) res.write(`data: ${JSON.stringify(event)}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/snapshot') return json(res, 200, await snapshot());
  if (req.method === 'GET' && url.pathname === '/api/schema') return json(res, 200, { schema: storage.schemaSql });
  if (req.method === 'GET' && url.pathname === '/api/stats') return json(res, 200, (await snapshot()).stats);
  if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { agents: (await snapshot()).agents });
  if (req.method === 'GET' && url.pathname === '/api/jobs') return json(res, 200, { jobs: (await snapshot()).jobs });
  if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
    const id = url.pathname.split('/').pop();
    const state = await storage.getState();
    const job = state.jobs.find(j => j.id === id);
    return job ? json(res, 200, job) : json(res, 404, { error: 'Job not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.name) return json(res, 400, { error: 'name required' });
    const agent = createAgentFromInput(body);
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} registered with tasks ${agent.taskTypes.join(', ')}`);
    return json(res, 201, { ok: true, agent });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents/import-manifest') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.manifest?.name) return json(res, 400, { error: 'manifest.name required' });
    const agent = createAgentFromInput(body.manifest);
    agent.manifestSource = 'manifest-json';
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} imported from manifest JSON`);
    return json(res, 201, { ok: true, agent });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents/import-url') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.manifest_url) return json(res, 400, { error: 'manifest_url required' });
    const agent = inferAgentFromUrl(body.manifest_url, body.repo_url);
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} connected from GitHub URL`);
    return json(res, 201, { ok: true, agent, import_mode: 'url-inferred' });
  }
  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.parent_agent_id || !body.prompt) return json(res, 400, { error: 'parent_agent_id and prompt required' });
    const taskType = inferTaskType(body.task_type, body.prompt);
    const state = await storage.getState();
    await touchEvent('JOB', `parent ${body.parent_agent_id} requested ${taskType}`);
    const picked = pickAgent(state.agents, taskType, body.budget_cap || 0);
    if (!picked) {
      const failedJob = {
        id: randomUUID(),
        parentAgentId: body.parent_agent_id,
        taskType,
        prompt: body.prompt,
        input: body.input || {},
        budgetCap: body.budget_cap || null,
        deadlineSec: body.deadline_sec || null,
        priority: body.priority || 'normal',
        status: 'failed',
        assignedAgentId: null,
        score: null,
        createdAt: nowIso(),
        failedAt: nowIso(),
        failureReason: 'No agent available',
        logs: [`created by ${body.parent_agent_id}`, 'matching failed: no agent available']
      };
      await storage.mutate(async (draft) => { draft.jobs.unshift(failedJob); });
      await touchEvent('FAILED', `${taskType}/${failedJob.id.slice(0, 6)} no agent available`);
      return json(res, 201, { job_id: failedJob.id, status: 'failed', failure_reason: failedJob.failureReason, inferred_task_type: taskType });
    }
    const job = {
      id: randomUUID(),
      parentAgentId: body.parent_agent_id,
      taskType,
      prompt: body.prompt,
      input: body.input || {},
      budgetCap: body.budget_cap || null,
      deadlineSec: body.deadline_sec || null,
      priority: body.priority || 'normal',
      status: 'queued',
      assignedAgentId: picked.agent.id,
      score: picked.score,
      createdAt: nowIso(),
      billingEstimate: estimateBilling(picked.agent, Number(body.estimated_api_cost || 100)),
      logs: [`created by ${body.parent_agent_id}`, `matched to ${picked.agent.id} score=${picked.score}`, `inferred taskType=${taskType}`]
    };
    await storage.mutate(async (draft) => { draft.jobs.unshift(job); });
    await touchEvent('MATCHED', `${job.taskType}/${job.id.slice(0, 6)} -> ${picked.agent.name}`);
    return json(res, 201, { job_id: job.id, matched_agent_id: job.assignedAgentId, estimated_cost: job.billingEstimate, inferred_task_type: taskType });
  }
  const claimMatch = req.method === 'POST' && url.pathname.match(/^\/api\/jobs\/([^/]+)\/claim$/);
  if (claimMatch) {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const result = await storage.mutate(async (state) => {
      const job = state.jobs.find(j => j.id === claimMatch[1]);
      if (!job) return { error: 'Job not found', statusCode: 404 };
      const agent = state.agents.find(a => a.id === body.agent_id);
      if (!agent) return { error: 'Agent not found', statusCode: 404 };
      if (!agent.taskTypes.includes(job.taskType)) return { error: 'Agent cannot accept this job type', statusCode: 400 };
      job.assignedAgentId = agent.id;
      job.status = 'claimed';
      job.claimedAt = nowIso();
      job.logs.push(`claimed by ${agent.id}`);
      return { ok: true, job, agent };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    await touchEvent('RUNNING', `${result.agent.name} claimed ${result.job.taskType}/${result.job.id.slice(0, 6)}`);
    return json(res, 200, result);
  }

  const resultSubmitMatch = req.method === 'POST' && url.pathname.match(/^\/api\/jobs\/([^/]+)\/result$/);
  if (resultSubmitMatch) {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const result = await storage.mutate(async (state) => {
      const job = state.jobs.find(j => j.id === resultSubmitMatch[1]);
      if (!job) return { error: 'Job not found', statusCode: 404 };
      const agent = state.agents.find(a => a.id === body.agent_id);
      if (!agent) return { error: 'Agent not found', statusCode: 404 };
      if (job.assignedAgentId && job.assignedAgentId !== agent.id) return { error: 'Invalid assignment', statusCode: 401 };
      job.assignedAgentId = agent.id;
      job.startedAt = job.startedAt || nowIso();
      const billing = estimateBilling(agent, Number(body?.usage?.api_cost ?? 100));
      job.status = body.status || 'completed';
      job.output = body.output || {};
      job.completedAt = nowIso();
      job.usage = body.usage || null;
      job.actualBilling = billing;
      job.logs.push(`completed by ${agent.id}`, `billed total=${billing.total}`);
      agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
      return { ok: true, job, billing, agent };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    await touchEvent('COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed by connected agent`);
    await touchEvent('BILLED', `api=${result.billing.apiCost} total=${result.billing.total}`);
    return json(res, 200, result);
  }

  if (req.method === 'POST' && url.pathname === '/api/dev/resolve-job') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const mode = body.mode || 'complete';
    const result = await storage.mutate(async (state) => {
      const job = state.jobs.find(j => j.id === body.job_id);
      if (!job) return { error: 'Job not found', statusCode: 404 };
      if (!job.assignedAgentId) {
        job.status = 'failed';
        job.failedAt = nowIso();
        job.failureReason = job.failureReason || 'No assigned agent';
        return { status: 'failed', job };
      }
      const agent = state.agents.find(a => a.id === job.assignedAgentId);
      if (!agent) return { error: 'Assigned agent not found', statusCode: 404 };
      job.startedAt = nowIso();
      job.status = 'running';
      job.logs.push(`started by ${agent.id}`);
      if (mode === 'fail') {
        job.status = 'failed';
        job.failedAt = nowIso();
        job.failureReason = 'Simulated failure';
        job.logs.push('simulated failure');
        return { status: 'failed', job };
      }
      const apiCost = Number(body.api_cost || Math.max(60, Math.min(240, Math.round((job.budgetCap || 180) * 0.35))));
      const billing = estimateBilling(agent, apiCost);
      job.status = 'completed';
      job.completedAt = nowIso();
      job.usage = { api_cost: apiCost, simulated: true };
      job.output = { summary: `Simulated completion for ${job.taskType}`, naturalLanguageIntent: job.prompt };
      job.actualBilling = billing;
      job.logs.push(`completed by ${agent.id}`, `billed total=${billing.total}`);
      agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
      return { status: 'completed', job, billing };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    if (result.status === 'failed') {
      await touchEvent('FAILED', `${result.job.taskType}/${result.job.id.slice(0, 6)} failed`);
      return json(res, 200, { status: 'failed', failure_reason: result.job.failureReason, job: result.job });
    }
    await touchEvent('RUNNING', `${result.job.assignedAgentId} started ${result.job.taskType}/${result.job.id.slice(0, 6)}`);
    await touchEvent('COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed`);
    await touchEvent('BILLED', `api=${result.billing.apiCost} total=${result.billing.total}`);
    return json(res, 200, { status: 'completed', billing: result.billing, job: result.job });
  }
  if (req.method === 'POST' && url.pathname === '/api/seed') {
    const samples = [
      ['research', '中古iPhone 13の買取比較'],
      ['writing', '比較結果をLPコピーに変換'],
      ['code', '料金計算ロジックのバグ修正'],
      ['summary', '商流を短く整理']
    ];
    const seededIds = [];
    for (const [taskType, prompt] of samples) {
      const state = await storage.getState();
      const picked = pickAgent(state.agents, taskType, 300);
      if (!picked) continue;
      const apiCost = Math.floor(80 + Math.random() * 60);
      const billing = estimateBilling(picked.agent, apiCost);
      const job = {
        id: randomUUID(),
        parentAgentId: 'cloudcode-main',
        taskType,
        prompt,
        input: {},
        budgetCap: 300,
        deadlineSec: 120,
        priority: 'normal',
        status: 'completed',
        assignedAgentId: picked.agent.id,
        score: picked.score,
        createdAt: nowIso(),
        startedAt: nowIso(),
        completedAt: nowIso(),
        billingEstimate: estimateBilling(picked.agent, 100),
        actualBilling: billing,
        usage: { api_cost: apiCost, simulated: true },
        output: { summary: 'demo output' },
        logs: ['seeded demo job']
      };
      await storage.mutate(async (draft) => {
        draft.jobs.unshift(job);
        const agent = draft.agents.find(a => a.id === picked.agent.id);
        if (agent) agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
      });
      seededIds.push(job.id);
      await touchEvent('MATCHED', `${job.taskType}/${job.id.slice(0, 6)} -> ${picked.agent.name}`);
      await touchEvent('COMPLETED', `${job.taskType}/${job.id.slice(0, 6)} completed`);
      await touchEvent('BILLED', `api=${job.actualBilling.apiCost} total=${job.actualBilling.total}`);
    }
    return json(res, 200, { ok: true, job_ids: seededIds });
  }
  if (serveStatic(res, url.pathname)) return;
  return json(res, 404, { error: 'Not found' });
});

const port = process.env.PORT || 4323;
server.listen(port, async () => {
  await touchEvent('LIVE', 'broker online');
  console.log(`agent-market-app running at http://localhost:${port}`);
});
