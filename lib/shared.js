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
    manifestUrl: 'https://github.com/demo/research-agent',
    verificationStatus: 'legacy_unverified'
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
    manifestUrl: 'https://github.com/demo/writer-agent',
    verificationStatus: 'legacy_unverified'
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
    manifestUrl: 'https://github.com/demo/code-agent',
    verificationStatus: 'legacy_unverified'
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

function asCostNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseCostBasisObject(costBasisRaw) {
  if (!costBasisRaw || typeof costBasisRaw !== 'object') return null;
  const compute = asCostNumber(costBasisRaw.compute ?? costBasisRaw.compute_cost ?? costBasisRaw.computeCost) ?? 0;
  const tool = asCostNumber(costBasisRaw.tool ?? costBasisRaw.tool_cost ?? costBasisRaw.toolCost) ?? 0;
  const labor = asCostNumber(costBasisRaw.labor ?? costBasisRaw.labor_cost ?? costBasisRaw.laborCost) ?? 0;
  const api = asCostNumber(costBasisRaw.api ?? costBasisRaw.api_cost ?? costBasisRaw.apiCost) ?? 0;
  const total = asCostNumber(costBasisRaw.total ?? costBasisRaw.total_cost_basis ?? costBasisRaw.totalCostBasis);
  const rolledUp = +(compute + tool + labor + api).toFixed(1);
  const finalTotal = total == null ? rolledUp : total;
  return { total: +finalTotal.toFixed(1), compute: +compute.toFixed(1), tool: +tool.toFixed(1), labor: +labor.toFixed(1), api: +api.toFixed(1) };
}

export function deriveCostBasis(usageInput, fallbackApiCost = 100) {
  if (typeof usageInput === 'number') {
    const n = asCostNumber(usageInput) ?? 0;
    return { totalCostBasis: +n.toFixed(1), apiCost: +n.toFixed(1), costBasis: { api: +n.toFixed(1), compute: 0, tool: 0, labor: 0 } };
  }
  const usage = usageInput && typeof usageInput === 'object' ? usageInput : {};
  const topLevelApi = asCostNumber(usage.api_cost ?? usage.apiCost);
  const totalCostBasis = asCostNumber(usage.total_cost_basis ?? usage.totalCostBasis);
  const directCosts = parseCostBasisObject({
    api: usage.api_cost ?? usage.apiCost,
    compute: usage.compute_cost ?? usage.computeCost,
    tool: usage.tool_cost ?? usage.toolCost,
    labor: usage.labor_cost ?? usage.laborCost,
    total: usage.total_cost_basis ?? usage.totalCostBasis
  });
  const basisObject = parseCostBasisObject(usage.cost_basis ?? usage.costBasis);
  const merged = {
    api: topLevelApi ?? basisObject?.api ?? directCosts?.api ?? 0,
    compute: basisObject?.compute ?? directCosts?.compute ?? 0,
    tool: basisObject?.tool ?? directCosts?.tool ?? 0,
    labor: basisObject?.labor ?? directCosts?.labor ?? 0
  };
  const rolledUp = +(merged.api + merged.compute + merged.tool + merged.labor).toFixed(1);
  const finalTotal =
    totalCostBasis
    ?? basisObject?.total
    ?? directCosts?.total
    ?? (rolledUp > 0 ? rolledUp : asCostNumber(fallbackApiCost) ?? 100);
  return {
    totalCostBasis: +Number(finalTotal).toFixed(1),
    apiCost: +Number(merged.api).toFixed(1),
    costBasis: { api: +Number(merged.api).toFixed(1), compute: +Number(merged.compute).toFixed(1), tool: +Number(merged.tool).toFixed(1), labor: +Number(merged.labor).toFixed(1) }
  };
}

export function resolvePricingPolicy(agent, usageInput = 100) {
  const basis = deriveCostBasis(usageInput, 100);
  const billableBasis = basis.totalCostBasis;
  const baseRate = Number(agent.basicRate ?? 0.1);
  const premiumRate = Number(agent.premiumRate ?? 0);
  const platformRate = 0.1;
  return {
    policyVersion: 'billing-policy/v1',
    billableBasis,
    costBasis: basis.costBasis,
    apiCost: basis.apiCost,
    rates: {
      baseRate: +baseRate.toFixed(4),
      premiumRate: +premiumRate.toFixed(4),
      platformRate: +platformRate.toFixed(4)
    }
  };
}

export function estimateBilling(agent, usageInput = 100) {
  const policy = resolvePricingPolicy(agent, usageInput);
  const baseFee = +(policy.billableBasis * policy.rates.baseRate).toFixed(1);
  const platformFee = +(policy.billableBasis * policy.rates.platformRate).toFixed(1);
  const premiumFee = +(policy.billableBasis * policy.rates.premiumRate).toFixed(1);
  const agentPayout = +(baseFee + premiumFee).toFixed(1);
  const platformRevenue = platformFee;
  return {
    policyVersion: policy.policyVersion,
    apiCost: policy.apiCost,
    totalCostBasis: policy.billableBasis,
    costBasis: policy.costBasis,
    rates: policy.rates,
    baseFee,
    platformFee,
    premiumFee,
    agentPayout,
    platformRevenue,
    total: +(policy.billableBasis + baseFee + platformFee + premiumFee).toFixed(1)
  };
}

export function estimateRunWindow(agent, taskType = 'research') {
  const baseLatency = Math.max(15, Number(agent?.avgLatencySec || 30));
  const taskBuckets = {
    research: { minFactor: 1.4, maxFactor: 4.2, apiMin: 36, apiMax: 120 },
    summary: { minFactor: 0.9, maxFactor: 2.4, apiMin: 18, apiMax: 72 },
    writing: { minFactor: 1.2, maxFactor: 3.4, apiMin: 28, apiMax: 110 },
    seo: { minFactor: 1.1, maxFactor: 3.1, apiMin: 26, apiMax: 96 },
    code: { minFactor: 1.8, maxFactor: 6.2, apiMin: 72, apiMax: 240 },
    debug: { minFactor: 1.9, maxFactor: 5.8, apiMin: 68, apiMax: 220 },
    automation: { minFactor: 1.7, maxFactor: 5.4, apiMin: 64, apiMax: 210 },
    ops: { minFactor: 1.3, maxFactor: 3.8, apiMin: 44, apiMax: 150 },
    listing: { minFactor: 1.0, maxFactor: 2.8, apiMin: 22, apiMax: 84 }
  };
  const bucket = taskBuckets[String(taskType || '').toLowerCase()] || taskBuckets.research;
  const durationMinSec = Math.max(20, Math.round(baseLatency * bucket.minFactor));
  const durationMaxSec = Math.max(durationMinSec + 20, Math.round(baseLatency * bucket.maxFactor));
  const estimateMin = estimateBilling(agent, { api_cost: bucket.apiMin });
  const estimateMax = estimateBilling(agent, { api_cost: bucket.apiMax });
  const confidence = agent?.verificationStatus === 'verified' ? 'high' : 'medium';
  return {
    taskType: String(taskType || '').toLowerCase() || 'research',
    confidence,
    durationMinSec,
    durationMaxSec,
    estimateMin,
    estimateMax,
    typical: estimateBilling(agent, { api_cost: Math.round((bucket.apiMin + bucket.apiMax) / 2) })
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
