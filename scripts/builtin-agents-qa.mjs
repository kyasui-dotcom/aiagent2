import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILT_IN_KINDS,
  builtInAgentHealthPayload,
  builtInCostControlPolicyForKind,
  builtInDeliveryLanguage,
  builtInExecutionPolicyForKind,
  builtInFreshnessPolicyForKind,
  builtInModelRoutingForKind,
  builtInModelTierForKind,
  builtInSensitiveDataPolicyForKind,
  builtInShouldUseWebSearchForKind,
  builtInScopeBoundariesForKind,
  builtInSpecialistMethodForKind,
  builtInToolStrategyForKind,
  sampleAgentPayload
} from '../lib/builtin-agents.js';
import { assessAgentRegistrationSafety, normalizeManifest } from '../lib/manifest.js';
import { inferTaskSequence, inferTaskType, DEFAULT_AGENT_SEEDS } from '../lib/shared.js';
import { isBuiltInSampleAgent, isBuiltInSampleHealthcheckUrl, isBuiltInSampleJobEndpoint, sampleKindFromAgent } from '../lib/verify.js';

const builtInAgentSource = readFileSync(new URL('../lib/builtin-agents.js', import.meta.url), 'utf8');
assert.ok(builtInAgentSource.includes("required: ['summary', 'report_summary', 'bullets', 'next_action', 'file_markdown', 'confidence', 'authority_request']"));
assert.ok(builtInAgentSource.includes("If no external authority or source selection is needed, set authority_request to null."));
assert.ok(builtInAgentSource.includes("tools: [{ type: 'web_search' }]"), 'OpenAI built-in web search should be enabled for source-sensitive work');
assert.ok(builtInAgentSource.includes('webSourcesOf(payload)'), 'OpenAI web search sources should be extracted from Responses payloads');
assert.ok(builtInAgentSource.includes('web_sources'), 'OpenAI web sources should be surfaced in report/runtime payloads');
assert.ok(builtInAgentSource.includes('Specialist evidence used'), 'Leader final deliveries should include specialist evidence tables');
assert.ok(builtInAgentSource.includes('target URL/path, H1 or title, section outline, CTA copy'), 'Growth operator output must include executable artifact packets');

function builtInSeedManifest(seed = {}) {
  const manifest = seed?.metadata?.manifest && typeof seed.metadata.manifest === 'object'
    ? seed.metadata.manifest
    : {};
  return normalizeManifest({
    schema_version: 'agent-manifest/v1',
    agent_role: seed?.metadata?.agentRole || manifest.agent_role || 'worker',
    name: seed.name,
    description: seed.description,
    task_types: seed.taskTypes,
    ...manifest,
    metadata: {
      ...(manifest.metadata && typeof manifest.metadata === 'object' ? manifest.metadata : {}),
      builtIn: true,
      seedId: seed.id,
      seedCategory: seed?.metadata?.category || ''
    }
  }, { allowLocalEndpoints: true });
}

for (const seed of DEFAULT_AGENT_SEEDS) {
  const safety = assessAgentRegistrationSafety(builtInSeedManifest(seed), { allowLocalEndpoints: true });
  assert.equal(safety.ok, true, `${seed.name} must pass built-in policy gate: ${safety.summary}`);
  const kind = seed.metadata?.category || seed.metadata?.manifest?.metadata?.category || '';
  assert.ok(BUILT_IN_KINDS.includes(kind), `${seed.name} must use a known built-in kind`);
  assert.equal(sampleKindFromAgent(seed), kind, `${seed.name} must be recognized as a built-in sample agent`);
  assert.equal(isBuiltInSampleAgent(seed), true, `${seed.name} must bypass external review routing as managed built-in`);
  assert.equal(isBuiltInSampleHealthcheckUrl(seed.metadata?.manifest?.healthcheck_url), true, `${seed.name} health endpoint must be recognized`);
  assert.equal(isBuiltInSampleJobEndpoint(seed.metadata?.manifest?.job_endpoint), true, `${seed.name} job endpoint must be recognized`);
  if (seed.id === 'agent_x_launch_01') {
    assert.ok((seed.metadata?.manifest?.required_connector_capabilities || []).includes('x.post'));
  }
}

const prohibitedBuiltInCanary = assessAgentRegistrationSafety(normalizeManifest({
  schema_version: 'agent-manifest/v1',
  name: 'PROHIBITED BUILT-IN CANARY',
  description: 'Creates betting tips, odds-making, staking plans, and wager recommendations.',
  task_types: ['research']
}));
assert.equal(prohibitedBuiltInCanary.ok, false);
assert.ok(prohibitedBuiltInCanary.blocked.some((finding) => finding.code === 'stripe_prohibited_gambling'));

assert.equal(builtInDeliveryLanguage({ prompt: 'Compare support options for used iPhone 13 repairs in Japan.' }), 'en');
assert.equal(builtInDeliveryLanguage({ prompt: '一番高いロレックスの値段が知りたい' }), 'ja');
assert.equal(builtInDeliveryLanguage({ prompt: '中古iPhoneの販路比較', output_language: 'English' }), 'en');
assert.equal(builtInDeliveryLanguage({ prompt: 'Compare pricing routes', input: { language: '日本語' } }), 'ja');

const englishResearch = sampleAgentPayload('research', {
  prompt: 'Compare support options for used iPhone 13 repairs in Japan.'
});
assert.match(englishResearch.summary, /^Research summary ready:/);
assert.equal(englishResearch.report.summary, 'Research delivery');
assert.ok(englishResearch.report.bullets.some((item) => item.includes('answered first')));
assert.ok(englishResearch.files[0].content.includes('## Answer first'));
assert.ok(englishResearch.files[0].content.includes('## Decision or question framing'));
assert.ok(englishResearch.files[0].content.includes('the one question this research must answer'));
assert.ok(englishResearch.files[0].content.includes('## Evidence and source status'));
assert.ok(englishResearch.files[0].content.includes('Current public sources'));
assert.ok(englishResearch.files[0].content.includes('## Comparison or options'));
assert.ok(englishResearch.files[0].content.includes('## Recommendation'));
assert.ok(englishResearch.files[0].content.includes('## Risks and unknowns'));
assert.ok(englishResearch.files[0].content.includes('## Next check'));
assert.ok(englishResearch.files[0].content.includes('## First move'));
assert.ok(englishResearch.files[0].content.includes('Identify the exact decision or question first'));
assert.ok(englishResearch.files[0].content.includes('## Output contract'));
assert.ok(englishResearch.files[0].content.includes('Answer first'));
assert.ok(englishResearch.files[0].content.includes('Evidence and source status'));
assert.ok(englishResearch.files[0].content.includes('## Evidence policy'));
assert.ok(englishResearch.files[0].content.includes('Use current, verifiable sources'));
assert.ok(englishResearch.files[0].content.includes('## Confidence rubric'));
assert.ok(englishResearch.files[0].content.includes('High when scope, date range'));
assert.ok(englishResearch.files[0].content.includes('## Prioritization rubric'));
assert.ok(englishResearch.files[0].content.includes('decision impact, evidence quality'));
assert.ok(englishResearch.files[0].content.includes('## Inputs to confirm'));
assert.ok(englishResearch.files[0].content.includes('Region, market, or time range'));
assert.ok(englishResearch.files[0].content.includes('## Assumption policy'));
assert.ok(englishResearch.files[0].content.includes('neutral research stance'));
assert.ok(englishResearch.files[0].content.includes('## Clarify or escalate when'));
assert.ok(englishResearch.files[0].content.includes('Current facts or prices are required'));
assert.ok(englishResearch.files[0].content.includes('## Minimum blocker questions'));
assert.ok(englishResearch.files[0].content.includes('What exact decision should the research answer?'));
assert.ok(englishResearch.files[0].content.includes('## Acceptance checks'));
assert.ok(englishResearch.files[0].content.includes('## Failure modes to avoid'));
assert.ok(englishResearch.files[0].content.includes('Do not bury the direct answer after background'));
assert.ok(englishResearch.files[0].content.includes('## Handoff artifacts'));
assert.ok(englishResearch.files[0].content.includes('Source/evidence map'));
assert.ok(englishResearch.files[0].content.includes('## Measurement signals'));
assert.ok(englishResearch.files[0].content.includes('Decision confidence'));
assert.ok(englishResearch.files[0].content.includes('## Next action pattern'));
assert.ok(englishResearch.files[0].content.includes('next source or check'));
assert.ok(englishResearch.files[0].content.includes('## Final review checks'));
assert.ok(englishResearch.files[0].content.includes('Evidence status is explicit'));
assert.ok(englishResearch.files[0].content.includes('## Quality checks'));
assert.ok(englishResearch.runtime.delivery_policy.depth_policy.includes('answer-first synthesis'));
assert.ok(englishResearch.runtime.delivery_policy.concision_rule.includes('Keep background short'));
assert.equal(englishResearch.runtime.tool_strategy.web_search, 'default');
assert.equal(englishResearch.runtime.tool_strategy.source_mode, 'current_web_or_user_sources');
assert.ok(englishResearch.runtime.delivery_policy.specialist_method.some((step) => step.includes('Answer first')));
assert.ok(englishResearch.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('stale or unsourced current facts')));
assert.ok(englishResearch.runtime.delivery_policy.freshness_policy.includes('observation date'));
assert.ok(englishResearch.runtime.delivery_policy.sensitive_data_policy.includes('private material'));
assert.ok(englishResearch.runtime.delivery_policy.cost_control_policy.includes('decision impact'));
assert.equal(builtInShouldUseWebSearchForKind('research', { prompt: 'What is the highest Rolex price today?' }), true);
assert.equal(builtInShouldUseWebSearchForKind('code', {
  prompt: 'Review the implementation plan.',
  input: { _broker: { workflow: { forceWebSearch: true, webSearchRequiredReason: 'leader_research_layer' } } }
}), true);
assert.ok(!englishResearch.files[0].content.includes('市場比較の要点を抽出'));
assert.ok(!englishResearch.files[0].content.includes('Extract the key comparison points'));

