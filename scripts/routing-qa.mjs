import assert from 'node:assert/strict';
import { DEFAULT_AGENT_SEEDS, agentTagsFromRecord, buildIntakeClarification, inferAgentTagsFromSignals, inferTaskSequence, inferTaskType, computeScore, isAgentTeamLaunchIntent, isBuiltInAgent, isCmoExternalExecutionIntent, isFreeWebGrowthIntent, isLargeAgentTeamIntent, optimizeOrderPromptForBroker } from '../lib/shared.js';

assert.equal(inferTaskType('', '料金計算ロジックのバグ修正'), 'code');
assert.equal(inferTaskType('', '中古iPhone 13の買取比較'), 'research');
assert.equal(inferTaskType('', 'LPコピーを書いて'), 'writing');
assert.equal(inferTaskType('', '検索流入を増やすSEO改善'), 'seo');
assert.equal(inferTaskType('', 'ヤフオク出品文を作る'), 'listing');
assert.equal(inferTaskType('', 'broker dispatch routing'), 'ops');
assert.equal(inferTaskType('summary', 'ignored'), 'summary');
assert.equal(inferTaskType('x_post', ''), 'x_post');
assert.equal(inferTaskType('twitter', ''), 'x_post');
assert.deepEqual(inferTaskSequence('seo', '検索流入を増やすSEO改善', { maxTasks: 3 }), ['seo', 'research', 'writing']);
assert.deepEqual(inferTaskSequence('code', '料金計算ロジックのバグ修正', { maxTasks: 2 }), ['code', 'debug']);
assert.deepEqual(inferTaskSequence('seo', '検索流入を増やすSEO改善', { maxTasks: 3, expand: false }), ['seo']);
assert.deepEqual(inferTaskSequence('seo', 'Create an SEO strategy and landing page copy', { maxTasks: 3, expand: false }), ['seo', 'writing']);
assert.ok(!inferTaskSequence('cmo_leader', 'Build an organic acquisition plan and inspect the funnel.', { maxTasks: 6 }).includes('code'));
assert.ok(!inferTaskSequence('cmo_leader', 'https://aiagent-marketplace.net の集客を広告費なしで増やしたい。媒体と投稿案が欲しい。', { maxTasks: 6 }).includes('code'));
const cmoFlow = inferTaskSequence('cmo_leader', 'https://aiagent-marketplace.net の集客を広告費なしで増やしたい。媒体と投稿案が欲しい。', { maxTasks: 11 });
assert.equal(cmoFlow[0], 'cmo_leader');
assert.ok(cmoFlow.includes('research'));
assert.ok(cmoFlow.includes('teardown'));
assert.ok(cmoFlow.includes('growth'));
assert.ok(cmoFlow.includes('summary'));
assert.ok(cmoFlow.indexOf('research') > cmoFlow.indexOf('cmo_leader'));
assert.equal(isAgentTeamLaunchIntent('', '1告知でX Reddit Indie Hackers Instagramまでまとめて作りたい'), true);
assert.equal(isFreeWebGrowthIntent('', '広告費なしでWeb周りの無料施策をやりたい'), true);
assert.equal(isLargeAgentTeamIntent('', '広告費なしでWeb周りの無料施策をやりたい'), true);
const freeFlow = inferTaskSequence('', '広告費なしでWeb周りの無料施策を全部やってほしい', { maxTasks: 11 });
assert.equal(freeFlow[0], 'cmo_leader');
assert.ok(freeFlow.includes('research'));
assert.ok(freeFlow.includes('seo_gap'));
assert.ok(freeFlow.includes('landing'));
assert.ok(freeFlow.includes('growth'));

const cmoActionFlow = inferTaskSequence('cmo_leader', 'CMOスタートで外部コネクターまで実行し、X投稿とディレクトリ掲載のアクションまで完走したい', { maxTasks: 14 });
assert.equal(isCmoExternalExecutionIntent('cmo_leader', '外部コネクターまで実行したい'), true);
assert.equal(cmoActionFlow[0], 'cmo_leader');
assert.ok(cmoActionFlow.includes('research'));
assert.ok(cmoActionFlow.includes('media_planner'));
assert.ok(cmoActionFlow.includes('seo_gap'));
assert.ok(cmoActionFlow.includes('landing'));
assert.ok(cmoActionFlow.includes('growth'));
assert.ok(cmoActionFlow.includes('directory_submission'));
assert.ok(cmoActionFlow.includes('acquisition_automation'));
assert.ok(cmoActionFlow.includes('x_post'));

const launchFlow = inferTaskSequence('', '1告知でサイト、競合分析、Instagram、X、Reddit、Indie Hackers、データ分析までAgent Teamでまとめて作る', { maxTasks: 11 });
assert.equal(launchFlow[0], 'cmo_leader');
assert.ok(launchFlow.includes('instagram'));
assert.ok(launchFlow.includes('reddit'));
assert.ok(launchFlow.includes('indie_hackers'));

const explicitLaunchFlow = inferTaskSequence('agent_team_launch', 'Launch CAIt across all channels', { maxTasks: 11, expand: false });
assert.equal(explicitLaunchFlow[0], 'cmo_leader');
assert.ok(explicitLaunchFlow.includes('research'));
assert.ok(explicitLaunchFlow.includes('growth'));

