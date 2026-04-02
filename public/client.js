const stream = document.getElementById('stream');
const activeJobsEl = document.getElementById('activeJobs');
const onlineAgentsEl = document.getElementById('onlineAgents');
const todayCostEl = document.getElementById('todayCost');
const platformRevenueEl = document.getElementById('platformRevenue');
const agentsTable = document.getElementById('agentsTable');
const jobsTable = document.getElementById('jobsTable');

const state = {
  agents: [
    { name: 'RESEARCH_01', taskTypes: ['research', 'summary'], premiumRate: 0.2, successRate: 0.94, online: true },
    { name: 'WRITER_01', taskTypes: ['writing', 'summary'], premiumRate: 0.1, successRate: 0.91, online: true },
    { name: 'CODE_01', taskTypes: ['code', 'debug'], premiumRate: 0.3, successRate: 0.89, online: true }
  ],
  jobs: [],
  revenue: 0,
  apiCost: 0
};

function addLog(type, message) {
  const div = document.createElement('div');
  div.className = 'log-line';
  div.innerHTML = `<span class="ts">${new Date().toLocaleTimeString('ja-JP')}</span><span class="type-${type}">[${type}]</span> ${message}`;
  stream.prepend(div);
  while (stream.children.length > 50) stream.removeChild(stream.lastChild);
}

function makeJob(taskType) {
  const id = Math.random().toString(16).slice(2, 8);
  const mapping = {
    research: { agent: 'RESEARCH_01', cost: 92, premium: .2 },
    writing: { agent: 'WRITER_01', cost: 88, premium: .1 },
    code: { agent: 'CODE_01', cost: 130, premium: .3 },
    summary: { agent: 'RESEARCH_01', cost: 84, premium: .2 }
  };
  const picked = mapping[taskType];
  addLog('JOB', `parent cloudcode-main requested ${taskType}`);
  addLog('MATCHED', `${taskType}/${id} -> ${picked.agent}`);
  addLog('RUNNING', `${picked.agent} started ${taskType}/${id}`);
  const baseFee = +(picked.cost * 0.1).toFixed(1);
  const platformFee = +(picked.cost * 0.1).toFixed(1);
  const premiumFee = +(picked.cost * picked.premium).toFixed(1);
  const total = +(picked.cost + baseFee + platformFee + premiumFee).toFixed(1);
  addLog('COMPLETED', `${taskType}/${id} completed`);
  addLog('BILLED', `api=${picked.cost} total=${total}`);
  state.jobs.unshift({ id, taskType, assignedAgent: picked.agent, status: 'completed', total, createdAt: new Date().toLocaleTimeString('ja-JP') });
  state.apiCost += picked.cost;
  state.revenue += platformFee;
  render();
}

function render() {
  activeJobsEl.textContent = 0;
  onlineAgentsEl.textContent = state.agents.filter(a => a.online).length;
  todayCostEl.textContent = `¥${state.apiCost.toFixed(1)}`;
  platformRevenueEl.textContent = `¥${state.revenue.toFixed(1)}`;
  agentsTable.innerHTML = `
    <div class="table-header agents-grid"><div>NAME</div><div>TASK TYPES</div><div>PREMIUM</div><div>SUCCESS</div><div>STATUS</div></div>
    ${state.agents.map(a => `<div class="table-row agents-grid"><div>${a.name}</div><div>${a.taskTypes.join(', ')}</div><div>${Math.round(a.premiumRate*100)}%</div><div>${Math.round(a.successRate*100)}%</div><div class="status-online">ONLINE</div></div>`).join('')}`;
  jobsTable.innerHTML = `
    <div class="table-header jobs-grid"><div>JOB</div><div>TYPE</div><div>AGENT</div><div>STATUS</div><div>TOTAL</div><div>CREATED</div></div>
    ${state.jobs.slice(0, 10).map(j => `<div class="table-row jobs-grid"><div>${j.id}</div><div>${j.taskType}</div><div>${j.assignedAgent}</div><div class="status-completed">COMPLETED</div><div>¥${j.total}</div><div>${j.createdAt}</div></div>`).join('')}`;
}

document.getElementById('seedBtn').onclick = () => ['research','writing','code','summary'].forEach(t => makeJob(t));
document.getElementById('runBtn').onclick = () => {
  const tasks = ['research','writing','code','summary'];
  makeJob(tasks[Math.floor(Math.random() * tasks.length)]);
};

addLog('LIVE', 'broker online');
render();