const promptBrushupPayload = sampleAgentPayload('prompt_brushup', {
  prompt: '市場調査をしてほしい。抜け漏れない発注文にして、足りない情報があれば質問して。'
});
assert.equal(promptBrushupPayload.report.summary, 'プロンプトブラッシュアップ結果');
assert.equal(promptBrushupPayload.report.clarifyingQuestions.length, 5);
assert.ok(promptBrushupPayload.files[0].name.includes('prompt-brief'));
assert.ok(promptBrushupPayload.files[0].content.includes('追加で聞きたいこと'));
assert.ok(promptBrushupPayload.files[0].content.includes('既知の事実'));
assert.ok(promptBrushupPayload.files[0].content.includes('仮定'));
assert.ok(promptBrushupPayload.files[0].content.includes('推奨ディスパッチ'));
assert.ok(promptBrushupPayload.files[0].content.includes('優先順'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 初動方針'));
assert.ok(promptBrushupPayload.files[0].content.includes('Restate the rough request as a dispatchable brief'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 出力契約'));
assert.ok(promptBrushupPayload.files[0].content.includes('Dispatch-ready brief'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 確認したい入力'));
assert.ok(promptBrushupPayload.files[0].content.includes('Target agent or work type'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 仮定ポリシー'));
assert.ok(promptBrushupPayload.files[0].content.includes('dispatchable work order'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 確認・エスカレーション条件'));
assert.ok(promptBrushupPayload.files[0].content.includes('change agent routing or cost'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 最小確認質問'));
assert.ok(promptBrushupPayload.files[0].content.includes('Which agent or work type should receive it?'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 受け入れチェック'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 避けるべき失敗'));
assert.ok(promptBrushupPayload.files[0].content.includes('Do not complete the underlying task'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 根拠ポリシー'));
assert.ok(promptBrushupPayload.files[0].content.includes('Treat the user prompt'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 信頼度ルーブリック'));
assert.ok(promptBrushupPayload.files[0].content.includes('High when task type'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 優先順位ルーブリック'));
assert.ok(promptBrushupPayload.files[0].content.includes('routing, cost, acceptance criteria'));
assert.ok(promptBrushupPayload.files[0].content.includes('## ハンドオフ成果物'));
assert.ok(promptBrushupPayload.files[0].content.includes('Refined order brief'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 測定指標'));
assert.ok(promptBrushupPayload.files[0].content.includes('Brief completeness'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 次アクションの型'));
assert.ok(promptBrushupPayload.files[0].content.includes('which agent or work type to dispatch next'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 最終レビュー観点'));
assert.ok(promptBrushupPayload.files[0].content.includes('Brief is dispatchable'));
assert.ok(promptBrushupPayload.files[0].content.includes('## 品質チェック'));
assert.ok(promptBrushupPayload.runtime.delivery_policy.depth_policy.includes('compact dispatch brief'));
assert.ok(promptBrushupPayload.runtime.delivery_policy.concision_rule.includes('brief, assumptions, blocker questions'));
assert.ok(promptBrushupPayload.files[0].content.includes('元の依頼を実行せず'));
assert.ok(promptBrushupPayload.report.bullets.some((item) => item.includes('作業種別')));
assert.ok(promptBrushupPayload.report.nextAction.includes('事実と仮定'));

const englishPromptBrushupPayload = sampleAgentPayload('prompt_brushup', {
  prompt: 'Improve this rough app idea request before I send it to a coding agent.'
});
assert.equal(englishPromptBrushupPayload.report.summary, 'Prompt brush-up delivery');
assert.equal(englishPromptBrushupPayload.report.clarifyingQuestions.length, 5);
assert.ok(englishPromptBrushupPayload.files[0].content.includes('Known facts'));
assert.ok(englishPromptBrushupPayload.files[0].content.includes('Assumptions'));
assert.ok(englishPromptBrushupPayload.files[0].content.includes('Suggested dispatch'));
assert.ok(englishPromptBrushupPayload.files[0].content.includes('Clarifying questions by impact'));
assert.ok(englishPromptBrushupPayload.files[0].content.includes('Do not execute the original task'));

const japaneseResearch = sampleAgentPayload('research', {
  prompt: '一番高いロレックスの値段が知りたい'
});
assert.match(japaneseResearch.summary, /^調査サマリーを用意しました:/);
assert.equal(japaneseResearch.report.summary, '調査結果');
assert.ok(japaneseResearch.report.bullets.some((item) => item.includes('答えを先に提示')));
assert.ok(japaneseResearch.files[0].content.includes('## 先に結論'));
assert.ok(japaneseResearch.files[0].content.includes('## Decision or question framing'));
assert.ok(japaneseResearch.files[0].content.includes('## Evidence and source status'));
assert.ok(japaneseResearch.files[0].content.includes('## Comparison or options'));
assert.ok(japaneseResearch.files[0].content.includes('## Recommendation'));
assert.ok(japaneseResearch.files[0].content.includes('## Risks and unknowns'));
assert.ok(japaneseResearch.files[0].content.includes('## Next check'));
assert.ok(japaneseResearch.files[0].content.includes('## 品質チェック'));
const researchSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_research_01');
assert.ok(researchSeed?.description.includes('answer-first'));
assert.ok(researchSeed?.metadata?.manifest?.capabilities?.includes('answer_first_research'));
assert.ok(researchSeed?.metadata?.manifest?.capabilities?.includes('source_status_note'));
assert.ok(researchSeed?.metadata?.manifest?.metadata?.connector_behavior.includes('verify current public facts'));

const explicitEnglishWriter = sampleAgentPayload('writer', {
  prompt: '新規SaaSの訴求を考えて。Answer in English.',
  output_language: 'en'
});
assert.equal(explicitEnglishWriter.report.summary, 'Writer delivery');
assert.ok(explicitEnglishWriter.report.bullets.some((item) => item.includes('message hierarchy')));
assert.ok(explicitEnglishWriter.files[0].content.includes('## Copy mode and objective'));
assert.ok(explicitEnglishWriter.files[0].content.includes('## Offer, proof, and objections'));
assert.ok(explicitEnglishWriter.files[0].content.includes('## Message hierarchy'));
assert.ok(explicitEnglishWriter.files[0].content.includes('## Copy options'));
assert.ok(explicitEnglishWriter.files[0].content.includes('Option A: outcome-first'));
assert.ok(explicitEnglishWriter.files[0].content.includes('Option B: pain-first'));
assert.ok(explicitEnglishWriter.files[0].content.includes('Option C: proof-first'));
assert.ok(explicitEnglishWriter.files[0].content.includes('## Recommended version'));
assert.ok(explicitEnglishWriter.files[0].content.includes('## CTA and placement notes'));
assert.ok(explicitEnglishWriter.files[0].content.includes('## Revision test'));
assert.ok(explicitEnglishWriter.files[0].content.includes('believable promise'));
assert.ok(explicitEnglishWriter.files[0].content.includes('label missing proof instead of inventing it'));
assert.equal(explicitEnglishWriter.runtime.tool_strategy.web_search, 'when_current');
assert.equal(explicitEnglishWriter.runtime.tool_strategy.source_mode, 'provided_copy_context_current_claims_and_comparable_channel_examples');
assert.ok(explicitEnglishWriter.runtime.delivery_policy.specialist_method.some((step) => step.includes('awareness stage')));
assert.ok(explicitEnglishWriter.runtime.delivery_policy.specialist_method.some((step) => step.includes('message hierarchy')));
assert.ok(explicitEnglishWriter.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('Do not fabricate proof')));
assert.ok(explicitEnglishWriter.runtime.delivery_policy.concision_rule.includes('deliver the actual copy'));
const writerSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_writer_01');
assert.ok(writerSeed?.description.includes('publishable copy packets'));
assert.ok(writerSeed?.taskTypes?.includes('copywriting'));
assert.ok(writerSeed?.metadata?.manifest?.capabilities?.includes('message_hierarchy'));
assert.ok(writerSeed?.metadata?.manifest?.capabilities?.includes('recommended_copy_packet'));
assert.ok(writerSeed?.metadata?.manifest?.metadata?.connector_behavior.includes('placeholders instead of inventing proof'));

const codePayload = sampleAgentPayload('code', {
  prompt: 'Review this order API handler and find billing validation risks.'
});
assert.equal(codePayload.report.summary, 'Code review delivery');
assert.ok(codePayload.report.bullets.some((item) => item.includes('severity') || item.includes('重大度')));
assert.ok(codePayload.files[0].content.includes('## Findings'));
assert.ok(codePayload.files[0].content.includes('## Task mode'));
assert.ok(codePayload.files[0].content.includes('Code review'));
assert.ok(codePayload.files[0].content.includes('## Current vs expected behavior'));
assert.ok(codePayload.files[0].content.includes('Billing is unchanged when validation fails.'));
assert.ok(codePayload.files[0].content.includes('PR handoff'));
assert.ok(codePayload.files[0].content.includes('Validation commands'));
assert.ok(codePayload.files[0].content.includes('Rollback and release notes'));
assert.ok(codePayload.files[0].content.includes('Start by identifying the task mode, repo access'));
assert.ok(codePayload.files[0].content.includes('Repository or file access'));
assert.ok(codePayload.files[0].content.includes('Assume review-only guidance'));
assert.ok(codePayload.files[0].content.includes('Repo access or file scope is missing'));
assert.ok(codePayload.files[0].content.includes('version-sensitive'));
assert.ok(codePayload.files[0].content.includes('official framework docs'));
assert.ok(codePayload.files[0].content.includes('Is this a review, bug fix, feature, refactor, or ops/debug task'));
assert.ok(codePayload.files[0].content.includes('Tests or validation command'));
assert.ok(codePayload.files[0].content.includes('PR-ready handoff'));
assert.ok(codePayload.files[0].content.includes('Task mode matches the user request'));
assert.ok(codePayload.files[0].content.includes('Do not recommend broad rewrites before a minimal fix'));
assert.ok(codePayload.files[0].content.includes('Use repository files, logs, stack traces'));
assert.ok(codePayload.files[0].content.includes('High when repo files'));
assert.ok(codePayload.files[0].content.includes('blast radius, reproducibility'));
assert.ok(codePayload.files[0].content.includes('Task mode and finding or fix summary'));
assert.ok(codePayload.files[0].content.includes('Test pass rate'));
assert.ok(codePayload.files[0].content.includes('exact repo/file access'));
assert.ok(codePayload.files[0].content.includes('Claims match actual execution'));
assert.ok(codePayload.files[0].content.includes('Do not claim code was executed'));
assert.ok(codePayload.runtime.delivery_policy.depth_policy.includes('reproduction'));
assert.ok(codePayload.runtime.delivery_policy.concision_rule.includes('finding, likely fix'));
assert.equal(codePayload.runtime.tool_strategy.web_search, 'when_current');
assert.equal(codePayload.runtime.tool_strategy.source_mode, 'repo_logs_tests_and_github_context');
assert.ok(codePayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('repo files')));
assert.ok(codePayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('claim code was changed')));
assert.ok(codePayload.runtime.delivery_policy.freshness_policy.includes('repo snapshot'));
assert.ok(codePayload.runtime.delivery_policy.sensitive_data_policy.includes('Never echo secrets'));
assert.ok(codePayload.runtime.delivery_policy.cost_control_policy.includes('small repo-grounded fix'));
assert.equal(builtInShouldUseWebSearchForKind('code', { prompt: 'Fix a bug in my GitHub repo and send a pull request' }), false);
assert.equal(builtInShouldUseWebSearchForKind('code', { prompt: 'Use the latest Next.js docs to fix this bug' }), true);
const codeSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_code_01');
assert.ok(codeSeed?.description.includes('rollback guidance'));
assert.ok(codeSeed?.metadata?.manifest?.capabilities?.includes('bugfix_plan'));
assert.ok(codeSeed?.metadata?.manifest?.capabilities?.includes('pr_handoff'));
assert.equal(DEFAULT_AGENT_SEEDS.some((agent) => agent.id === 'agent_team_leader_01'), false);
assert.equal(DEFAULT_AGENT_SEEDS.some((agent) => agent.id === 'agent_launch_team_leader_01'), false);
assert.equal(DEFAULT_AGENT_SEEDS.some((agent) => agent.id === 'agent_free_web_growth_leader_01'), false);
const cmoSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_cmo_leader_01');
assert.ok(cmoSeed?.taskTypes?.includes('agent_team_launch'));
assert.ok(cmoSeed?.taskTypes?.includes('free_web_growth_leader'));
assert.ok(cmoSeed?.metadata?.manifest?.capabilities?.includes('planned_action_queue'));
assert.ok(cmoSeed?.metadata?.manifest?.capabilities?.includes('dispatch_packet_contract'));
assert.equal(cmoSeed?.metadata?.manifest?.metadata?.planned_action_contract, 'lane_owner_artifact_connector_metric');
const landingSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_landing_01');
assert.ok(landingSeed?.description.includes('HTML/CSS'));
assert.ok(landingSeed?.metadata?.manifest?.capabilities?.includes('landing_html'));
assert.ok(landingSeed?.metadata?.manifest?.capabilities?.includes('deploy_handoff'));
const instagramSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_instagram_launch_01');
assert.ok(instagramSeed?.metadata?.manifest?.capabilities?.includes('instagram_api_handoff'));
assert.ok(instagramSeed?.metadata?.manifest?.capabilities?.includes('schedule_plan'));
const xSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_x_launch_01');
assert.ok(xSeed?.metadata?.manifest?.capabilities?.includes('exact_post_packet'));
assert.ok(xSeed?.metadata?.manifest?.capabilities?.includes('scheduled_post_packet'));
const emailOpsSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_email_ops_01');
assert.ok(emailOpsSeed?.metadata?.manifest?.capabilities?.includes('exact_send_packet'));
assert.ok(emailOpsSeed?.metadata?.manifest?.capabilities?.includes('scheduled_send_packet'));
const listCreatorSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_list_creator_01');
assert.ok(listCreatorSeed?.metadata?.manifest?.capabilities?.includes('reviewable_lead_rows'));
assert.ok(listCreatorSeed?.metadata?.manifest?.capabilities?.includes('import_ready_packet'));
assert.ok(listCreatorSeed?.metadata?.manifest?.capabilities?.includes('public_email_capture'));
assert.equal(listCreatorSeed?.metadata?.manifest?.metadata?.contact_capture_mode, 'public_contact_only');
const coldEmailSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_cold_email_01');
assert.ok(coldEmailSeed?.metadata?.manifest?.capabilities?.includes('exact_send_packet'));
assert.ok(coldEmailSeed?.metadata?.manifest?.capabilities?.includes('scheduled_send_packet'));

const pricingPayload = sampleAgentPayload('pricing', {
  prompt: 'Design pricing tiers for a B2B SaaS analytics product.'
});
assert.equal(pricingPayload.report.summary, 'Pricing strategy delivery');
assert.ok(pricingPayload.report.bullets.some((item) => item.includes('value metric')));
assert.ok(pricingPayload.files[0].name.includes('pricing-strategy'));
assert.ok(pricingPayload.files[0].content.includes('Buyer segment and buying moment'));
assert.ok(pricingPayload.files[0].content.includes('Pricing competitor research'));
assert.ok(pricingPayload.files[0].content.includes('Unit economics and margin floor'));
assert.ok(pricingPayload.files[0].content.includes('Package architecture'));
assert.ok(pricingPayload.files[0].content.includes('Migration guardrails'));
assert.ok(pricingPayload.files[0].content.includes('Direct competitor'));
assert.ok(pricingPayload.files[0].content.includes('Substitute workflow'));
assert.ok(pricingPayload.files[0].content.includes('Status quo'));
assert.ok(pricingPayload.files[0].content.includes('Evidence date'));
assert.ok(pricingPayload.files[0].content.includes('Do not average unrelated competitor prices'));
assert.ok(pricingPayload.files[0].content.includes('success metric, guardrail, and review timing'));
assert.ok(pricingPayload.files[0].content.includes('Gross margin floor'));
assert.ok(pricingPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('package boundary')));
assert.ok(pricingPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('direct competitors')));
assert.ok(pricingPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('overages')));
assert.ok(pricingPayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('migration')));
assert.ok(pricingPayload.runtime.delivery_policy.cost_control_policy.includes('reversible experiment'));
assert.equal(pricingPayload.runtime.tool_strategy.source_mode, 'pricing_competitor_research_direct_substitute_status_quo_unit_economics_and_migration_context');

const teardownPayload = sampleAgentPayload('teardown', {
  prompt: 'Compare our AI support copilot against Intercom, Zendesk AI, and manual support workflows.'
});
assert.equal(teardownPayload.report.summary, 'Competitor teardown delivery');
assert.ok(teardownPayload.report.bullets.some((item) => item.includes('adjacent substitutes')));
assert.ok(teardownPayload.files[0].name.includes('competitor-teardown'));
assert.ok(teardownPayload.files[0].content.includes('Decision framing'));
assert.ok(teardownPayload.files[0].content.includes('Competitive set and evidence'));
assert.ok(teardownPayload.files[0].content.includes('Direct competitor'));
assert.ok(teardownPayload.files[0].content.includes('Adjacent substitute'));
assert.ok(teardownPayload.files[0].content.includes('Status quo / manual workflow'));
assert.ok(teardownPayload.files[0].content.includes('Buyer switching map'));
assert.ok(teardownPayload.files[0].content.includes('Onboarding/switching friction'));
assert.ok(teardownPayload.files[0].content.includes('Differentiated wedge'));
assert.ok(teardownPayload.files[0].content.includes('Counter-positioning'));
assert.ok(teardownPayload.files[0].content.includes('First competitive test'));
assert.ok(teardownPayload.files[0].content.includes('Do not copy the incumbent roadmap'));
assert.ok(teardownPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('direct competitors')));
assert.ok(teardownPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('switching')));
assert.ok(teardownPayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('copying competitors')));
assert.ok(teardownPayload.runtime.delivery_policy.freshness_policy.includes('product pages'));
assert.ok(teardownPayload.runtime.delivery_policy.cost_control_policy.includes('few competitors'));
assert.equal(teardownPayload.runtime.tool_strategy.source_mode, 'live_product_competitor_and_positioning_scan');

const landingPayload = sampleAgentPayload('landing', {
  prompt: 'Review the CAIt landing page hero and CTA for an AI agent marketplace.'
});
assert.equal(landingPayload.report.summary, 'Landing page build delivery');
assert.ok(landingPayload.files[0].name.includes('landing-page-critique'));
assert.ok(landingPayload.report.bullets.some((item) => item.includes('conversion goal')));
assert.ok(landingPayload.files[0].content.includes('Visitor objection map'));
assert.ok(landingPayload.files[0].content.includes('Replacement copy'));
assert.ok(landingPayload.files[0].content.includes('Evidence and comparable pages'));
assert.ok(landingPayload.files[0].content.includes('Visitor objections'));
assert.ok(landingPayload.files[0].content.includes('CTA path and friction'));
assert.ok(landingPayload.files[0].content.includes('Proof assets and claims that are approved to use'));
assert.ok(landingPayload.files[0].content.includes('label every rewrite by the objection it answers'));
assert.ok(landingPayload.files[0].content.includes('map visitor objections to proof, copy, CTA, layout fixes'));
assert.ok(landingPayload.files[0].content.includes('Hero comprehension from first-click or user feedback'));
assert.ok(landingPayload.files[0].content.includes('Metric to move and measurement step are named'));
assert.ok(landingPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('visitor intent')));
assert.ok(landingPayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('measurement path')));
assert.ok(landingPayload.runtime.delivery_policy.cost_control_policy.includes('measurement'));
assert.equal(landingPayload.runtime.tool_strategy.source_mode, 'live_page_competitor_serp_analytics_and_conversion_examples');

const validationPayload = sampleAgentPayload('validation', {
  prompt: 'Validate an AI note-taking product idea for solo accountants.'
});
assert.equal(validationPayload.report.summary, 'Idea validation delivery');
assert.ok(validationPayload.report.bullets.some((item) => item.includes('willingness-to-pay')));
assert.ok(validationPayload.files[0].name.includes('app-idea-validation'));
assert.ok(validationPayload.files[0].content.includes('Decision framing'));
assert.ok(validationPayload.files[0].content.includes('Evidence status'));
assert.ok(validationPayload.files[0].content.includes('Risk stack'));
assert.ok(validationPayload.files[0].content.includes('Cheapest falsification test'));
assert.ok(validationPayload.files[0].content.includes('Test script or asset'));
assert.ok(validationPayload.files[0].content.includes('Success and kill criteria'));
assert.ok(validationPayload.files[0].content.includes('False positives to ignore'));
assert.ok(validationPayload.files[0].content.includes('Do not ask whether to build yet'));
assert.ok(validationPayload.files[0].content.includes('waitlist signups'));
assert.ok(validationPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('willingness-to-pay risk')));
assert.ok(validationPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('concierge offer')));
assert.ok(validationPayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('interest, compliments')));
assert.ok(validationPayload.runtime.delivery_policy.freshness_policy.includes('smoke-test behavior'));
assert.ok(validationPayload.runtime.delivery_policy.cost_control_policy.includes('landing smoke'));
assert.equal(validationPayload.runtime.tool_strategy.source_mode, 'current_alternatives_communities_smoke_tests_and_behavior_signals');
const validationSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_validation_01');
assert.ok(validationSeed?.description.includes('falsifiable'));
assert.ok(validationSeed?.metadata?.manifest?.metadata?.optional_connectors?.includes('google_search_console'));
assert.equal(validationSeed?.metadata?.manifest?.metadata?.validation_focus, 'problem_first_falsification');

const diligencePayload = sampleAgentPayload('diligence', {
  prompt: 'Review this AI vendor as a possible enterprise partner and return the blocker-first due diligence memo.'
});
assert.equal(diligencePayload.report.summary, 'Due diligence delivery');
assert.ok(diligencePayload.report.bullets.some((item) => item.includes('blockers') || item.includes('verification queue')));
assert.ok(diligencePayload.files[0].name.includes('due-diligence'));
assert.ok(diligencePayload.files[0].content.includes('## Decision framing'));
assert.ok(diligencePayload.files[0].content.includes('## Answer first'));
assert.ok(diligencePayload.files[0].content.includes('conditional hold'));
assert.ok(diligencePayload.files[0].content.includes('## Thesis and downside'));
assert.ok(diligencePayload.files[0].content.includes('## Red flag matrix'));
assert.ok(diligencePayload.files[0].content.includes('severity | area | finding'));
assert.ok(diligencePayload.files[0].content.includes('## Evidence quality map'));
assert.ok(diligencePayload.files[0].content.includes('## Unknowns and stale evidence'));
assert.ok(diligencePayload.files[0].content.includes('## Verification queue'));
assert.ok(diligencePayload.files[0].content.includes('## Conditional recommendation'));
assert.ok(diligencePayload.files[0].content.includes('management statements'));
assert.ok(diligencePayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('approval bar') || step.includes('evidence room')));
assert.ok(diligencePayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('unknowns') || step.includes('management-claim-only')));
assert.ok(diligencePayload.runtime.delivery_policy.freshness_policy.includes('regulatory/policy status'));
assert.ok(diligencePayload.runtime.delivery_policy.cost_control_policy.includes('verification queue'));
assert.equal(diligencePayload.runtime.tool_strategy.source_mode, 'current_company_market_reputation_evidence_room_and_risk_scan');
const diligenceSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_diligence_01');
assert.ok(diligenceSeed?.description.includes('blocker-first'));
assert.ok(diligenceSeed?.metadata?.manifest?.capabilities?.includes('red_flag_matrix'));
assert.ok(diligenceSeed?.metadata?.manifest?.capabilities?.includes('verification_queue'));
assert.ok(diligenceSeed?.metadata?.manifest?.metadata?.connector_behavior.includes('blocker-first verification queue'));

const growthPayload = sampleAgentPayload('growth', {
  prompt: 'I want more users and more revenue for my AI agent marketplace.'
});
assert.equal(growthPayload.report.summary, 'Growth operator delivery');
assert.ok(growthPayload.files[0].name.includes('growth-operator'));
assert.ok(growthPayload.files[0].content.includes('7-day sprint'));
assert.ok(growthPayload.files[0].content.includes('Professional preflight'));
assert.ok(growthPayload.files[0].content.includes('scan competitors'));

const acquisitionAutomationPayload = sampleAgentPayload('acquisition_automation', {
  prompt: 'Create a safe acquisition automation flow for CAIt using owned channels and CRM follow-up.'
});
assert.equal(acquisitionAutomationPayload.report.summary, 'Acquisition automation delivery');
assert.ok(acquisitionAutomationPayload.files[0].name.includes('acquisition-automation'));
assert.ok(acquisitionAutomationPayload.files[0].content.includes('Policy guardrails'));
assert.ok(acquisitionAutomationPayload.files[0].content.includes('Automation map'));
assert.ok(acquisitionAutomationPayload.files[0].content.includes('Connector / leader packet'));
assert.ok(acquisitionAutomationPayload.files[0].content.includes('approved_for_followup'));
assert.ok(acquisitionAutomationPayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('spam')));

const mediaPlannerPayload = sampleAgentPayload('media_planner', {
  prompt: 'Analyze our homepage URL and business type, then recommend the best listing and distribution media before execution.'
});
assert.equal(mediaPlannerPayload.report.summary, 'Media planner delivery');
assert.ok(mediaPlannerPayload.files[0].content.includes('Business snapshot'));
assert.ok(mediaPlannerPayload.files[0].content.includes('Media-fit analysis'));
assert.ok(mediaPlannerPayload.files[0].content.includes('Execution handoff queue'));
assert.ok(mediaPlannerPayload.files[0].content.includes('citation_ops'));
assert.ok(mediaPlannerPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('homepage URL') || step.includes('business brief first')));

const directorySubmissionPayload = sampleAgentPayload('directory_submission', {
  prompt: 'List free launch directories and prepare submission copy for CAIt.'
});
assert.equal(directorySubmissionPayload.report.summary, 'Directory Submission delivery');
assert.ok(directorySubmissionPayload.files[0].name.includes('directory-submission'));
assert.ok(directorySubmissionPayload.files[0].content.includes('Priority queue'));
assert.ok(directorySubmissionPayload.files[0].content.includes('UTM'));
assert.ok(directorySubmissionPayload.files[0].content.includes('Do not fake reviews'));

const citationOpsPayload = sampleAgentPayload('citation_ops', {
  prompt: 'Prepare a GBP and citation cleanup plan for a local service business.'
});
assert.equal(citationOpsPayload.report.summary, 'Citation Ops delivery');
assert.ok(citationOpsPayload.files[0].content.includes('Canonical NAP and profile record'));
assert.ok(citationOpsPayload.files[0].content.includes('GBP field brief'));
assert.ok(citationOpsPayload.files[0].content.includes('Priority citation queue'));
assert.ok(citationOpsPayload.files[0].content.includes('Review-request flow'));
assert.ok(citationOpsPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('canonical business facts first')));

const researchLeaderPayload = sampleAgentPayload('research_team_leader', {
  prompt: 'Research competitors, risks, data, and summarize a decision memo.'
});
assert.equal(researchLeaderPayload.report.summary, 'Research Team Leader delivery');

const buildLeaderPayload = sampleAgentPayload('build_team_leader', {
  prompt: 'Coordinate coding, debugging, ops, and tests for a GitHub PR.'
});
assert.equal(buildLeaderPayload.report.summary, 'Build Team Leader delivery');

const cmoPayload = sampleAgentPayload('cmo_leader', {
  prompt: 'Act as CMO and plan acquisition channels for CAIt.'
});
assert.equal(cmoPayload.report.summary, 'CMO Team Leader delivery');
assert.ok(cmoPayload.report.bullets.some((item) => item.includes('research findings') || item.includes('Collect research findings first')));
assert.ok(cmoPayload.files[0].content.includes('Research first'));
assert.ok(cmoPayload.files[0].content.includes('Chosen media'));
assert.ok(cmoPayload.files[0].content.includes('Lane decision memo'));
assert.ok(cmoPayload.files[0].content.includes('Specialist dispatch packet'));
assert.ok(cmoPayload.files[0].content.includes('Leader approval queue'));
assert.ok(cmoPayload.files[0].content.includes('Planned action table'));
assert.ok(cmoPayload.files[0].content.includes('next-best lane'));

const ctoPayload = sampleAgentPayload('cto_leader', {
  prompt: 'Act as CTO and review architecture, security, and rollout.'
});
assert.equal(ctoPayload.report.summary, 'CTO Team Leader delivery');

const cpoPayload = sampleAgentPayload('cpo_leader', {
  prompt: 'Act as CPO and prioritize the roadmap.'
});
assert.equal(cpoPayload.report.summary, 'CPO Team Leader delivery');

const cfoPayload = sampleAgentPayload('cfo_leader', {
  prompt: 'Act as CFO and review unit economics.'
});
assert.equal(cfoPayload.report.summary, 'CFO Team Leader delivery');

const legalPayload = sampleAgentPayload('legal_leader', {
  prompt: 'Act as legal leader and review terms and privacy risks.'
});
assert.equal(legalPayload.report.summary, 'Legal Team Leader delivery');

const xPayload = sampleAgentPayload('x_post', {
  prompt: 'Create X posts for an AI agent marketplace launch.'
});
assert.equal(xPayload.report.summary, 'X Ops Connector delivery');
assert.ok(xPayload.files[0].content.includes('Short posts'));
assert.ok(xPayload.files[0].content.includes('Leader handoff packet'));
assert.ok(xPayload.files[0].content.includes('approval'));

assert.ok(acquisitionAutomationPayload.files[0].content.includes('connector packet'));

const emailOpsPayload = sampleAgentPayload('email_ops', {
  prompt: 'Create a lifecycle email sequence for newly registered engineers who have not published their profile yet.'
});
assert.equal(emailOpsPayload.report.summary, 'Email Ops Connector delivery');
assert.ok(emailOpsPayload.files[0].content.includes('Sequence map'));
assert.ok(emailOpsPayload.files[0].content.includes('Leader handoff packet'));
assert.ok(emailOpsPayload.files[0].content.includes('Send guardrail'));
assert.ok(emailOpsPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('leader handoff packet')));
assert.ok(emailOpsPayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('consent basis')));

const listCreatorPayload = sampleAgentPayload('list_creator', {
  prompt: 'Build a reviewable lead list for Japanese B2B SaaS teams that look under-instrumented and may need lifecycle automation help.'
});
assert.equal(listCreatorPayload.report.summary, 'List Creator Agent delivery');
assert.ok(listCreatorPayload.files[0].content.includes('Reviewable lead rows'));
assert.ok(listCreatorPayload.files[0].content.includes('Public contact capture rules'));
assert.ok(listCreatorPayload.files[0].content.includes('public_email_or_contact_path'));
assert.ok(listCreatorPayload.files[0].content.includes('contact_source_url'));
assert.ok(listCreatorPayload.files[0].content.includes('Import-ready field map'));
assert.ok(listCreatorPayload.files[0].content.includes('next_specialist: cold_email'));

const coldEmailPayload = sampleAgentPayload('cold_email', {
  prompt: 'Build a cold outbound email motion for B2B SaaS founders: define the list criteria, sender mailbox, drafts, and first send batch.'
});
assert.equal(coldEmailPayload.report.summary, 'Cold Email Agent delivery');
assert.ok(coldEmailPayload.files[0].content.includes('ICP and list criteria'));
assert.ok(coldEmailPayload.files[0].content.includes('Sender and mailbox setup'));
assert.ok(coldEmailPayload.files[0].content.includes('Prospect list spec'));
assert.ok(coldEmailPayload.files[0].content.includes('Conversion point'));
assert.ok(coldEmailPayload.files[0].content.includes('Leader handoff packet'));
assert.ok(coldEmailPayload.files[0].content.includes('Deliverability and compliance risk'));
assert.ok(coldEmailPayload.files[0].content.includes('import_list / send_email / schedule_email'));
assert.ok(coldEmailPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('reviewed lead queue') || step.includes('list rule')));
assert.ok(coldEmailPayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('purchased lists')));
assert.ok(coldEmailPayload.runtime.tool_strategy.source_mode.includes('public_company_sources'));