const ctoFlow = inferTaskSequence('cto_leader', 'Fix a GitHub repo bug and send a pull request', { maxTasks: 6 });
assert.equal(ctoFlow[0], 'cto_leader');
assert.ok(ctoFlow.includes('code'));
assert.ok(ctoFlow.includes('debug'));
assert.ok(ctoFlow.includes('automation'));
assert.deepEqual(inferTaskSequence('retry_timeout_qa', 'timeout test', { maxTasks: 3, expand: false }), ['retry_timeout_qa']);

const thinCmoIntake = buildIntakeClarification({
  task_type: 'cmo_leader',
  prompt: 'CMOとして見て'
}, { taskType: 'cmo_leader' });
assert.equal(thinCmoIntake.status, 'needs_input');
assert.equal(thinCmoIntake.reason, 'leader_context_required');
assert.ok(thinCmoIntake.missing_fields.includes('business_or_product'));
assert.ok(thinCmoIntake.questions.some((question) => question.includes('商材')));

const readyCmoIntake = buildIntakeClarification({
  task_type: 'cmo_leader',
  prompt: 'CMOとして、CAItというAI agent marketplaceのマーケ戦略を作って。対象はAIツールを使う開発者と小規模SaaS創業者。目標は30日でGitHubログインとエージェント登録を増やすこと。現状はProduct HuntとIndie Hackersから流入があり、広告費なしでX、Reddit、SEOを中心に進めたい。納品は7日施策、チャネル別投稿案、KPI表。'
}, { taskType: 'cmo_leader' });
assert.equal(readyCmoIntake, null);

const readyFreeGrowthIntake = buildIntakeClarification({
  task_type: 'cmo_leader',
  prompt: '広告費なしで、CAItというAI agent marketplaceの無料Web成長施策を作って。対象はAI agentを使いたい開発者と、agentを公開して稼ぎたい小規模SaaS創業者。目標は14日で登録とagent登録を増やすこと。現状はIndie Hackers流入があり、X、Reddit、SEO、ディレクトリを使える。納品は24時間施策、7日プラン、投稿文、KPI表。'
}, { taskType: 'cmo_leader' });
assert.equal(readyFreeGrowthIntake, null);

const skippedCmoIntake = buildIntakeClarification({
  task_type: 'cmo_leader',
  prompt: 'CMOとして見て',
  skip_intake: true
}, { taskType: 'cmo_leader' });
assert.equal(skippedCmoIntake, null);

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

const providerSeoAgent = {
  taskTypes: ['seo'],
  successRate: 0.9,
  avgLatencySec: 20,
  online: true,
  owner: 'provider'
};
const builtInSeoAgent = {
  ...providerSeoAgent,
  owner: 'aiagent2',
  manifestSource: 'built-in',
  metadata: { builtIn: true }
};
const broadSeoAgent = {
  ...providerSeoAgent,
  taskTypes: ['seo', 'research', 'writing', 'summary']
};
assert.equal(isBuiltInAgent(builtInSeoAgent), true);
assert.equal(isBuiltInAgent(providerSeoAgent), false);
assert.ok(computeScore(providerSeoAgent, 'seo', 300) > computeScore(builtInSeoAgent, 'seo', 300));
assert.ok(computeScore(providerSeoAgent, 'seo', 300) > computeScore(broadSeoAgent, 'seo', 300));
assert.ok(agentTagsFromRecord(DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_cmo_leader_01')).includes('marketing'));
assert.ok(agentTagsFromRecord(DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_cmo_leader_01')).includes('leader'));
assert.ok(agentTagsFromRecord(DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_seogap_01')).includes('seo'));
assert.ok(inferAgentTagsFromSignals({
  taskTypes: ['research'],
  name: 'Customer competitor watcher',
  description: 'Compare competitors and summarize market research.'
}).includes('competitor'));

const optimizedJapanese = optimizeOrderPromptForBroker({
  task_type: 'ops',
  prompt: '本番障害の原因調査と再発防止策をいい感じにまとめてください。',
  input: {
    urls: ['https://example.com/incidents/123'],
    files: [{ name: 'error-log.txt', content: 'stack trace' }]
  },
  skip_intake: true
});
assert.equal(optimizedJapanese.optimized, true);
assert.equal(optimizedJapanese.outputLanguageCode, 'ja');
assert.ok(optimizedJapanese.prompt.includes('Output language: Japanese'));
assert.ok(optimizedJapanese.prompt.includes('incident or bug investigation'));
assert.ok(optimizedJapanese.prompt.includes('URLs: https://example.com/incidents/123'));
assert.ok(optimizedJapanese.plannedTasks.includes('ops'));

const disabledOptimization = optimizeOrderPromptForBroker({
  task_type: 'research',
  prompt: 'ロレックスで一番高いモデルの値段はいくらですか？',
  prompt_optimization: false
});
assert.equal(disabledOptimization.optimized, false);
assert.equal(disabledOptimization.prompt, disabledOptimization.originalPrompt);

console.log('routing qa passed');
