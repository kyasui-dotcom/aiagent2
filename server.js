import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const db = {
  agents: [
    { id: 'agent_research_01', name: 'RESEARCH_01', description: 'Market research and comparison.', taskTypes: ['research', 'summary'], premiumRate: 0.2, basicRate: 0.1, successRate: 0.94, avgLatencySec: 18, online: true, token: 'secret_research_01', earnings: 0, owner: 'samurai', manifestUrl: 'https://github.com/demo/research-agent' },
    { id: 'agent_writer_01', name: 'WRITER_01', description: 'LP and copy drafts.', taskTypes: ['writing', 'summary'], premiumRate: 0.1, basicRate: 0.1, successRate: 0.91, avgLatencySec: 25, online: true, token: 'secret_writer_01', earnings: 0, owner: 'samurai', manifestUrl: 'https://github.com/demo/writer-agent' },
    { id: 'agent_code_01', name: 'CODE_01', description: 'Bugfix and implementation tasks.', taskTypes: ['code', 'debug'], premiumRate: 0.3, basicRate: 0.1, successRate: 0.89, avgLatencySec: 40, online: true, token: 'secret_code_01', earnings: 0, owner: 'samurai', manifestUrl: 'https://github.com/demo/code-agent' }
  ],
  jobs: [],
  events: []
};
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
function pushEvent(type, message, meta = {}) {
  const event = { id: randomUUID(), ts: new Date().toISOString(), type, message, meta };
  db.events.unshift(event);
  if (db.events.length > 300) db.events.pop();
  const packet = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) res.write(packet);
}
function estimateBilling(agent, apiCost = 100) {
  const baseFee = +(apiCost * agent.basicRate).toFixed(1);
  const platformFee = +(apiCost * 0.1).toFixed(1);
  const premiumFee = +(apiCost * agent.premiumRate).toFixed(1);
  return { apiCost, baseFee, platformFee, premiumFee, total: +(apiCost + baseFee + platformFee + premiumFee).toFixed(1) };
}
function computeScore(agent, taskType, budgetCap = 0) {
  const skillMatch = agent.taskTypes.includes(taskType) ? 1 : 0;
  const priceFit = budgetCap >= 100 ? 1 : 0.7;
  const quality = agent.successRate;
  const speed = Math.max(0, 1 - agent.avgLatencySec / 120);
  const reliability = agent.online ? 1 : 0;
  return +(skillMatch * 0.4 + priceFit * 0.2 + quality * 0.2 + speed * 0.1 + reliability * 0.1).toFixed(3);
}
function pickAgent(taskType, budgetCap) {
  return db.agents.filter(a => a.online && a.taskTypes.includes(taskType)).map(agent => ({ agent, score: computeScore(agent, taskType, budgetCap) })).sort((a,b)=>b.score-a.score)[0] || null;
}
function stats() {
  const completed = db.jobs.filter(j => j.status === 'completed');
  const api = completed.reduce((n, j) => n + (j.actualBilling?.apiCost || 0), 0);
  const rev = completed.reduce((n, j) => n + (j.actualBilling?.platformFee || 0), 0);
  return {
    activeJobs: db.jobs.filter(j => ['queued','running'].includes(j.status)).length,
    onlineAgents: db.agents.filter(a => a.online).length,
    todayCost: +api.toFixed(1),
    platformRevenue: +rev.toFixed(1),
    totalJobs: db.jobs.length
  };
}
function serveStatic(res, path) {
  const file = join(process.cwd(), 'public', path === '/' ? 'index.html' : path.slice(1));
  if (!existsSync(file)) return false;
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'text/plain; charset=utf-8' });
  res.end(readFileSync(file));
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/app') || url.pathname === '/styles.css' || url.pathname === '/client.js')) {
    if (serveStatic(res, url.pathname === '/' ? '/index.html' : url.pathname)) return;
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    sseClients.add(res);
    for (const event of db.events.slice(0, 25).reverse()) res.write(`data: ${JSON.stringify(event)}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/stats') return json(res, 200, stats());
  if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { agents: db.agents.map(({ token, ...rest }) => rest) });
  if (req.method === 'GET' && url.pathname === '/api/jobs') return json(res, 200, { jobs: db.jobs });
  if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
    const id = url.pathname.split('/').pop();
    const job = db.jobs.find(j => j.id === id);
    return job ? json(res, 200, job) : json(res, 404, { error: 'Job not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.parent_agent_id || !body.task_type || !body.prompt) return json(res, 400, { error: 'parent_agent_id, task_type, prompt required' });
    pushEvent('JOB', `parent ${body.parent_agent_id} requested ${body.task_type}`);
    const picked = pickAgent(body.task_type, body.budget_cap || 0);
    if (!picked) return json(res, 404, { error: 'No agent available' });
    const job = {
      id: randomUUID(),
      parentAgentId: body.parent_agent_id,
      taskType: body.task_type,
      prompt: body.prompt,
      input: body.input || {},
      budgetCap: body.budget_cap || null,
      deadlineSec: body.deadline_sec || null,
      status: 'queued',
      assignedAgentId: picked.agent.id,
      score: picked.score,
      createdAt: new Date().toISOString(),
      billingEstimate: estimateBilling(picked.agent),
      logs: [`created by ${body.parent_agent_id}`, `matched to ${picked.agent.id} score=${picked.score}`]
    };
    db.jobs.unshift(job);
    pushEvent('MATCHED', `${job.taskType}/${job.id.slice(0,6)} -> ${picked.agent.name}`);
    return json(res, 201, { job_id: job.id, matched_agent_id: job.assignedAgentId, estimated_cost: job.billingEstimate });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents/poll') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const agent = db.agents.find(a => a.id === body.agent_id && a.token === body.agent_token);
    if (!agent) return json(res, 401, { error: 'Invalid agent credentials' });
    const job = db.jobs.find(j => j.assignedAgentId === agent.id && j.status === 'queued');
    if (!job) return json(res, 200, { job: null });
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.logs.push(`started by ${agent.id}`);
    pushEvent('RUNNING', `${agent.name} started ${job.taskType}/${job.id.slice(0,6)}`);
    return json(res, 200, { job });
  }
  const resultMatch = req.method === 'POST' && url.pathname.match(/^\/api\/jobs\/([^/]+)\/result$/);
  if (resultMatch) {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const id = resultMatch[1];
    const job = db.jobs.find(j => j.id === id);
    if (!job) return json(res, 404, { error: 'Job not found' });
    const agent = db.agents.find(a => a.id === body.agent_id && a.token === body.agent_token);
    if (!agent || job.assignedAgentId !== agent.id) return json(res, 401, { error: 'Invalid assignment' });
    const billing = estimateBilling(agent, body?.usage?.api_cost ?? 100);
    job.status = body.status || 'completed';
    job.output = body.output || {};
    job.completedAt = new Date().toISOString();
    job.actualBilling = billing;
    job.logs.push(`completed by ${agent.id}`, `billed total=${billing.total}`);
    agent.earnings = +(agent.earnings + billing.baseFee + billing.premiumFee).toFixed(1);
    pushEvent('COMPLETED', `${job.taskType}/${job.id.slice(0,6)} completed`);
    pushEvent('BILLED', `api=${billing.apiCost} total=${billing.total}`);
    return json(res, 200, { ok: true, billing });
  }
  if (req.method === 'POST' && url.pathname === '/api/seed') {
    const samples = [
      ['research', '中古iPhone 13の買取比較'],
      ['writing', '比較結果をLPコピーに変換'],
      ['code', '料金計算ロジックのバグ修正'],
      ['summary', '商流を短く整理']
    ];
    for (const [task, prompt] of samples) {
      const picked = pickAgent(task, 300);
      if (!picked) continue;
      const job = {
        id: randomUUID(), parentAgentId: 'cloudcode-main', taskType: task, prompt, input: {}, budgetCap: 300, deadlineSec: 120,
        status: 'completed', assignedAgentId: picked.agent.id, score: picked.score, createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
        billingEstimate: estimateBilling(picked.agent), actualBilling: estimateBilling(picked.agent, Math.floor(80 + Math.random() * 60)), output: { summary: 'demo output' }, logs: ['seeded demo job']
      };
      db.jobs.unshift(job);
      pushEvent('MATCHED', `${job.taskType}/${job.id.slice(0,6)} -> ${picked.agent.name}`);
      pushEvent('COMPLETED', `${job.taskType}/${job.id.slice(0,6)} completed`);
      pushEvent('BILLED', `api=${job.actualBilling.apiCost} total=${job.actualBilling.total}`);
    }
    return json(res, 200, { ok: true });
  }
  if (serveStatic(res, url.pathname)) return;
  return json(res, 404, { error: 'Not found' });
});

const port = process.env.PORT || 4323;
server.listen(port, () => {
  pushEvent('LIVE', 'broker online');
  console.log(`agent-market-app running at http://localhost:${port}`);
});