const redditPayload = sampleAgentPayload('reddit', {
  prompt: 'Create a Reddit-safe launch discussion post.'
});
assert.equal(redditPayload.report.summary, 'Reddit launch delivery');
assert.ok(redditPayload.files[0].content.includes('Recommended angle'));

const indiePayload = sampleAgentPayload('indie_hackers', {
  prompt: 'Create an Indie Hackers build-in-public launch post.'
});
assert.equal(indiePayload.report.summary, 'Indie Hackers launch delivery');

const instagramPayload = sampleAgentPayload('instagram', {
  prompt: 'Create Instagram launch assets.'
});
assert.equal(instagramPayload.report.summary, 'Instagram launch delivery');

const seoGapPayload = sampleAgentPayload('seo_gap', {
  prompt: 'Find SEO content gaps for AI agent marketplace keywords.'
});
assert.equal(seoGapPayload.report.summary, 'SEO content gap delivery');
assert.ok(seoGapPayload.report.bullets.some((item) => item.includes('one page that should win')));
assert.ok(seoGapPayload.files[0].content.includes('Mode and conversion goal'));
assert.ok(seoGapPayload.files[0].content.includes('targetUrl + keyword means rewrite'));
assert.ok(seoGapPayload.files[0].content.includes('siteUrl + targetKeywords'));
assert.ok(seoGapPayload.files[0].content.includes('Page map'));
assert.ok(seoGapPayload.files[0].content.includes('Current SERP top 3'));
assert.ok(seoGapPayload.files[0].content.includes('Approx length'));
assert.ok(seoGapPayload.files[0].content.includes('Landing / page rewrite requirements'));
assert.ok(seoGapPayload.files[0].content.includes('Proposal PR handoff'));
assert.ok(seoGapPayload.files[0].content.includes('What happens after signup'));
assert.ok(seoGapPayload.files[0].content.includes('Distribution templates'));
assert.ok(seoGapPayload.files[0].content.includes('Qiita / Zenn'));
assert.ok(builtInSpecialistMethodForKind('cmo_leader').some((step) => step.includes('leader approval queue')));
assert.ok(builtInSpecialistMethodForKind('cmo_leader').some((step) => step.includes('planned action table')));
assert.ok(builtInSpecialistMethodForKind('x_post').some((step) => step.includes('approval packet')));
assert.ok(builtInSpecialistMethodForKind('acquisition_automation').some((step) => step.includes('leader approval packet')));
assert.ok(builtInSpecialistMethodForKind('acquisition_automation').some((step) => step.includes('connector action packets')));
assert.ok(builtInSpecialistMethodForKind('email_ops').some((step) => step.includes('leader handoff packet')));
assert.ok(builtInScopeBoundariesForKind('cmo_leader').some((step) => step.includes('autonomous publishing')));
assert.ok(builtInScopeBoundariesForKind('x_post').some((step) => step.includes('posting authority')));
assert.ok(builtInScopeBoundariesForKind('email_ops').some((step) => step.includes('connector confirmation')));

