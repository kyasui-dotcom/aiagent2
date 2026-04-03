import { randomUUID } from 'node:crypto';

export function nowIso() {
  return new Date().toISOString();
}

export function makeEvent(type, message, meta = {}) {
  return { id: randomUUID(), ts: nowIso(), type, message, meta };
}

export const DEFAULT_AGENT_SEEDS = [
  {
    id: 'agent_research_01',
    name: 'RESEARCH_01',
    description: 'Market research and comparison.',
    taskTypes: ['research', 'summary'],
    premiumRate: 0.2,
    basicRate: 0.1,
    successRate: 0.94,
    avgLatencySec: 18,
    online: true,
    token: 'secret_research_01',
    earnings: 0,
    owner: 'samurai',
    manifestUrl: 'https://github.com/demo/research-agent'
  },
  {
    id: 'agent_writer_01',
    name: 'WRITER_01',
    description: 'LP and copy drafts.',
    taskTypes: ['writing', 'summary', 'seo'],
    premiumRate: 0.1,
    basicRate: 0.1,
    successRate: 0.91,
    avgLatencySec: 25,
    online: true,
    token: 'secret_writer_01',
    earnings: 0,
    owner: 'samurai',
    manifestUrl: 'https://github.com/demo/writer-agent'
  },
  {
    id: 'agent_code_01',
    name: 'CODE_01',
    description: 'Bugfix and implementation tasks.',
    taskTypes: ['code', 'debug', 'automation'],
    premiumRate: 0.3,
    basicRate: 0.1,
    successRate: 0.89,
    avgLatencySec: 40,
    online: true,
    token: 'secret_code_01',
    earnings: 0,
    owner: 'samurai',
    manifestUrl: 'https://github.com/demo/code-agent'
  }
];

export function inferTaskType(taskType, prompt = '') {
  const explicit = String(taskType || '').trim().toLowerCase();
  if (explicit) return explicit;
  const text = String(prompt || '').toLowerCase();
  if (/(fix|bug|debug|実装|修正|コード|api|server|worker|deploy|billing|ui)/.test(text)) return 'code';
  if (/(seo|meta|description|title|検索|流入)/.test(text)) return 'seo';
  if (/(listing|出品|商品ページ|rakuma|yahoo|mercari)/.test(text)) return 'listing';
  if (/(write|copy|lp|記事|文章|ライティング)/.test(text)) return 'writing';
  if (/(ops|運用|ルーティング|dispatch|broker)/.test(text)) return 'ops';
  if (/(summary|要約|まとめ)/.test(text)) return 'summary';
  return 'research';
}

export function normalizeTaskTypes(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim().toLowerCase()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

export function estimateBilling(agent, apiCost = 100) {
  const baseFee = +(apiCost * Number(agent.basicRate ?? 0.1)).toFixed(1);
  const platformFee = +(apiCost * 0.1).toFixed(1);
  const premiumFee = +(apiCost * Number(agent.premiumRate ?? 0)).toFixed(1);
  const agentPayout = +(baseFee + premiumFee).toFixed(1);
  const platformRevenue = platformFee;
  return {
    apiCost: +Number(apiCost || 0).toFixed(1),
    baseFee,
    platformFee,
    premiumFee,
    agentPayout,
    platformRevenue,
    total: +(Number(apiCost || 0) + baseFee + platformFee + premiumFee).toFixed(1)
  };
}

export function computeScore(agent, taskType, budgetCap = 0) {
  const skillMatch = agent.taskTypes.includes(taskType) ? 1 : 0;
  const priceFit = Number(budgetCap || 0) >= 100 ? 1 : 0.7;
  const quality = Number(agent.successRate || 0);
  const speed = Math.max(0, 1 - Number(agent.avgLatencySec || 20) / 120);
  const reliability = agent.online ? 1 : 0;
  return +(skillMatch * 0.4 + priceFit * 0.2 + quality * 0.2 + speed * 0.1 + reliability * 0.1).toFixed(3);
}

export function buildAgentId(name = 'agent') {
  return `agent_${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Math.random().toString(16).slice(2, 6)}`;
}
