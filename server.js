import http from 'node:http';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createLocalStorage } from './lib/storage.js';
import { buildAgentId, estimateBilling, computeScore, inferTaskType, makeEvent, normalizeTaskTypes, nowIso } from './lib/shared.js';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const storagePath = process.env.BROKER_STATE_PATH || join(process.cwd(), '.data', 'broker-state.json');
const storage = createLocalStorage(storagePath);
const sseClients = new Set();
const sessions = new Map();
const oauthStates = new Map();
const sessionSecret = process.env.SESSION_SECRET || 'dev-session-secret';
const githubClientId = process.env.GITHUB_CLIENT_ID || '';
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || '';

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
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
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i === -1 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}
function sign(value) {
  return createHmac('sha256', sessionSecret).update(value).digest('hex');
}
function makeSessionCookie(sessionId) {
  const payload = `${sessionId}.${sign(sessionId)}`;
  return `aiagent2_session=${encodeURIComponent(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}
function getSession(req) {
  const cookies = parseCookies(req);
  const raw = cookies.aiagent2_session;
  if (!raw) return null;
  const [id, signature] = String(raw).split('.');
  if (!id || !signature || sign(id) !== signature) return null;
  return sessions.get(id) || null;
}
function baseUrl(req) {
  const configured = (process.env.BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return `${(req.headers['x-forwarded-proto'] || 'http')}://${req.headers.host}`.replace(/\/$/, '');
}
function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, ...headers });
  res.end();
}
async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Request failed (${response.status})`);
  return data;
}
async function fetchAllGithubRepos(token) {
  const headers = { authorization: `Bearer ${token}`, 'user-agent': 'aiagent2' };
  const collected = [];
  for (let page = 1; page <= 5; page += 1) {
    const url = `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member`;
    const repos = await fetchJson(url, { headers });
    if (!Array.isArray(repos) || !repos.length) break;
    collected.push(...repos);
    if (repos.length < 100) break;
  }
  const seen = new Set();
  return collected.filter(repo => {
    if (!repo?.full_name || seen.has(repo.full_name)) return false;
    seen.add(repo.full_name);
    return true;
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
function inferAgentFromUrl(manifestUrl, repoUrl, ownerInfo = { owner: 'samurai', metadata: {} }) {
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
    owner: ownerInfo.owner,
    manifest_url: manifestUrl,
    manifest_source: repoUrl || manifestUrl,
    metadata: { importMode: 'url-inferred', ...ownerInfo.metadata }
  });
}
function authStatus(req) {
  const session = getSession(req);
  return {
    loggedIn: Boolean(session?.user),
    githubConfigured: Boolean(githubClientId && githubClientSecret),
    user: session?.user || null
  };
}
function ownerFromRequest(req) {
  const session = getSession(req);
  if (!session?.user) return { owner: 'samurai', metadata: {} };
  return {
    owner: session.user.login,
    metadata: {
      githubLogin: session.user.login,
      githubName: session.user.name,
      githubAvatarUrl: session.user.avatarUrl,
      githubProfileUrl: session.user.profileUrl
    }
  };
}

async function snapshot(req) {
  const state = await storage.getState();
  return {
    stats: statsOf(state),
    agents: state.agents.map(publicAgent),
    jobs: state.jobs,
    events: state.events,
    storage: { kind: storage.kind, supportsPersistence: storage.supportsPersistence, path: storagePath, note: storage.note || null },
    auth: authStatus(req)
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/app') || url.pathname === '/styles.css' || url.pathname === '/client.js')) {
    if (serveStatic(res, url.pathname === '/' ? '/index.html' : url.pathname)) return;
  }
  if (req.method === 'GET' && url.pathname === '/auth/status') return json(res, 200, authStatus(req));
  if (req.method === 'GET' && url.pathname === '/auth/debug') {
    const callback = `${baseUrl(req)}/auth/github/callback`;
    return json(res, 200, {
      baseUrl: baseUrl(req),
      callback,
      githubConfigured: Boolean(githubClientId && githubClientSecret),
      hasClientId: Boolean(githubClientId),
      hasClientSecret: Boolean(githubClientSecret),
      host: req.headers.host,
      forwardedProto: req.headers['x-forwarded-proto'] || null
    });
  }
  if (req.method === 'GET' && url.pathname === '/auth/github') {
    if (!(githubClientId && githubClientSecret)) return json(res, 503, { error: 'GitHub OAuth is not configured yet. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' });
    const state = randomBytes(16).toString('hex');
    oauthStates.set(state, { createdAt: Date.now() });
    const callback = `${baseUrl(req)}/auth/github/callback`;
    const githubUrl = new URL('https://github.com/login/oauth/authorize');
    githubUrl.searchParams.set('client_id', githubClientId);
    githubUrl.searchParams.set('redirect_uri', callback);
    githubUrl.searchParams.set('scope', 'read:user user:email repo');
    githubUrl.searchParams.set('state', state);
    return redirect(res, githubUrl.toString());
  }
  if (req.method === 'GET' && url.pathname === '/auth/github/callback') {
    if (!(githubClientId && githubClientSecret)) return redirect(res, '/?auth_error=github_not_configured');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state || !oauthStates.has(state)) return redirect(res, '/?auth_error=invalid_oauth_state');
    oauthStates.delete(state);
    try {
      const callback = `${baseUrl(req)}/auth/github/callback`;
      const token = await fetchJson('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ client_id: githubClientId, client_secret: githubClientSecret, code, redirect_uri: callback, state })
      });
      const user = await fetchJson('https://api.github.com/user', {
        headers: { authorization: `Bearer ${token.access_token}`, 'user-agent': 'aiagent2' }
      });
      const sessionId = randomBytes(24).toString('hex');
      sessions.set(sessionId, {
        user: {
          id: user.id,
          login: user.login,
          name: user.name,
          avatarUrl: user.avatar_url,
          profileUrl: user.html_url
        },
        githubAccessToken: token.access_token,
        createdAt: Date.now()
      });
      return redirect(res, '/', { 'Set-Cookie': makeSessionCookie(sessionId) });
    } catch (error) {
      return redirect(res, `/?auth_error=${encodeURIComponent(error.message)}`);
    }
  }
  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    const cookies = parseCookies(req);
    const raw = cookies.aiagent2_session;
    const [id] = String(raw || '').split('.');
    if (id) sessions.delete(id);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'aiagent2_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }
  if (req.method === 'GET' && url.pathname === '/api/github/repos') {
    const session = getSession(req);
    if (!session?.githubAccessToken) return json(res, 401, { error: 'Login required' });
    try {
      const repos = await fetchAllGithubRepos(session.githubAccessToken);
      return json(res, 200, {
        repos: repos.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          private: repo.private,
          defaultBranch: repo.default_branch,
          htmlUrl: repo.html_url,
          owner: repo.owner?.login
        }))
      });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/github/import-repo') {
    const session = getSession(req);
    if (!session?.githubAccessToken) return json(res, 401, { error: 'Login required' });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.owner || !body.repo) return json(res, 400, { error: 'owner and repo required' });
    try {
      const headers = { authorization: `Bearer ${session.githubAccessToken}`, 'user-agent': 'aiagent2' };
      const repoMeta = await fetchJson(`https://api.github.com/repos/${body.owner}/${body.repo}`, { headers });
      const contents = await fetchJson(`https://api.github.com/repos/${body.owner}/${body.repo}/contents`, { headers });
      const names = Array.isArray(contents) ? contents.map(item => item.name.toLowerCase()) : [];
      let readmeText = '';
      try {
        const readme = await fetch(`https://raw.githubusercontent.com/${body.owner}/${body.repo}/${repoMeta.default_branch}/README.md`, { headers: { 'user-agent': 'aiagent2', authorization: `Bearer ${session.githubAccessToken}` } });
        if (readme.ok) readmeText = await readme.text();
      } catch {}
      const combined = `${repoMeta.name}\n${repoMeta.description || ''}\n${names.join(' ')}\n${readmeText}`.toLowerCase();
      const taskTypes = [];
      if (/(research|compare|scrape|crawler|summary|analysis)/.test(combined)) taskTypes.push('research');
      if (/(seo|metadata|title|description)/.test(combined)) taskTypes.push('seo');
      if (/(write|writer|copy|blog|content)/.test(combined)) taskTypes.push('writing');
      if (/(code|api|worker|server|bug|debug|tool|automation)/.test(combined)) taskTypes.push('code');
      if (/(listing|catalog|rakuma|mercari|yahoo)/.test(combined)) taskTypes.push('listing');
      if (!taskTypes.length) taskTypes.push('summary');
      const ownerInfo = ownerFromRequest(req);
      const agent = createAgentFromInput({
        name: repoMeta.name,
        description: repoMeta.description || `Imported from ${repoMeta.full_name}`,
        task_types: [...new Set(taskTypes)],
        premium_rate: taskTypes.includes('code') ? 0.25 : 0.15,
        basic_rate: 0.1,
        success_rate: 0.9,
        avg_latency_sec: 20,
        owner: ownerInfo.owner,
        manifest_url: repoMeta.html_url,
        manifest_source: 'github-repo-import',
        metadata: {
          ...ownerInfo.metadata,
          githubRepo: repoMeta.full_name,
          githubRepoUrl: repoMeta.html_url,
          githubPrivate: repoMeta.private,
          importMode: 'repo-analysis',
          repoFiles: names.slice(0, 50)
        }
      });
      await storage.mutate(async (state) => { state.agents.unshift(agent); });
      await touchEvent('REGISTERED', `${agent.name} imported from GitHub repo ${repoMeta.full_name}`);
      return json(res, 201, { ok: true, agent, repo: { fullName: repoMeta.full_name, private: repoMeta.private } });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    sseClients.add(res);
    const state = await storage.getState();
    for (const event of state.events.slice(-25)) res.write(`data: ${JSON.stringify(event)}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'aiagent2', time: nowIso() });
  if (req.method === 'GET' && url.pathname === '/api/snapshot') return json(res, 200, await snapshot(req));
  if (req.method === 'GET' && url.pathname === '/api/schema') return json(res, 200, { schema: storage.schemaSql });
  if (req.method === 'GET' && url.pathname === '/api/stats') return json(res, 200, (await snapshot(req)).stats);
  if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { agents: (await snapshot(req)).agents });
  if (req.method === 'GET' && url.pathname === '/api/jobs') return json(res, 200, { jobs: (await snapshot(req)).jobs });
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
    const ownerInfo = ownerFromRequest(req);
    const agent = createAgentFromInput({ ...body, owner: body.owner || ownerInfo.owner, metadata: { ...(body.metadata || {}), ...ownerInfo.metadata } });
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} registered with tasks ${agent.taskTypes.join(', ')}`);
    return json(res, 201, { ok: true, agent });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents/import-manifest') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.manifest?.name) return json(res, 400, { error: 'manifest.name required' });
    const ownerInfo = ownerFromRequest(req);
    const agent = createAgentFromInput({ ...body.manifest, owner: body.manifest.owner || ownerInfo.owner, metadata: { ...(body.manifest.metadata || {}), ...ownerInfo.metadata } });
    agent.manifestSource = 'manifest-json';
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} imported from manifest JSON`);
    return json(res, 201, { ok: true, agent });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents/import-url') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.manifest_url) return json(res, 400, { error: 'manifest_url required' });
    const ownerInfo = ownerFromRequest(req);
    const agent = inferAgentFromUrl(body.manifest_url, body.repo_url, ownerInfo);
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} connected from GitHub URL`);
    return json(res, 201, { ok: true, agent, import_mode: 'url-inferred', owner: ownerInfo.owner });
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