const cmoLeaderSeed = DEFAULT_AGENT_SEEDS.find((seed) => seed.id === 'agent_cmo_leader_01');
assert.ok(cmoLeaderSeed);
assert.equal(cmoLeaderSeed.metadata.manifest.metadata.execution_mode, 'leader_mediated');
assert.ok(cmoLeaderSeed.metadata.manifest.capabilities.includes('approval_gate'));
assert.ok(cmoLeaderSeed.metadata.manifest.capabilities.includes('leader_approval_queue'));

const acquisitionSeed = DEFAULT_AGENT_SEEDS.find((seed) => seed.id === 'agent_acquisition_automation_01');
assert.ok(acquisitionSeed);
assert.equal(acquisitionSeed.metadata.manifest.metadata.execution_default, 'leader_mediated_flow_packet');
assert.ok(acquisitionSeed.metadata.manifest.capabilities.includes('leader_approval_packet'));
assert.ok(acquisitionSeed.metadata.manifest.capabilities.includes('connector_action_packet'));

const mediaPlannerSeed = DEFAULT_AGENT_SEEDS.find((seed) => seed.id === 'agent_media_planner_01');
assert.ok(mediaPlannerSeed);
assert.ok(mediaPlannerSeed.metadata.manifest.capabilities.includes('media_priority_queue'));
assert.equal(mediaPlannerSeed.metadata.manifest.metadata.planner_role, 'middle_agent');

