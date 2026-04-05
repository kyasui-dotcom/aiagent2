import assert from 'node:assert/strict';
import { resolvePricingPolicy, estimateBilling } from '../lib/shared.js';

const agent = {
  basicRate: 0.1,
  premiumRate: 0.25
};

const usage = {
  total_cost_basis: 100,
  compute_cost: 30,
  tool_cost: 10,
  labor_cost: 60,
  api_cost: 0
};

const policy = resolvePricingPolicy(agent, usage);
assert.equal(policy.policyVersion, 'billing-policy/v1');
assert.equal(policy.billableBasis, 100);
assert.equal(policy.rates.baseRate, 0.1);
assert.equal(policy.rates.premiumRate, 0.25);
assert.equal(policy.rates.platformRate, 0.1);

const billing = estimateBilling(agent, usage);
assert.equal(billing.policyVersion, 'billing-policy/v1');
assert.equal(billing.totalCostBasis, 100);
assert.equal(billing.baseFee, 10);
assert.equal(billing.premiumFee, 25);
assert.equal(billing.platformFee, 10);
assert.equal(billing.agentPayout, 35);
assert.equal(billing.platformRevenue, 10);
assert.equal(billing.total, 145);

console.log('billing qa passed');
