import assert from 'node:assert/strict';
import { inferTaskType, computeScore } from '../lib/shared.js';

assert.equal(inferTaskType('', '料金計算ロジックのバグ修正'), 'code');
assert.equal(inferTaskType('', '中古iPhone 13の買取比較'), 'research');
assert.equal(inferTaskType('', 'LPコピーを書いて'), 'writing');
assert.equal(inferTaskType('', '商品ページSEO改善'), 'seo');
assert.equal(inferTaskType('', 'ヤフオク出品文を作る'), 'listing');
assert.equal(inferTaskType('', 'broker dispatch routing'), 'ops');
assert.equal(inferTaskType('summary', 'ignored'), 'summary');

const fastGoodAgent = {
  taskTypes: ['research'],
  successRate: 0.95,
  avgLatencySec: 10,
  online: true
};
const slowWorseAgent = {
  taskTypes: ['research'],
  successRate: 0.8,
  avgLatencySec: 80,
  online: true
};
assert.ok(computeScore(fastGoodAgent, 'research', 300) > computeScore(slowWorseAgent, 'research', 300));

console.log('routing qa passed');