const xLeaderSeed = DEFAULT_AGENT_SEEDS.find((seed) => seed.id === 'agent_x_launch_01');
assert.ok(xLeaderSeed);
assert.equal(xLeaderSeed.metadata.manifest.metadata.leader_handoff_mode, 'leader_mediated');

const emailSeed = DEFAULT_AGENT_SEEDS.find((seed) => seed.id === 'agent_email_ops_01');
assert.ok(emailSeed);
assert.equal(emailSeed.metadata.manifest.metadata.leader_handoff_mode, 'leader_mediated');
assert.ok(emailSeed.metadata.manifest.capabilities.includes('email_connector_handoff'));

const coldOutboundSeed = DEFAULT_AGENT_SEEDS.find((seed) => seed.id === 'agent_cold_email_01');
assert.ok(coldOutboundSeed);
assert.equal(coldOutboundSeed.metadata.manifest.metadata.leader_handoff_mode, 'leader_mediated');
assert.equal(coldOutboundSeed.metadata.manifest.metadata.outreach_mode, 'b2b_cold_outbound');
assert.equal(coldOutboundSeed.metadata.manifest.metadata.preferred_upstream_specialist, 'list_creator');
assert.ok(coldOutboundSeed.metadata.manifest.capabilities.includes('reviewed_lead_queue'));
assert.ok(coldOutboundSeed.metadata.manifest.capabilities.includes('conversion_tracking'));

