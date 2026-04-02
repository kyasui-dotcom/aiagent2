const stream = document.getElementById('stream');
const activeJobsEl = document.getElementById('activeJobs');
const onlineAgentsEl = document.getElementById('onlineAgents');
const todayCostEl = document.getElementById('todayCost');
const platformRevenueEl = document.getElementById('platformRevenue');
const agentsTable = document.getElementById('agentsTable');
const jobsTable = document.getElementById('jobsTable');

document.getElementById('seedBtn').onclick = async () => { await fetch('/api/seed', { method: 'POST' }); await refresh(); };
document.getElementById('runBtn').onclick = async () => {
  const taskTypes = ['research', 'writing', 'code', 'summary'];
  const payload = { parent_agent_id: 'cloudcode-main', task_type: taskTypes[Math.floor(Math.random() * taskTypes.length)], prompt: 'auto demo task', input: {}, budget_cap: 300, deadline_sec: 120 };
  const created = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json());
  if (!created.job_id) return refresh();
  const tokenMap = {
    agent_research_01: ['secret_research_01', 92],
    agent_writer_01: ['secret_writer_01', 88],
    agent_code_01: ['secret_code_01', 130]
  };
  const [token, cost] = tokenMap[created.matched_agent_id];
  await fetch('/api/agents/poll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent_id: created.matched_agent_id, agent_token: token }) });
  await fetch(`/api/jobs/${created.job_id}/result`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent_id: created.matched_agent_id, agent_token: token, status: 'completed', output: { summary: 'demo output' }, usage: { api_cost: cost } }) });
  await refresh();
};

function renderLog(event) {
  const div = document.createElement('div');
  div.className = 'log-line';
  div.innerHTML = `<span class="ts">${new Date(event.ts).toLocaleTimeString('ja-JP')}</span><span class="type-${event.type}">[${event.type}]</span> ${event.message}`;
  stream.prepend(div);
  while (stream.children.length > 50) stream.removeChild(stream.lastChild);
}

async function refresh() {
  const [stats, agentsRes, jobsRes] = await Promise.all([
    fetch('/api/stats').then(r => r.json()),
    fetch('/api/agents').then(r => r.json()),
    fetch('/api/jobs').then(r => r.json())
  ]);
  activeJobsEl.textContent = stats.activeJobs;
  onlineAgentsEl.textContent = stats.onlineAgents;
  todayCostEl.textContent = `¥${stats.todayCost}`;
  platformRevenueEl.textContent = `¥${stats.platformRevenue}`;

  agentsTable.innerHTML = `
    <div class="table-header agents-grid"><div>NAME</div><div>TASK TYPES</div><div>PREMIUM</div><div>SUCCESS</div><div>STATUS</div></div>
    ${agentsRes.agents.map(a => `
      <div class="table-row agents-grid">
        <div>${a.name}</div>
        <div>${a.taskTypes.join(', ')}</div>
        <div>${Math.round(a.premiumRate * 100)}%</div>
        <div>${Math.round(a.successRate * 100)}%</div>
        <div class="status-${a.online ? 'online' : 'offline'}">${a.online ? 'ONLINE' : 'OFFLINE'}</div>
      </div>`).join('')}`;

  jobsTable.innerHTML = `
    <div class="table-header jobs-grid"><div>JOB</div><div>TYPE</div><div>AGENT</div><div>STATUS</div><div>TOTAL</div><div>CREATED</div></div>
    ${jobsRes.jobs.slice(0, 10).map(j => `
      <div class="table-row jobs-grid">
        <div>${j.id.slice(0, 6)}</div>
        <div>${j.taskType}</div>
        <div>${j.assignedAgentId.replace('agent_', '').toUpperCase()}</div>
        <div class="status-${j.status}">${j.status.toUpperCase()}</div>
        <div>¥${j.actualBilling?.total ?? j.billingEstimate?.total ?? '-'}</div>
        <div>${new Date(j.createdAt).toLocaleTimeString('ja-JP')}</div>
      </div>`).join('')}`;
}

const es = new EventSource('/events');
es.onmessage = ev => renderLog(JSON.parse(ev.data));
refresh();