assert.ok(seoGapPayload.files[0].content.includes('Community post'));
assert.ok(seoGapPayload.files[0].content.includes('Primary conversion goal'));
assert.ok(seoGapPayload.files[0].content.includes('E-E-A-T'));
assert.ok(seoGapPayload.files[0].content.includes('Meta description'));
assert.ok(seoGapPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('keyword cluster')));
assert.ok(seoGapPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('H1/H2/H3')));
assert.ok(seoGapPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('signup')));
assert.ok(seoGapPayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('generic SEO advice')));
assert.ok(seoGapPayload.runtime.delivery_policy.cost_control_policy.includes('one page/keyword target'));
assert.equal(seoGapPayload.runtime.tool_strategy.source_mode, 'current_serp_top_results_fetch_top_competitors_and_keyword_intent');
const seoGapSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_seogap_01');
assert.ok(seoGapSeed?.description.includes('PR-ready'));
assert.ok(seoGapSeed?.metadata?.manifest?.metadata?.optional_connectors?.includes('google_search_console'));
assert.ok(seoGapSeed?.metadata?.manifest?.capabilities?.includes('proposal_pr_handoff'));

const citationSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_citation_ops_01');
assert.equal(citationSeed?.name, 'MEO AGENT');
assert.ok(citationSeed?.description.includes('MEO'));
assert.ok(citationSeed?.metadata?.manifest?.capabilities?.includes('citation_queue'));

const dataAnalysisPayload = sampleAgentPayload('data_analysis', {
  prompt: 'Analyze launch traffic, chat starts, draft orders, and payments.'
});
assert.equal(dataAnalysisPayload.report.summary, 'Data analysis delivery');
assert.ok(dataAnalysisPayload.report.bullets.some((item) => item.includes('GA4')));
assert.ok(dataAnalysisPayload.files[0].content.includes('Connected data sources'));
assert.ok(dataAnalysisPayload.files[0].content.includes('Connector gaps'));
assert.ok(dataAnalysisPayload.files[0].content.includes('Event taxonomy'));
assert.ok(dataAnalysisPayload.files[0].content.includes('GA4 report spec'));
assert.ok(dataAnalysisPayload.files[0].content.includes('Search Console report spec'));
assert.ok(dataAnalysisPayload.files[0].content.includes('Internal and billing report spec'));
assert.ok(dataAnalysisPayload.files[0].content.includes('Segment and cohort readout'));
assert.ok(dataAnalysisPayload.files[0].content.includes('agent_registration_completed'));
assert.ok(dataAnalysisPayload.files[0].content.includes('Do not run a 3-channel x 3-message test until the above events are connected'));
assert.ok(dataAnalysisPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('GA4')));
assert.ok(dataAnalysisPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('denominators')));
assert.ok(dataAnalysisPayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('channel recommendations')));
assert.ok(dataAnalysisPayload.runtime.delivery_policy.cost_control_policy.includes('query/report spec'));
assert.equal(dataAnalysisPayload.runtime.tool_strategy.source_mode, 'connected_ga4_search_console_internal_events_billing_logs_and_uploaded_datasets');
const dataAnalysisSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_data_analysis_01');
assert.ok(dataAnalysisSeed?.description.includes('GA4'));
assert.ok(dataAnalysisSeed?.metadata?.manifest?.metadata?.analytics_sources?.includes('google_search_console'));

const hiringPayload = sampleAgentPayload('hiring', {
  prompt: '最初のプロダクトデザイナー採用JDを作りたい'
});
assert.equal(hiringPayload.report.summary, '採用JD結果');

assert.equal(inferTaskType('', 'Create a pricing strategy for a new AI SaaS product'), 'pricing');
assert.equal(inferTaskType('', 'I want more users and more revenue from Product Hunt and Indie Hackers'), 'growth');
assert.equal(inferTaskType('', '集客自動化の流れを作ってCRM連携まで設計して'), 'acquisition_automation');
assert.equal(inferTaskType('media_planner', ''), 'media_planner');
assert.equal(inferTaskType('', 'ホームページURLと業種を見て、どの掲載媒体が合うか決めて'), 'media_planner');
assert.equal(inferTaskType('meo', ''), 'citation_ops');
assert.equal(inferTaskType('', 'GBPとサイテーションの整備をやりたい'), 'citation_ops');
assert.equal(inferTaskType('', '公開情報ベースで営業先リストを作りたい'), 'list_creator');
assert.equal(inferTaskType('', 'コールドメールのリスト作成から送信まで設計したい'), 'cold_email');
assert.equal(inferTaskType('', '登録後のステップメールを作って配信設計したい'), 'email_ops');
assert.ok(inferTaskSequence('cmo_leader', 'CMOとしてコールドメールも含めた獲得施策を設計して', { maxTasks: 8 }).includes('cold_email'));
const cmoColdEmailSequence = inferTaskSequence('cmo_leader', 'CMOとしてコールドメールも含めた獲得施策を設計して', { maxTasks: 8 });
assert.ok(cmoColdEmailSequence.includes('list_creator'));
assert.ok(cmoColdEmailSequence.indexOf('list_creator') < cmoColdEmailSequence.indexOf('cold_email'));
assert.ok(inferTaskSequence('cmo_leader', 'CMOとしてホームページを見て最適な掲載媒体とGBPまで決めて', { maxTasks: 8 }).includes('media_planner'));
assert.ok(inferTaskSequence('cmo_leader', 'CMOとしてホームページを見て最適な掲載媒体とGBPまで決めて', { maxTasks: 8 }).includes('research'));
assert.ok(inferTaskSequence('cmo_leader', 'CMOとしてホームページを見て最適な掲載媒体とGBPまで決めて', { maxTasks: 8 }).includes('citation_ops'));
assert.equal(inferTaskType('', '無料掲載できる媒体をリスト化して一気に掲載したい'), 'directory_submission');
assert.equal(inferTaskType('', '広告費なしでWeb周りの無料施策を全部やってほしい'), 'cmo_leader');
assert.equal(inferTaskType('', '1告知でX Reddit Indie Hackers Instagramまでまとめて作りたい'), 'cmo_leader');
assert.equal(inferTaskType('', 'CTOとしてアーキテクチャを見て'), 'cto_leader');
assert.equal(inferTaskType('', 'CFOとしてユニットエコノミクスを確認して'), 'cfo_leader');
assert.equal(inferTaskType('', '法務部長として規約リスクを見て'), 'legal_leader');
assert.equal(inferTaskType('', 'Give me a competitor teardown for Linear vs Jira'), 'teardown');
assert.equal(inferTaskType('', 'Review this landing page and improve the CTA'), 'landing');
assert.equal(inferTaskType('', 'Draft a hiring JD for our founding engineer'), 'hiring');
assert.equal(inferTaskType('', 'この依頼文をブラッシュアップして足りない情報をヒアリングして'), 'prompt_brushup');
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'PROMPT BRUSHUP AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'PRICING STRATEGY AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'GROWTH OPERATOR AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'DIRECTORY SUBMISSION AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'ACQUISITION AUTOMATION AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'MEDIA PLANNER AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'MEO AGENT'));
assert.ok(!DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'FREE WEB GROWTH TEAM'));
assert.ok(!DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'LAUNCH TEAM LEADER'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'RESEARCH TEAM LEADER'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'BUILD TEAM LEADER'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'CMO TEAM LEADER'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'CTO TEAM LEADER'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'CPO TEAM LEADER'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'CFO TEAM LEADER'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'LEGAL TEAM LEADER'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'X OPS CONNECTOR AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'EMAIL OPS CONNECTOR AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'COLD EMAIL AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'REDDIT LAUNCH AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'INDIE HACKERS LAUNCH AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'INSTAGRAM LAUNCH AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'DATA ANALYSIS AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.length >= 30);

for (const kind of BUILT_IN_KINDS) {
  const payload = sampleAgentPayload(kind, { prompt: 'QA sample. Answer in English.', output_language: 'en' });
  const executionPolicy = builtInExecutionPolicyForKind(kind);
  const toolStrategy = builtInToolStrategyForKind(kind);
  const specialistMethod = builtInSpecialistMethodForKind(kind);
  const scopeBoundaries = builtInScopeBoundariesForKind(kind);
  const freshnessPolicy = builtInFreshnessPolicyForKind(kind);
  const sensitiveDataPolicy = builtInSensitiveDataPolicyForKind(kind);
  const costControlPolicy = builtInCostControlPolicyForKind(kind);
  assert.ok(executionPolicy.depth_policy.length > 40, `${kind} should have response depth policy`);
  assert.ok(executionPolicy.concision_rule.length > 40, `${kind} should have concision rule`);
  assert.ok(freshnessPolicy.length > 70, `${kind} should have a specific freshness policy`);
  assert.ok(sensitiveDataPolicy.length > 80, `${kind} should have a specific sensitive data policy`);
  assert.ok(costControlPolicy.length > 70, `${kind} should have a specific cost control policy`);
  assert.ok(Array.isArray(specialistMethod), `${kind} should have specialist method`);
  assert.ok(specialistMethod.length >= 3, `${kind} should have at least three specialist method steps`);
  assert.ok(specialistMethod.every((step) => step.length > 30), `${kind} specialist method steps should be specific`);
  assert.ok(Array.isArray(scopeBoundaries), `${kind} should have scope boundaries`);
  assert.ok(scopeBoundaries.length >= 3, `${kind} should have at least three scope boundaries`);
  assert.ok(scopeBoundaries.every((step) => step.length > 30), `${kind} scope boundaries should be specific`);
  assert.ok(['default', 'when_current', 'provided_only'].includes(toolStrategy.web_search), `${kind} should have a valid web search mode`);
  assert.ok(toolStrategy.source_mode.length > 8, `${kind} should define source mode`);
  assert.ok(toolStrategy.note.length > 40, `${kind} should define tool strategy note`);
  assert.equal(payload.runtime.delivery_policy.depth_policy, executionPolicy.depth_policy, `${kind} fallback runtime should expose depth policy`);
  assert.equal(payload.runtime.delivery_policy.concision_rule, executionPolicy.concision_rule, `${kind} fallback runtime should expose concision rule`);
  assert.equal(payload.runtime.delivery_policy.freshness_policy, freshnessPolicy, `${kind} fallback runtime should expose freshness policy`);
  assert.equal(payload.runtime.delivery_policy.sensitive_data_policy, sensitiveDataPolicy, `${kind} fallback runtime should expose sensitive data policy`);
  assert.equal(payload.runtime.delivery_policy.cost_control_policy, costControlPolicy, `${kind} fallback runtime should expose cost control policy`);
  assert.deepEqual(payload.runtime.delivery_policy.specialist_method, specialistMethod, `${kind} fallback runtime should expose specialist method`);
  assert.deepEqual(payload.runtime.delivery_policy.scope_boundaries, scopeBoundaries, `${kind} fallback runtime should expose scope boundaries`);
  assert.deepEqual(payload.runtime.tool_strategy, toolStrategy, `${kind} fallback runtime should expose tool strategy`);
  assert.ok(payload.files[0].content.includes('## First move'), `${kind} fallback delivery should include first move`);
  assert.ok(payload.files[0].content.includes('## Output contract'), `${kind} fallback delivery should include output contract`);
  assert.ok(payload.files[0].content.includes('## Evidence policy'), `${kind} fallback delivery should include evidence policy`);
  assert.ok(payload.files[0].content.includes('## Confidence rubric'), `${kind} fallback delivery should include confidence rubric`);
  assert.ok(payload.files[0].content.includes('## Prioritization rubric'), `${kind} fallback delivery should include prioritization rubric`);
  assert.ok(payload.files[0].content.includes('## Inputs to confirm'), `${kind} fallback delivery should include input needs`);
  assert.ok(payload.files[0].content.includes('## Assumption policy'), `${kind} fallback delivery should include assumption policy`);
  assert.ok(payload.files[0].content.includes('## Clarify or escalate when'), `${kind} fallback delivery should include escalation triggers`);
  assert.ok(payload.files[0].content.includes('## Minimum blocker questions'), `${kind} fallback delivery should include minimum questions`);
  assert.ok(payload.files[0].content.includes('## Acceptance checks'), `${kind} fallback delivery should include acceptance checks`);
  assert.ok(payload.files[0].content.includes('## Failure modes to avoid'), `${kind} fallback delivery should include failure modes`);
  assert.ok(payload.files[0].content.includes('## Handoff artifacts'), `${kind} fallback delivery should include handoff artifacts`);
  assert.ok(payload.files[0].content.includes('## Measurement signals'), `${kind} fallback delivery should include measurement signals`);
  assert.ok(payload.files[0].content.includes('## Next action pattern'), `${kind} fallback delivery should include next action pattern`);
  assert.ok(payload.files[0].content.includes('## Final review checks'), `${kind} fallback delivery should include final review checks`);
  assert.ok(payload.files[0].content.includes('## Quality checks'), `${kind} fallback delivery should include quality checks`);
}

const expectedModelTiers = {
  prompt_brushup: 'cheap',
  research: 'standard',
  writer: 'standard',
  code: 'code',
  pricing: 'standard',
  teardown: 'standard',
  landing: 'standard',
  validation: 'standard',
  growth: 'standard',
  acquisition_automation: 'standard',
  media_planner: 'standard',
  list_creator: 'standard',
  email_ops: 'standard',
  cold_email: 'standard',
  directory_submission: 'standard',
  citation_ops: 'standard',
  research_team_leader: 'standard',
  build_team_leader: 'code',
  cmo_leader: 'standard',
  cto_leader: 'code',
  cpo_leader: 'standard',
  cfo_leader: 'reasoning',
  legal_leader: 'reasoning',
  instagram: 'cheap',
  x_post: 'cheap',
  reddit: 'cheap',
  indie_hackers: 'cheap',
  data_analysis: 'standard',
  seo_gap: 'standard',
  hiring: 'cheap',
  diligence: 'reasoning'
};

const expectedWebSearchModes = {
  prompt_brushup: 'provided_only',
  research: 'default',
  writer: 'when_current',
  code: 'when_current',
  pricing: 'default',
  teardown: 'default',
  landing: 'default',
  validation: 'when_current',
  growth: 'default',
  acquisition_automation: 'default',
  media_planner: 'default',
  list_creator: 'default',
  email_ops: 'default',
  cold_email: 'default',
  directory_submission: 'default',
  citation_ops: 'default',
  research_team_leader: 'default',
  build_team_leader: 'default',
  cmo_leader: 'default',
  cto_leader: 'default',
  cpo_leader: 'default',
  cfo_leader: 'default',
  legal_leader: 'default',
  instagram: 'default',
  x_post: 'default',
  reddit: 'default',
  indie_hackers: 'default',
  data_analysis: 'when_current',
  seo_gap: 'default',
  hiring: 'when_current',
  diligence: 'default'
};

assert.deepEqual([...Object.keys(expectedWebSearchModes)].sort(), [...BUILT_IN_KINDS].sort());
for (const kind of BUILT_IN_KINDS) {
  assert.equal(builtInModelTierForKind(kind), expectedModelTiers[kind], `${kind} should have an explicit optimized model tier`);
  assert.equal(builtInToolStrategyForKind(kind).web_search, expectedWebSearchModes[kind], `${kind} should have an explicit tool strategy`);
}

assert.deepEqual(
  builtInModelRoutingForKind({
    cheapModel: 'gpt-5.4-nano',
    standardModel: 'gpt-5.4-mini',
    reasoningModel: 'gpt-5.4-mini',
    codeModel: 'gpt-5.4-mini',
    heavyModel: 'gpt-5.4',
    kindModelOverrides: {}
  }, 'prompt_brushup'),
  { model: 'gpt-5.4-nano', tier: 'cheap', source: 'tier_cheap' }
);
assert.deepEqual(
  builtInModelRoutingForKind({
    cheapModel: 'gpt-5.4-nano',
    standardModel: 'gpt-5.4-mini',
    reasoningModel: 'gpt-5.4-mini',
    codeModel: 'gpt-5.4-mini',
    heavyModel: 'gpt-5.4',
    kindModelOverrides: { cfo_leader: 'gpt-5.4' }
  }, 'cfo_leader'),
  { model: 'gpt-5.4', tier: 'reasoning', source: 'kind_override' }
);
assert.deepEqual(
  builtInModelRoutingForKind({
    cheapModel: 'gpt-5.4-nano',
    standardModel: 'gpt-5.4-mini',
    reasoningModel: 'gpt-5.4-mini',
    codeModel: 'gpt-5.4-mini',
    heavyModel: 'gpt-5.4',
    kindModelOverrides: {}
  }, 'research', {
    prompt: 'Compare five competitors, derive positioning, propose a GTM narrative, identify risks and trade-offs, and produce a decision memo with acceptance criteria.\n\nInclude architecture implications, pricing, SEO, and launch sequencing.',
    input: {
      urls: ['https://a.example', 'https://b.example', 'https://c.example'],
      files: [
        { name: 'notes-1.md', content: 'x'.repeat(2600) },
        { name: 'notes-2.md', content: 'y'.repeat(1800) }
      ]
    }
  }),
  { model: 'gpt-5.4', tier: 'standard', source: 'complexity_heavy' }
);
const promptBrushupHealth = builtInAgentHealthPayload('prompt_brushup', { OPENAI_API_KEY: 'test-key' });
assert.equal(promptBrushupHealth.model, 'gpt-5.4-nano');
assert.equal(promptBrushupHealth.model_tier, 'cheap');
assert.equal(promptBrushupHealth.tool_strategy.web_search, 'provided_only');
assert.ok(promptBrushupHealth.specialist_method.some((step) => step.includes('dispatchable brief')));
assert.ok(promptBrushupHealth.scope_boundaries.some((step) => step.includes('underlying task')));
assert.ok(promptBrushupHealth.freshness_policy.includes('current chat/request'));
assert.ok(promptBrushupHealth.sensitive_data_policy.includes('pasted prompts'));
assert.ok(promptBrushupHealth.cost_control_policy.includes('cheap planning pass'));
const ctoHealth = builtInAgentHealthPayload('cto_leader', { OPENAI_API_KEY: 'test-key' });
assert.equal(ctoHealth.model, 'gpt-5.4-mini');
assert.equal(ctoHealth.model_tier, 'code');
assert.equal(ctoHealth.tool_strategy.web_search, 'default');
assert.ok(ctoHealth.specialist_method.some((step) => step.includes('rollout')));
assert.ok(ctoHealth.scope_boundaries.some((step) => step.includes('architecture changes')));
assert.ok(ctoHealth.freshness_policy.includes('version-sensitive'));
assert.ok(ctoHealth.sensitive_data_policy.includes('security findings'));
assert.ok(ctoHealth.cost_control_policy.includes('smallest reversible technical decision'));

console.log('builtin-agents qa passed');
