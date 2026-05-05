import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  builtInTrustProfileForKind,
  runBuiltInAgent,
  sampleAgentPayload
} from '../lib/builtin-agents.js';
import { BUILT_IN_KIND_DEFAULTS } from '../lib/builtin-agents/agents/index.js';
import {
  CMO_WORKFLOW_ACTION_LAYER_TASKS,
  CMO_WORKFLOW_EXECUTION_LAYER_TASKS,
  CMO_WORKFLOW_PLANNING_LAYER_TASKS,
  CMO_WORKFLOW_PREPARATION_LAYER_TASKS,
  CMO_WORKFLOW_RESEARCH_LAYER_TASKS,
  cmoAgentActionContractForKind,
} from '../lib/builtin-agents/agents/cmo-leader.js';
import {
  CONNECTOR_EXECUTION_POLICIES,
  connectorExecutionPolicyForTask,
  leaderControlContractForTask,
  leaderTaskLayer,
  leaderTaskPhase,
  leaderTaskUsesWebSearch
} from '../lib/orchestration.js';
import { assessAgentRegistrationSafety, normalizeManifest } from '../lib/manifest.js';
import { agentLinksFromRecord, buildAgentTeamDeliveryOutput, inferTaskSequence, inferTaskType, listCreatorUsageEstimateForOrder, DEFAULT_AGENT_SEEDS } from '../lib/shared.js';
import { isBuiltInSampleAgent, isBuiltInSampleHealthcheckUrl, isBuiltInSampleJobEndpoint, sampleKindFromAgent } from '../lib/verify.js';
import { extractSocialPostTextFromDeliveryContent } from '../public/delivery-action-contract.js';

const builtInAgentEntrySource = readFileSync(new URL('../lib/builtin-agents.js', import.meta.url), 'utf8');
const orchestrationSource = readFileSync(new URL('../lib/orchestration.js', import.meta.url), 'utf8');
const cmoWorkflowRuntimeSource = readFileSync(new URL('../lib/builtin-agents/runtime/cmo-workflow.js', import.meta.url), 'utf8');
const cmoLeaderSource = readFileSync(new URL('../lib/builtin-agents/agents/cmo-leader.js', import.meta.url), 'utf8');
const builtInAgentDefinitionsDir = new URL('../lib/builtin-agents/agents/', import.meta.url);
assert.ok(builtInAgentEntrySource.includes("./builtin-agents/runtime/cmo-workflow.js"), 'Built-in CMO workflow execution engine must be split out of builtin-agents.js');
assert.ok(!builtInAgentEntrySource.includes('function cmoGenericArtifactMarkdown('), 'CMO specialist artifact builders must not live in builtin-agents.js');
assert.ok(!builtInAgentEntrySource.includes('const BUILT_IN_KIND_EXECUTION_FOCUS'), 'Per-agent execution focus must live in individual agent files, not builtin-agents.js');
assert.ok(!builtInAgentEntrySource.includes('const BUILT_IN_KIND_OUTPUT_SECTIONS'), 'Per-agent output sections must live in individual agent files, not builtin-agents.js');
assert.ok(!builtInAgentEntrySource.includes('const BUILT_IN_KIND_ACCEPTANCE_CHECKS'), 'Per-agent acceptance checks must live in individual agent files, not builtin-agents.js');
assert.ok(builtInAgentEntrySource.includes('builtInAgentDefinitionForKind(kind)'), 'Dispatcher must read concrete agent profiles from split agent definitions');
const removedGamblingAdjacentKind = ['blood', 'stock'].join('');
assert.ok(!builtInAgentEntrySource.includes(`${removedGamblingAdjacentKind}:`), 'Removed gambling-adjacent built-in fallback agents must not remain in the dispatcher');
assert.ok(cmoWorkflowRuntimeSource.includes('export function cmoSpecialistDeliveryMarkdown('), 'CMO specialist delivery builder should live in the runtime module');
assert.ok(cmoWorkflowRuntimeSource.includes('ROLE_SPECIFIC_REQUIREMENTS'), 'CMO runtime must keep role-specific quality gates per action layer');
const builtInAgentDefinitionFiles = readdirSync(builtInAgentDefinitionsDir)
  .filter((fileName) => fileName.endsWith('.js') && fileName !== 'index.js')
  .sort();
const builtInAgentDefinitionsSource = builtInAgentDefinitionFiles
  .map((fileName) => readFileSync(new URL(fileName, builtInAgentDefinitionsDir), 'utf8'))
  .join('\n');
const builtInAgentSource = `${builtInAgentEntrySource}\n${builtInAgentDefinitionsSource}`;
assert.ok(!builtInAgentEntrySource.includes('const BUILT_IN_KIND_DEFAULTS = {'), 'built-in agent definitions must not live in the dispatcher file');
assert.equal(existsSync(new URL('../lib/builtin-agents/orchestration.js', import.meta.url)), false, 'orchestration must not be scoped under built-in agents');
assert.ok(orchestrationSource.includes('LEADER_ORCHESTRATION_PROFILES'), 'shared leader orchestration profiles should live in lib/orchestration.js');
assert.ok(orchestrationSource.includes('LEADER_CONTROL_CONTRACT_VERSION'), 'leader control contracts should live in lib/orchestration.js');
assert.ok(orchestrationSource.includes('CONNECTOR_EXECUTION_POLICIES'), 'shared connector policies should live in lib/orchestration.js');
assert.ok(!orchestrationSource.includes('CMO_WORKFLOW_'), 'CMO workflow content should live in cmo-leader.js, not the shared orchestration connector');
assert.ok(!orchestrationSource.includes('cmoAgentActionContract'), 'CMO action contracts should live in cmo-leader.js, not the shared orchestration connector');
assert.ok(cmoLeaderSource.includes('CMO_AGENT_ACTION_CONTRACTS'), 'CMO action contracts should live in the CMO leader definition');
assert.ok(cmoLeaderSource.includes('CMO_WORKFLOW_RESEARCH_LAYER_TASKS'), 'CMO workflow layer constants should live in the CMO leader definition');
assert.deepEqual(CMO_WORKFLOW_RESEARCH_LAYER_TASKS, ['research', 'teardown', 'data_analysis']);
assert.deepEqual(CMO_WORKFLOW_PLANNING_LAYER_TASKS, ['media_planner', 'growth']);
assert.deepEqual(CMO_WORKFLOW_PREPARATION_LAYER_TASKS, ['list_creator', 'landing', 'seo_gap', 'writing', 'writer']);
assert.deepEqual(CMO_WORKFLOW_ACTION_LAYER_TASKS, ['x_post', 'instagram', 'reddit', 'indie_hackers', 'email_ops', 'cold_email', 'directory_submission', 'citation_ops', 'acquisition_automation']);
assert.deepEqual(CMO_WORKFLOW_EXECUTION_LAYER_TASKS, CMO_WORKFLOW_ACTION_LAYER_TASKS);
assert.equal(leaderTaskLayer('cmo_leader', 'research'), 1);
assert.equal(leaderTaskLayer('cmo_leader', 'media_planner'), 2);
assert.equal(leaderTaskLayer('cmo_leader', 'list_creator'), 3);
assert.equal(leaderTaskLayer('cmo_leader', 'seo_gap'), 3);
assert.equal(leaderTaskLayer('cmo_leader', 'x_post'), 4);
const cmoLeaderControlContract = leaderControlContractForTask('cmo_leader');
assert.equal(cmoLeaderControlContract.version, 'leader-control/v1');
assert.equal(cmoLeaderControlContract.role, 'agent_selection_handoff_review_synthesis');
assert.ok(cmoLeaderControlContract.controlLoop.includes('handoff'));
assert.ok(cmoLeaderControlContract.controlLoop.includes('review'));
assert.ok(cmoLeaderControlContract.handoffFields.includes('source_inputs'));
assert.ok(cmoLeaderControlContract.qualityChecks.some((check) => check.id === 'handoff_input_used'));
assert.ok(cmoLeaderControlContract.downstreamTaskTypes.includes('x_post'));
assert.equal(leaderControlContractForTask('x_post'), null);
assert.equal(leaderTaskPhase('cmo_leader', 'teardown'), 'research');
assert.equal(leaderTaskPhase('cmo_leader', 'growth'), 'planning');
assert.equal(leaderTaskPhase('cmo_leader', 'list_creator'), 'preparation');
assert.equal(leaderTaskPhase('cmo_leader', 'landing'), 'preparation');
assert.equal(leaderTaskPhase('cmo_leader', 'writing'), 'preparation');
assert.equal(leaderTaskPhase('cmo_leader', 'instagram'), 'action');
assert.equal(leaderTaskPhase('cmo_leader', 'citation_ops'), 'action');
assert.equal(leaderTaskPhase('cmo_leader', 'directory_submission'), 'action');
assert.equal(leaderTaskUsesWebSearch('cmo_leader', 'research'), true);
assert.equal(leaderTaskUsesWebSearch('cmo_leader', 'list_creator'), false);
assert.equal(leaderTaskUsesWebSearch('cmo_leader', 'media_planner'), false);
assert.ok(builtInAgentEntrySource.includes("leaderTaskPhase('cmo_leader', normalizedKind)"), 'CMO specialist runtime phase must use the shared leader profile instead of hardcoded task buckets');
for (const kind of ['media_planner', 'list_creator', 'writing', 'writer', 'instagram', 'citation_ops']) {
  assert.notEqual(cmoAgentActionContractForKind(kind).action, cmoAgentActionContractForKind('growth').action, `${kind} must not fall back to the generic growth action contract`);
}
const cmoPhaseQaBody = {
  prompt: 'Task: cmo_leader Goal: aiagent-marketplace.net signups.',
  input: {
    _broker: {
      workflow: {
        primaryTask: 'cmo_leader',
        leaderHandoff: {
          priorRuns: [{ taskType: 'research', status: 'completed', summary: 'Engineers need execution-layer proof.' }]
        }
      }
    }
  }
};
assert.ok(sampleAgentPayload('growth', cmoPhaseQaBody).files[0].content.includes('This is a planning-layer delivery'), 'growth must remain a planning-layer CMO specialist');
assert.ok(sampleAgentPayload('writer', cmoPhaseQaBody).files[0].content.includes('This is a preparation-layer delivery'), 'writer/writing must remain a preparation-layer CMO specialist');
assert.ok(sampleAgentPayload('instagram', cmoPhaseQaBody).files[0].content.includes('This is a action-layer delivery'), 'instagram must remain an action-layer CMO specialist');
assert.ok(sampleAgentPayload('citation_ops', cmoPhaseQaBody).files[0].content.includes('This is a action-layer delivery'), 'citation_ops must remain an action-layer CMO specialist');
const cmoListCreatorNoRowsBody = {
  prompt: 'Task: cmo_leader Goal: customer acquisition Intake answers: 1.aiagent-marketplace.net 2.engineers 3.signups 4.no ads 5.plan and action',
  input: {
    _broker: {
      workflow: {
        primaryTask: 'cmo_leader',
        sequencePhase: 'preparation',
        leaderHandoff: {
          priorRuns: [{
            taskType: 'research',
            status: 'completed',
            summary: 'Search query: AI agent marketplace engineers alternatives',
            bullets: ['Search query only; no concrete company public URLs yet'],
            files: [{ name: 'research-delivery.md', content: '# research\nSearch query: AI agent marketplace engineers alternatives' }]
          }]
        }
      }
    }
  }
};
const cmoListCreatorNoRowsContent = sampleAgentPayload('list_creator', cmoListCreatorNoRowsBody).files[0].content;
assert.ok(cmoListCreatorNoRowsContent.includes('aiagent-marketplace.net'), 'CMO context extraction must preserve full numbered-list domains');
assert.ok(!/https:\/\/aiagent-marke(?:\s|\)|$)/i.test(cmoListCreatorNoRowsContent), 'CMO context extraction must not emit truncated domains');
assert.ok(cmoListCreatorNoRowsContent.includes('BLOCKED_MISSING_SOURCE_ROWS'), 'list_creator must block instead of fabricating rows when handoff has only queries/summaries');
assert.ok(!/要URL確認|未添付|URL未確認|Not attached|source URL needed/i.test(cmoListCreatorNoRowsContent), 'list_creator must not use placeholder lead rows when concrete public URLs are missing');
assert.ok(
  BUILT_IN_KIND_DEFAULTS.list_creator.systemPrompt.includes('Never convert search queries, delivery file names, handoff summaries'),
  'list_creator profile must prohibit turning query/title handoff text into lead rows'
);
const cmoActionSequence = inferTaskSequence(
  'cmo_leader',
  'Plan and do actions for aiagent-marketplace.net: research competitors, prepare an X post, and submit to AI tool directories.',
  { maxTasks: 14 }
);
assert.ok(cmoActionSequence.includes('x_post'), 'CMO action sequence must preserve requested X posting');
assert.ok(cmoActionSequence.includes('directory_submission'), 'CMO action sequence must preserve requested directory submission');
assert.ok(cmoActionSequence.includes('media_planner'), 'CMO action sequence must include planning before action');
assert.ok(cmoActionSequence.includes('landing'), 'CMO action sequence must include preparation before action');
assert.ok(cmoActionSequence.indexOf('media_planner') < cmoActionSequence.indexOf('x_post'), 'CMO planning must run before X action');
assert.ok(cmoActionSequence.indexOf('landing') < cmoActionSequence.indexOf('x_post'), 'CMO preparation must run before X action');
assert.equal(connectorExecutionPolicyForTask('x_post').capability, 'x.post');
assert.equal(connectorExecutionPolicyForTask('directory_submission').fallback, 'manual_submission_queue');
assert.ok(CONNECTOR_EXECUTION_POLICIES.email_ops, 'email connector policy should be shared for any agent');
assert.ok(
  builtInAgentEntrySource.includes("import { BUILT_IN_KIND_DEFAULTS } from './builtin-agents/agents/index.js';"),
  'dispatcher should load built-in agent definitions from the split registry'
);
assert.ok(builtInAgentDefinitionFiles.includes('cmo-leader.js'), 'CMO leader definition should live in its own file');
assert.ok(builtInAgentDefinitionFiles.includes('research-team-leader.js'), 'research leader definition should live in its own file');
assert.ok(builtInAgentDefinitionFiles.includes('teardown.js'), 'teardown specialist definition should live in its own file');
assert.equal(builtInAgentDefinitionFiles.includes(`${removedGamblingAdjacentKind}.js`), false, 'Gambling-adjacent built-in agent file must be fully removed');
assert.equal(BUILT_IN_KINDS.includes(removedGamblingAdjacentKind), false, 'Gambling-adjacent kind must not be routable as a built-in kind');
assert.equal(DEFAULT_AGENT_SEEDS.some((agent) => agent.id === `agent_${removedGamblingAdjacentKind}_01`), false, 'Gambling-adjacent seed must not be active');
for (const kind of Object.keys(BUILT_IN_KIND_DEFAULTS)) {
  const expectedFile = `${kind.replaceAll('_', '-')}.js`;
  assert.ok(
    existsSync(new URL(expectedFile, builtInAgentDefinitionsDir)),
    `${kind} definition must live in lib/builtin-agents/agents/${expectedFile}`
  );
}
const requiredAgentProfileFields = [
  'executionLayer',
  'executionFocus',
  'outputSections',
  'inputNeeds',
  'acceptanceChecks',
  'firstMove',
  'failureModes',
  'evidencePolicy',
  'nextAction',
  'confidenceRubric',
  'handoffArtifacts',
  'prioritizationRubric',
  'measurementSignals',
  'assumptionPolicy',
  'escalationTriggers',
  'minimumQuestions',
  'reviewChecks',
  'depthPolicy',
  'concisionRule',
  'toolStrategy',
  'specialistMethod',
  'scopeBoundaries',
  'freshnessPolicy',
  'sensitiveDataPolicy',
  'costControlPolicy'
];
for (const [kind, defaults] of Object.entries(BUILT_IN_KIND_DEFAULTS)) {
  for (const field of requiredAgentProfileFields) {
    assert.ok(defaults[field] != null, `${kind} must define ${field} in its own agent file`);
  }
  assert.ok(['research', 'planning', 'preparation', 'action', 'leader', 'implementation', 'operations_support', 'action_support', 'general'].includes(defaults.executionLayer), `${kind} must have a valid execution layer`);
  assert.ok(Array.isArray(defaults.outputSections) && defaults.outputSections.length >= 3, `${kind} must define concrete output sections`);
  assert.ok(Array.isArray(defaults.acceptanceChecks) && defaults.acceptanceChecks.length >= 3, `${kind} must define concrete acceptance checks`);
  assert.ok(Array.isArray(defaults.specialistMethod) && defaults.specialistMethod.length >= 3, `${kind} must define concrete specialist method`);
  assert.ok(defaults.toolStrategy && typeof defaults.toolStrategy === 'object', `${kind} must define tool strategy in its agent file`);
  assert.ok(['default', 'when_current', 'provided_only', 'never'].includes(defaults.toolStrategy.web_search), `${kind} must define a valid web_search mode`);
}
assert.equal(BUILT_IN_KIND_DEFAULTS.research.executionLayer, 'research');
assert.equal(BUILT_IN_KIND_DEFAULTS.media_planner.executionLayer, 'planning');
assert.equal(BUILT_IN_KIND_DEFAULTS.list_creator.executionLayer, 'preparation');
assert.equal(BUILT_IN_KIND_DEFAULTS.x_post.executionLayer, 'action');
assert.equal(BUILT_IN_KIND_DEFAULTS.cmo_leader.executionLayer, 'leader');
assert.ok(BUILT_IN_KIND_DEFAULTS.list_creator.outputSections.includes('Reviewable lead rows'), 'list creator must own row-level list output requirements');
assert.ok(BUILT_IN_KIND_DEFAULTS.media_planner.acceptanceChecks.some((item) => /No publishing|not claimed/i.test(item)), 'media planner must remain a planning layer agent');
assert.ok(builtInAgentSource.includes("required: ['summary', 'report_summary', 'bullets', 'next_action', 'file_markdown', 'confidence', 'authority_request']"));
assert.ok(builtInAgentSource.includes("If no external authority or source selection is needed, set authority_request to null."));
assert.ok(builtInAgentSource.includes("tools: [{ type: 'web_search' }]"), 'OpenAI built-in web search should be enabled for source-sensitive work');
assert.ok(builtInAgentSource.includes('BRAVE_SEARCH_API_KEY'), 'Brave search API key support should be present for built-in search');
assert.ok(builtInAgentSource.includes("X-Subscription-Token"), 'Brave search requests should use the Brave subscription token header');
assert.ok(builtInAgentSource.includes('webSourcesOf(payload)'), 'OpenAI web search sources should be extracted from Responses payloads');
assert.ok(builtInAgentSource.includes('web_sources'), 'OpenAI web sources should be surfaced in report/runtime payloads');
assert.equal(
  builtInShouldUseWebSearchForKind('cmo_leader', { input: { _broker: { workflow: { sequencePhase: 'initial', forceWebSearch: true } } } }),
  false,
  'Initial leader workflow runs must not use web search'
);
assert.equal(
  builtInShouldUseWebSearchForKind('research', { input: { _broker: { workflow: { sequencePhase: 'research', forceWebSearch: true } } } }),
  true,
  'Research/search layer specialists must use web search when required'
);
assert.equal(
  builtInShouldUseWebSearchForKind('media_planner', { input: { _broker: { workflow: { sequencePhase: 'planning', forceWebSearch: true } } } }),
  false,
  'Planning layer specialists must consume the leader source bundle instead of browsing'
);
assert.ok(builtInAgentSource.includes('Supporting work products'), 'Leader final deliveries should include supporting work product tables');
assert.ok(builtInAgentSource.includes('target URL/path, H1 or title, section outline, CTA copy'), 'Growth operator output must include executable artifact packets');
assert.ok(builtInAgentSource.includes('Execution-request handling'), 'Action-through-delivery orders must activate execution-specific leader behavior');
assert.ok(BUILT_IN_KIND_DEFAULTS.cmo_leader.systemPrompt.includes('do not stop at a plan or "approve research first"'), 'CMO leader must not end action requests as plan-only approval reports');
assert.ok(builtInAgentSource.includes('workflow_fast_draft'), 'Workflow built-in runs should use a bounded single-draft path to avoid Cloudflare background timeout loops');
assert.ok(builtInAgentSource.includes('BUILTIN_OPENAI_WORKFLOW_TIMEOUT_MS'), 'Workflow built-in run timeout must be configurable');
assert.ok(builtInAgentSource.includes("normalizedKind.endsWith('_leader')"), 'Leader workflow planning should not spend the first dispatch on web search');
assert.ok(builtInAgentSource.includes('Promise.race'), 'OpenAI calls should have an explicit timeout race, not only AbortController');
assert.ok(builtInAgentSource.includes('workflow_fast_fallback'), 'Workflow built-in runs should complete with a fallback if OpenAI exceeds the latency budget');

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
  assert.equal(seed.trust?.version, 'agent-trust/v1', `${seed.name} must expose a top-level trust profile`);
  assert.equal(seed.metadata?.trust?.version, 'agent-trust/v1', `${seed.name} metadata must expose trust profile`);
  assert.equal(seed.metadata?.manifest?.trust?.version, 'agent-trust/v1', `${seed.name} manifest must expose trust profile`);
  assert.equal(seed.metadata?.manifest?.metadata?.trust?.version, 'agent-trust/v1', `${seed.name} manifest metadata must expose trust profile`);
  assert.ok(Number(seed.trust?.score || 0) >= 80, `${seed.name} trust score must be present`);
  assert.ok(Array.isArray(seed.trust?.quality_checks) && seed.trust.quality_checks.length >= 4, `${seed.name} must define trust QA checks`);
  assert.ok(seed.verificationDetails?.details?.trust?.summary, `${seed.name} verification details must carry trust summary`);
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
assert.ok(englishResearch.files[0].content.includes('## Trust and quality assurance'));
assert.ok(englishResearch.files[0].content.includes('Trust profile:'));
assert.ok(englishResearch.files[0].content.includes('Not guaranteed: items without source, connector, approval, or execution proof'));
assert.equal(englishResearch.runtime.delivery_policy.trust_profile.version, 'agent-trust/v1');
assert.equal(englishResearch.runtime.delivery_policy.trust_profile.level, 'source_bound');
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
  input: { _broker: { workflow: { sequencePhase: 'research', forceWebSearch: true, webSearchRequiredReason: 'leader_research_layer' } } }
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
assert.ok(japaneseResearch.files[0].content.includes('## 信頼性と品質保証'));
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
assert.ok(writerSeed?.description.includes('reusable copy packets'));
assert.ok(writerSeed?.taskTypes?.includes('copywriting'));
assert.ok(writerSeed?.metadata?.manifest?.capabilities?.includes('message_hierarchy'));
assert.ok(writerSeed?.metadata?.manifest?.capabilities?.includes('recommended_copy_packet'));
assert.equal(writerSeed?.metadata?.manifest?.metadata?.layer, 'content_generation');
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
assert.ok(cmoSeed?.metadata?.manifest?.capabilities?.includes('task_decomposition'));
assert.ok(cmoSeed?.metadata?.manifest?.capabilities?.includes('routing_decision'));
assert.ok(cmoSeed?.metadata?.manifest?.capabilities?.includes('stop_go_gate'));
assert.ok(cmoSeed?.metadata?.manifest?.capabilities?.includes('final_responsibility'));
assert.equal(cmoSeed?.metadata?.manifest?.metadata?.planned_action_contract, 'lane_owner_artifact_connector_metric');
const ctoSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_cto_leader_01');
assert.ok(ctoSeed?.description.includes('safe technical lane'));
assert.ok(ctoSeed?.metadata?.manifest?.capabilities?.includes('technical_dispatch_packet'));
assert.ok(ctoSeed?.metadata?.manifest?.capabilities?.includes('rollout_packet'));
assert.ok(ctoSeed?.metadata?.manifest?.capabilities?.includes('rollback_trigger'));
assert.equal(ctoSeed?.metadata?.manifest?.metadata?.planned_action_contract, 'system_owner_artifact_validation');
assert.equal(ctoSeed?.metadata?.manifest?.metadata?.architecture_contract, 'constraints_tradeoffs_rollout_rollback');
const landingSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_landing_01');
assert.ok(landingSeed?.description.includes('HTML/CSS'));
assert.ok(landingSeed?.metadata?.manifest?.capabilities?.includes('landing_html'));
assert.ok(landingSeed?.metadata?.manifest?.capabilities?.includes('deploy_handoff'));
const instagramSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_instagram_launch_01');
assert.ok(instagramSeed?.metadata?.manifest?.capabilities?.includes('instagram_api_handoff'));
assert.ok(instagramSeed?.metadata?.manifest?.capabilities?.includes('schedule_plan'));
assert.ok(!instagramSeed?.taskTypes?.includes('writing'));
assert.equal(instagramSeed?.metadata?.manifest?.metadata?.preferred_upstream_specialist, 'writer');
const xSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_x_launch_01');
assert.ok(xSeed?.metadata?.manifest?.capabilities?.includes('exact_post_packet'));
assert.ok(xSeed?.metadata?.manifest?.capabilities?.includes('scheduled_post_packet'));
assert.ok(!xSeed?.taskTypes?.includes('writing'));
assert.equal(xSeed?.metadata?.manifest?.metadata?.preferred_upstream_specialist, 'writer');
const emailOpsSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_email_ops_01');
assert.ok(emailOpsSeed?.metadata?.manifest?.capabilities?.includes('exact_send_packet'));
assert.ok(emailOpsSeed?.metadata?.manifest?.capabilities?.includes('scheduled_send_packet'));
assert.equal(emailOpsSeed?.metadata?.manifest?.metadata?.preferred_upstream_specialist, 'writer');
const listCreatorSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_list_creator_01');
assert.ok(listCreatorSeed?.metadata?.manifest?.capabilities?.includes('reviewable_lead_rows'));
assert.ok(listCreatorSeed?.metadata?.manifest?.capabilities?.includes('import_ready_packet'));
assert.ok(listCreatorSeed?.metadata?.manifest?.capabilities?.includes('public_email_capture'));
assert.equal(listCreatorSeed?.metadata?.manifest?.metadata?.contact_capture_mode, 'public_contact_only');
assert.equal(listCreatorSeed?.metadata?.manifest?.metadata?.estimate_mode, '20_company_batches');
assert.equal(listCreatorSeed?.metadata?.manifest?.metadata?.default_company_count, 20);
assert.ok(Array.isArray(listCreatorSeed?.metadata?.manifest?.metadata?.package_estimates));
assert.ok(listCreatorSeed?.metadata?.manifest?.metadata?.package_estimates.some((item) => item.companies === 100 && item.batches === 5 && item.total_cost_basis === 320));
assert.ok(builtInAgentSource.includes('20-company batch estimate'));
assert.ok(builtInAgentSource.includes('public email or safe contact path'));
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
  prompt: 'Act as CMO and plan acquisition channels for https://aiagent-marketplace.net. ICP engineers, conversion signups, no budget.'
});
assert.equal(cmoPayload.report.summary, 'CMO Team Leader delivery');
assert.ok(cmoPayload.report.bullets.some((item) => item.includes('product-specific workflow')));
assert.ok(cmoPayload.files[0].content.includes('Answer first'));
assert.ok(cmoPayload.files[0].content.includes('aiagent-marketplace.net'));
assert.ok(cmoPayload.files[0].content.includes('Workflow definition'));
assert.ok(cmoPayload.files[0].content.includes('First execution packet'));
assert.ok(cmoPayload.files[0].content.includes('Leader approval queue'));
assert.ok(!cmoPayload.files[0].content.includes('## Output contract'));
assert.ok(!cmoPayload.files[0].content.includes('first lane: the one media lane'));
assert.equal(cmoPayload.files[0].execution_candidate, undefined, 'Plan-only CMO requests should not be promoted as execution packets');

const cmoActionPayload = sampleAgentPayload('cmo_leader', {
  prompt: 'CMOスタートで外部コネクターまで実行し、X投稿とディレクトリ掲載のアクションまで完走したい'
});
assert.equal(cmoActionPayload.files[0].content_type, 'report_bundle', 'Action-through-delivery CMO output should be an explicit execution candidate');
assert.equal(cmoActionPayload.files[0].execution_candidate, true);
assert.equal(cmoActionPayload.files[0].draft_defaults.nextStep, 'execution_order');
assert.equal(cmoActionPayload.files[0].draft_defaults.channel, 'x');
assert.equal(cmoActionPayload.report.execution_candidate.type, 'report_bundle');
assert.ok(cmoActionPayload.report.execution_candidate.reason);

const cmoWorkflowSpecialistInput = {
  prompt: 'Task: cmo_leader Goal: 集客したい。aiagent-marketplace.net、engineers、signups、I have x account, indiehackers account and reddit account. plan and do',
  output_language: 'ja',
  input: {
    _broker: {
      workflow: {
        primaryTask: 'cmo_leader',
        parentJobId: 'qa-cmo-workflow-parent',
        sequencePhase: 'research',
        forceWebSearch: true,
        webSearchRequiredReason: 'leader_research_layer'
      }
    }
  }
};
const cmoWorkflowResearchPayload = sampleAgentPayload('research', cmoWorkflowSpecialistInput);
assert.equal(cmoWorkflowResearchPayload.report.summary, '顧客獲得リサーチ納品');
assert.ok(cmoWorkflowResearchPayload.files[0].content.includes('顧客獲得リサーチ納品'));
assert.ok(cmoWorkflowResearchPayload.files[0].content.includes('調査からの判断'));
assert.ok(cmoWorkflowResearchPayload.files[0].content.includes('顧客・訴求仮説'));
assert.ok(cmoWorkflowResearchPayload.files[0].content.includes('aiagent-marketplace.net'));
assert.ok(!/\bCAIt\b|Work Chat|compare-ai-agents-for-engineers/i.test(cmoWorkflowResearchPayload.files[0].content));
assert.ok(!/\bTBD\b|Decision framing|Output contract|Professional preflight|専門家の事前確認|Task:|the product|the stated ICP|the primary conversion event|budget not confirmed/i.test(cmoWorkflowResearchPayload.files[0].content));

const cmoWorkflowTeardownPayload = sampleAgentPayload('teardown', cmoWorkflowSpecialistInput);
assert.equal(cmoWorkflowTeardownPayload.report.summary, '競合ティアダウン納品');
assert.ok(cmoWorkflowTeardownPayload.files[0].content.includes('競合ティアダウン納品'));
assert.ok(cmoWorkflowTeardownPayload.files[0].content.includes('調査からの判断'));
assert.ok(cmoWorkflowTeardownPayload.files[0].content.includes('顧客・訴求仮説'));
assert.ok(!/\bTBD\b|\[[^\]\n]{2,80}\]|Decision framing|Output contract|Professional preflight|専門家の事前確認|the product|the stated ICP|budget not confirmed|未接続/i.test(cmoWorkflowTeardownPayload.files[0].content));

const cmoWorkflowDataPayload = sampleAgentPayload('data_analysis', cmoWorkflowSpecialistInput);
assert.equal(cmoWorkflowDataPayload.report.summary, '計測・データ分析納品');
assert.ok(cmoWorkflowDataPayload.files[0].content.includes('調査からの判断'));
assert.ok(cmoWorkflowDataPayload.files[0].content.includes('顧客・訴求仮説'));
assert.ok(!/\bTBD\b|Decision framing|Output contract|Professional preflight|専門家の事前確認/i.test(cmoWorkflowDataPayload.files[0].content));

const cmoWorkflowListCreatorInput = {
  ...cmoWorkflowSpecialistInput,
  input: {
    _broker: {
      workflow: {
        primaryTask: 'cmo_leader',
        parentJobId: 'qa-cmo-workflow-parent',
        sequencePhase: 'preparation',
        leaderHandoff: {
          priorRuns: [
            {
              taskType: 'research',
              summary: 'Developer tools and AI agent directories are the first public-source pool.',
              webSources: [
                {
                  title: 'AlternativeTo AI agent directory',
                  url: 'https://alternativeto.net/category/ai-tools/',
                  snippet: 'Public directory of AI tools and alternatives.'
                },
                {
                  title: 'GitHub Marketplace AI apps',
                  url: 'https://github.com/marketplace?category=ai',
                  snippet: 'Developer-facing marketplace category for AI apps.'
                }
              ]
            }
          ]
        }
      }
    }
  }
};
const cmoWorkflowListCreatorPayload = sampleAgentPayload('list_creator', cmoWorkflowListCreatorInput);
assert.equal(cmoWorkflowListCreatorPayload.report.summary, 'リスト作成実行納品');
assert.ok(cmoWorkflowListCreatorPayload.files[0].content.includes('List Creatorの位置づけ'));
assert.ok(cmoWorkflowListCreatorPayload.files[0].content.includes('Reviewable lead rows'));
assert.ok(cmoWorkflowListCreatorPayload.files[0].content.includes('AlternativeTo AI agent directory'));
assert.ok(cmoWorkflowListCreatorPayload.files[0].content.includes('contact_source_url'));
assert.ok(cmoWorkflowListCreatorPayload.files[0].content.includes('Import-ready field map'));
assert.ok(!/7日実行スプリント|投稿ドラフト|検索\/受け渡しソースは未添付です/i.test(cmoWorkflowListCreatorPayload.files[0].content));

const cmoWorkflowEnglishSpecialistInput = {
  prompt: 'Task: cmo_leader Goal: customer acquisition for aiagent-marketplace.net. ICP engineers, conversion signups, no ads, do action.',
  output_language: 'English',
  input: {
    _broker: {
      workflow: {
        primaryTask: 'cmo_leader',
        parentJobId: 'qa-cmo-workflow-parent-en',
        sequencePhase: 'research',
        forceWebSearch: true,
        webSearchRequiredReason: 'leader_research_layer'
      }
    }
  }
};
const cmoWorkflowEnglishResearchPayload = sampleAgentPayload('research', cmoWorkflowEnglishSpecialistInput);
assert.equal(cmoWorkflowEnglishResearchPayload.report.summary, 'CMO acquisition research delivery');
assert.ok(cmoWorkflowEnglishResearchPayload.files[0].content.includes('CMO acquisition research delivery'));
assert.ok(cmoWorkflowEnglishResearchPayload.files[0].content.includes('Acquisition research readout'));
assert.ok(cmoWorkflowEnglishResearchPayload.files[0].content.includes('Customer and positioning hypothesis'));
assert.ok(cmoWorkflowEnglishResearchPayload.files[0].content.includes('aiagent-marketplace.net'));
assert.ok(!/\bCAIt\b|Work Chat|compare-ai-agents-for-engineers/i.test(cmoWorkflowEnglishResearchPayload.files[0].content));
assert.ok(!/\bTBD\b|\[[^\]\n]{2,80}\]|Decision framing|Decision or question framing|Option A|Task:|Goal:/i.test(cmoWorkflowEnglishResearchPayload.files[0].content));
const cmoWorkflowEnglishTeardownPayload = sampleAgentPayload('teardown', cmoWorkflowEnglishSpecialistInput);
assert.equal(cmoWorkflowEnglishTeardownPayload.report.summary, 'CMO competitor teardown delivery');
assert.ok(cmoWorkflowEnglishTeardownPayload.files[0].content.includes('CMO competitor teardown delivery'));
assert.ok(cmoWorkflowEnglishTeardownPayload.files[0].content.includes('Competitor and alternative readout'));
assert.ok(!/\bTBD\b|\[[^\]\n]{2,80}\]|verify current page|the product being compared/i.test(cmoWorkflowEnglishTeardownPayload.files[0].content));

const cmoWorkflowEnglishRoleInput = (sequencePhase, priorRuns = []) => ({
  ...cmoWorkflowEnglishSpecialistInput,
  input: {
    _broker: {
      workflow: {
        primaryTask: 'cmo_leader',
        parentJobId: `qa-cmo-workflow-role-${sequencePhase}`,
        sequencePhase,
        leaderHandoff: {
          leaderTaskType: 'cmo_leader',
          priorRuns
        }
      }
    }
  }
});
const cmoEnglishPriorRuns = [
  {
    taskType: 'research',
    status: 'completed',
    summary: 'Engineers need proof and a clear signup path before channel expansion.',
    webSources: [{ title: 'Competitor source', url: 'https://example.com/competitor', snippet: 'workflow marketplace proof' }]
  }
];
const cmoWorkflowEnglishMediaPayload = sampleAgentPayload('media_planner', cmoWorkflowEnglishRoleInput('planning', cmoEnglishPriorRuns));
const cmoWorkflowEnglishMediaContent = cmoWorkflowEnglishMediaPayload.files[0].content;
assert.ok(/Media-fit analysis|Priority media queue|Channels to avoid/i.test(cmoWorkflowEnglishMediaContent));
assert.ok(!/Execution artifact[\s\S]{0,80}\| Surface \| Draft \|/i.test(cmoWorkflowEnglishMediaContent));

const cmoWorkflowEnglishLandingPayload = sampleAgentPayload('landing', cmoWorkflowEnglishRoleInput('preparation', cmoEnglishPriorRuns));
const cmoWorkflowEnglishLandingContent = cmoWorkflowEnglishLandingPayload.files[0].content;
assert.ok(/Destination page packet|Page structure to ship first|Proof module/i.test(cmoWorkflowEnglishLandingContent));
assert.ok(!/Artifact \| Page copy, social copy, UTM, measurement events/i.test(cmoWorkflowEnglishLandingContent));

const cmoWorkflowEnglishDirectoryPayload = sampleAgentPayload('directory_submission', cmoWorkflowEnglishRoleInput('action', cmoEnglishPriorRuns));
const cmoWorkflowEnglishDirectoryContent = cmoWorkflowEnglishDirectoryPayload.files[0].content;
assert.ok(/Directory submission queue|Reusable listing copy packet|Per-site field map|Manual submission checklist/i.test(cmoWorkflowEnglishDirectoryContent));
assert.ok(!/H1 \| Help engineers and developers choose the next action/i.test(cmoWorkflowEnglishDirectoryContent));

const cmoWorkflowEnglishXPayload = sampleAgentPayload('x_post', cmoWorkflowEnglishRoleInput('action', cmoEnglishPriorRuns));
const cmoWorkflowEnglishXContent = cmoWorkflowEnglishXPayload.files[0].content;
assert.ok(/Exact X post packet|Reply hooks|utm_source=x|exact_copy/i.test(cmoWorkflowEnglishXContent));
assert.ok(!/Artifact \| Page copy, social copy, UTM, measurement events/i.test(cmoWorkflowEnglishXContent));

const cmoWorkflowEnglishRedditPayload = sampleAgentPayload('reddit', cmoWorkflowEnglishRoleInput('action', cmoEnglishPriorRuns));
const cmoWorkflowEnglishRedditContent = cmoWorkflowEnglishRedditPayload.files[0].content;
assert.ok(/Reddit discussion packet|Subreddit fit checklist|Draft title options|Draft body/i.test(cmoWorkflowEnglishRedditContent));
assert.ok(!/Exact X post packet|utm_source=x/i.test(cmoWorkflowEnglishRedditContent));
assert.notEqual(cmoWorkflowEnglishMediaContent, cmoWorkflowEnglishDirectoryContent, 'CMO media planner and directory submission must not collapse to the same fallback artifact.');
assert.notEqual(cmoWorkflowEnglishXContent, cmoWorkflowEnglishRedditContent, 'CMO social action agents must produce channel-specific fallback artifacts.');

const originalBuiltinQaFetch = globalThis.fetch;
let genericCmoOpenAiCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url === 'https://api.openai.com/v1/responses') {
    genericCmoOpenAiCalls += 1;
    return new Response(JSON.stringify({
      output: [
        {
          type: 'web_search_call',
          action: {
            type: 'search',
            query: 'ai agent marketplace customer acquisition',
            sources: [
              { url: 'https://example.com/search-source', title: 'Search source' }
            ]
          }
        }
      ],
      output_text: JSON.stringify({
        summary: 'Research summary ready',
        report_summary: 'Research delivery',
        bullets: ['Generic template output.'],
        next_action: 'Name the single highest-value follow-up check.',
        file_markdown: [
          '# research delivery',
          '',
          'Task: cmo_leader',
          'Goal: customer acquisition',
          '',
          '## Answer first',
          'Start with the shortest answer or recommendation that is justified right now.',
          '',
          '## Decision or question framing',
          '- Decision to support: the one question this research must answer',
          '',
          '| Option | Best for | Main upside |',
          '| --- | --- | --- |',
          '| Option A | one clear situation | strongest upside |',
          '',
          '## Next check',
          'Name the single highest-value follow-up check.'
        ].join('\n'),
        confidence: 0.4,
        authority_request: null
      })
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return originalBuiltinQaFetch(input, init);
};
try {
  const openAiGenericResearchFallback = await runBuiltInAgent('research', cmoWorkflowEnglishSpecialistInput, {
    OPENAI_API_KEY: 'sk-test-cmo-quality',
    BUILTIN_OPENAI_WORKFLOW_TIMEOUT_MS: '5000'
  });
  assert.equal(genericCmoOpenAiCalls, 1, 'CMO workflow QA should exercise the OpenAI draft path');
  assert.equal(openAiGenericResearchFallback.runtime.provider, 'built_in');
  assert.equal(openAiGenericResearchFallback.runtime.workflow, 'cmo_workflow_quality_gate');
  assert.equal(openAiGenericResearchFallback.runtime.fallback_reason, 'generic_template_left_in_cmo_workflow_delivery');
  assert.ok(openAiGenericResearchFallback.files[0].content.includes('CMO acquisition research delivery'));
  assert.ok(openAiGenericResearchFallback.files[0].content.includes('Acquisition research readout'));
  assert.ok(!/Option A|Decision or question framing|Name the single highest-value follow-up check|Task:|Goal:/i.test(openAiGenericResearchFallback.files[0].content));
} finally {
  globalThis.fetch = originalBuiltinQaFetch;
}

let missingWorkflowSearchSourceCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url === 'https://api.openai.com/v1/responses') {
    missingWorkflowSearchSourceCalls += 1;
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        summary: 'Research summary ready',
        report_summary: 'Research delivery',
        bullets: ['No search sources were returned.'],
        next_action: 'Connect search and rerun.',
        file_markdown: '# research delivery\n\nNo web citations were returned.',
        confidence: 0.2,
        authority_request: null
      })
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return originalBuiltinQaFetch(input, init);
};
try {
  const blockedWorkflowSearchPayload = await runBuiltInAgent('research', cmoWorkflowEnglishSpecialistInput, {
    OPENAI_API_KEY: 'sk-test-search-required',
    BUILTIN_OPENAI_WORKFLOW_TIMEOUT_MS: '5000'
  });
  assert.equal(missingWorkflowSearchSourceCalls, 1, 'search-required workflow should attempt the OpenAI draft path once');
  assert.equal(blockedWorkflowSearchPayload.status, 'blocked');
  assert.equal(blockedWorkflowSearchPayload.report.authority_request.missing_connectors[0], 'search');
  assert.equal(blockedWorkflowSearchPayload.report.authority_request.source, 'search_connector_required');
  assert.equal(blockedWorkflowSearchPayload.files.length, 0);
} finally {
  globalThis.fetch = originalBuiltinQaFetch;
}

let braveOnlyCalls = 0;
let cmoBraveQuery = '';
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('https://api.search.brave.com/res/v1/web/search?')) {
    braveOnlyCalls += 1;
    cmoBraveQuery = new URL(url).searchParams.get('q') || '';
    return new Response(JSON.stringify({
      web: {
        results: [
          {
            url: 'https://example.com/brave-source',
            title: 'Brave source',
            description: 'Current market context from Brave.'
          }
        ]
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return originalBuiltinQaFetch(input, init);
};
try {
  const braveOnlyPayload = await runBuiltInAgent('research', {
    prompt: 'Compare current AI agent marketplace alternatives.'
  }, {
    BRAVE_SEARCH_API_KEY: 'brave-test-key'
  });
  assert.equal(braveOnlyCalls, 1, 'Brave-only built-in search should issue one Brave search request');
  assert.equal(braveOnlyPayload.runtime.provider, 'built_in');
  assert.equal(braveOnlyPayload.runtime.search_provider, 'brave');
  assert.equal(braveOnlyPayload.report.web_sources[0].url, 'https://example.com/brave-source');
  assert.ok(braveOnlyPayload.files[0].content.includes('## Web sources used'));
  assert.ok(braveOnlyPayload.files[0].content.includes('https://example.com/brave-source'));
  const cmoBravePayload = await runBuiltInAgent('research', cmoWorkflowEnglishSpecialistInput, {
    BRAVE_SEARCH_API_KEY: 'brave-test-key'
  });
  assert.ok(cmoBraveQuery.includes('aiagent-marketplace.net'), 'CMO Brave query should keep the target product/domain, not only generic acquisition terms');
  assert.ok(cmoBraveQuery.includes('AI agent marketplace'), 'CMO Brave query should include agent-marketplace search intent');
  assert.ok(cmoBravePayload.files[0].content.includes('## Source-backed evidence used'), 'CMO research should integrate Brave sources into the body, not only append raw URLs');
  assert.ok(cmoBravePayload.files[0].content.includes('https://example.com/brave-source'));
  assert.ok(!/No search or handoff sources were attached|検索\/受け渡しソースは未添付/.test(cmoBravePayload.files[0].content), 'CMO research with Brave URLs must not also claim sources are missing');
  await runBuiltInAgent('research', {
    ...cmoWorkflowEnglishSpecialistInput,
    prompt: 'Task: cmo_leader Goal: grow https://aiagent-marketplace.net CAIt for engineers. Need signups with no ads through X and SEO, media proposal, and actual post content.'
  }, {
    BRAVE_SEARCH_API_KEY: 'brave-test-key'
  });
  const cmoDynamicQuery = cmoBraveQuery.toLowerCase();
  assert.ok(cmoDynamicQuery.includes('engineers'), 'CMO Brave query should derive ICP terms from the user request');
  assert.ok(cmoDynamicQuery.includes('signup'), 'CMO Brave query should derive conversion terms from the user request');
  assert.ok(cmoDynamicQuery.includes('seo'), 'CMO Brave query should derive requested channel terms from the user request');
  assert.ok(cmoDynamicQuery.includes('x twitter'), 'CMO Brave query should derive X/Twitter channel terms from the user request');
  assert.ok(cmoDynamicQuery.includes('no paid ads'), 'CMO Brave query should derive budget constraints from the user request');
  await runBuiltInAgent('pricing', {
    prompt: 'Find pricing competitors for https://example-crm.io targeting sales teams. Goal: free trial signups via LinkedIn and SEO with no paid ads.'
  }, {
    BRAVE_SEARCH_API_KEY: 'brave-test-key'
  });
  const genericAgentQuery = cmoBraveQuery.toLowerCase();
  assert.ok(genericAgentQuery.includes('example-crm.io'), 'Generic built-in Brave query should keep the user product/domain');
  assert.ok(genericAgentQuery.includes('sales teams'), 'Generic built-in Brave query should derive the audience from the user request');
  assert.ok(genericAgentQuery.includes('signup') || genericAgentQuery.includes('trial'), 'Generic built-in Brave query should derive the requested conversion');
  assert.ok(genericAgentQuery.includes('linkedin'), 'Generic built-in Brave query should derive requested channels');
  assert.ok(genericAgentQuery.includes('seo'), 'Generic built-in Brave query should derive requested SEO channel');
  assert.ok(genericAgentQuery.includes('no paid ads'), 'Generic built-in Brave query should derive constraints');
  assert.ok(!genericAgentQuery.includes('aiagent-marketplace.net'), 'Generic built-in Brave query must not carry CAIt-specific terms for unrelated products');
} finally {
  globalThis.fetch = originalBuiltinQaFetch;
}

let bravePreferredOpenAiCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('https://api.search.brave.com/res/v1/web/search?')) {
    return new Response(JSON.stringify({
      web: {
        results: [
          {
            url: 'https://example.com/brave-competitor',
            title: 'Brave competitor source',
            description: 'Competitor and market evidence.'
          }
        ]
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'https://api.openai.com/v1/responses') {
    bravePreferredOpenAiCalls += 1;
    const request = JSON.parse(String(init?.body || '{}'));
    assert.ok(!('tools' in request), 'Brave-grounded OpenAI requests should not invoke OpenAI web_search when Brave is preferred');
    const payload = JSON.parse(String(request.input?.[1]?.content || '{}'));
    assert.equal(payload.request.web_sources[0].url, 'https://example.com/brave-competitor');
    assert.equal(payload.web_sources[0].url, 'https://example.com/brave-competitor');
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        summary: 'Research summary ready',
        report_summary: 'Research delivery',
        bullets: ['Used Brave-grounded sources.'],
        next_action: 'Proceed with the source-backed recommendation.',
        file_markdown: '# Research delivery\n\n## Answer first\nUse the Brave-grounded sources first.',
        confidence: 'medium',
        authority_request: null
      })
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return originalBuiltinQaFetch(input, init);
};
try {
  const bravePreferredPayload = await runBuiltInAgent('research', {
    prompt: 'Compare current AI agent marketplace alternatives.',
    input: {
      _broker: {
        workflow: {
          primaryTask: 'research_team_leader',
          sequencePhase: 'research',
          forceWebSearch: true,
          webSearchRequiredReason: 'leader_research_layer'
        }
      }
    }
  }, {
    OPENAI_API_KEY: 'sk-test-brave-openai',
    BRAVE_SEARCH_API_KEY: 'brave-test-key',
    BUILTIN_OPENAI_WORKFLOW_TIMEOUT_MS: '5000'
  });
  assert.equal(bravePreferredOpenAiCalls, 1, 'Workflow OpenAI path should run once with Brave-grounded sources');
  assert.equal(bravePreferredPayload.runtime.provider, 'openai');
  assert.equal(bravePreferredPayload.runtime.search_provider, 'brave');
  assert.equal(bravePreferredPayload.report.web_sources[0].url, 'https://example.com/brave-competitor');
  assert.ok(bravePreferredPayload.files[0].content.includes('https://example.com/brave-competitor'));
} finally {
  globalThis.fetch = originalBuiltinQaFetch;
}

const cmoWorkflowXPayload = sampleAgentPayload('x_post', {
  ...cmoWorkflowSpecialistInput,
  input: {
    _broker: {
      workflow: {
        primaryTask: 'cmo_leader',
        parentJobId: 'qa-cmo-workflow-parent',
        sequencePhase: 'action',
        leaderHandoff: {
          leaderTaskType: 'cmo_leader',
          priorRuns: [
            { taskType: 'research', status: 'completed', summary: '比較LPを先に作る' }
          ]
        }
      }
    }
  }
});
assert.equal(cmoWorkflowXPayload.report.summary, 'X投稿実行納品');
assert.ok(cmoWorkflowXPayload.files[0].content.includes('投稿ドラフト'));
assert.ok(cmoWorkflowXPayload.files[0].content.includes('utm_source=x'));
assert.ok(cmoWorkflowXPayload.files[0].content.includes('## 受け渡し情報の利用'), 'CMO action specialists should show leader/research handoff evidence in the body');
assert.ok(cmoWorkflowXPayload.files[0].content.includes('比較LPを先に作る'), 'CMO action specialist output should carry the prior research decision forward');
assert.ok(cmoWorkflowXPayload.files[0].content.includes('承認packet'));
assert.ok(/OAuth接続済み|OAuth-connected|@handle/i.test(cmoWorkflowXPayload.files[0].content), 'X action packet must require OAuth account handle approval');
assert.ok(cmoWorkflowXPayload.files[0].content.includes('exact_copy'));
assert.equal(cmoWorkflowXPayload.files[0].content_type, 'social_post_pack');
assert.equal(cmoWorkflowXPayload.files[0].execution_candidate, true);
assert.equal(cmoWorkflowXPayload.files[0].draft_defaults.channel, 'x');
assert.equal(cmoWorkflowXPayload.files[0].draft_defaults.actionMode, 'post_ready');
assert.ok(cmoWorkflowXPayload.files[0].draft_defaults.postText.length <= 280);
assert.ok(cmoWorkflowXPayload.files[0].draft_defaults.postText.includes('aiagent-marketplace.net'));
assert.equal(
  cmoWorkflowXPayload.report.execution_candidate.draft_defaults.postText,
  cmoWorkflowXPayload.files[0].draft_defaults.postText
);
assert.equal(
  extractSocialPostTextFromDeliveryContent(cmoWorkflowXPayload.files[0].content, { maxLength: 280 }),
  cmoWorkflowXPayload.files[0].draft_defaults.postText
);
assert.ok(!/\bTBD\b|Output contract|Professional preflight|専門家の事前確認/i.test(cmoWorkflowXPayload.files[0].content));

const mergedXExecutionOutput = buildAgentTeamDeliveryOutput({
  id: 'qa-cmo-parent',
  originalPrompt: 'CMO execution workflow',
  workflow: { childRuns: [{ id: 'qa-cmo-leader' }, { id: 'qa-x-post' }] }
}, [
  {
    id: 'qa-cmo-leader',
    taskType: 'cmo_leader',
    workflowTask: 'cmo_leader',
    status: 'completed',
    completedAt: '2026-04-29T00:00:00.000Z',
    input: { _broker: { workflow: { sequencePhase: 'checkpoint' } } },
    output: {
      summary: 'Leader selected X execution.',
      report: { summary: 'Leader selected X execution.', nextAction: 'Execute the X packet.' },
      files: [{ name: 'leader.md', type: 'text/markdown', content: '# leader\n\nExecution packet: X first.' }]
    }
  },
  {
    id: 'qa-x-post',
    taskType: 'x_post',
    workflowTask: 'x_post',
    status: 'completed',
    completedAt: '2026-04-29T00:01:00.000Z',
    output: {
      summary: cmoWorkflowXPayload.summary,
      report: cmoWorkflowXPayload.report,
      files: cmoWorkflowXPayload.files
    }
  }
]);
const mergedXCandidate = mergedXExecutionOutput.files.find((file) => file.content_type === 'social_post_pack');
assert.equal(mergedXCandidate?.draft_defaults?.postText, cmoWorkflowXPayload.files[0].draft_defaults.postText);

const cmoBareDomainPayload = sampleAgentPayload('research', {
  prompt: 'Task: cmo_leader Goal: aiagent-marketplace.netの会員登録を増やす。plan and do actions.',
  output_language: 'ja',
  input: {
    _broker: {
      workflow: {
        primaryTask: 'cmo_leader',
        parentJobId: 'qa-cmo-bare-domain',
        sequencePhase: 'research'
      }
    }
  }
});
assert.ok(cmoBareDomainPayload.files[0].content.includes('aiagent-marketplace.net'));
assert.ok(!/\bCAIt\b|Work Chat|compare-ai-agents-for-engineers/i.test(cmoBareDomainPayload.files[0].content));
assert.ok(/account signups|会員登録/.test(cmoBareDomainPayload.files[0].content));
assert.ok(!/the product|the stated ICP|the primary conversion event|budget not confirmed|最終納品ではありません/i.test(cmoBareDomainPayload.files[0].content));

const genericCmoLeaderPayload = sampleAgentPayload('cmo_leader', {
  prompt: 'CMO leader: grow demo inquiries for https://example-crm.io. Target sales teams. Use LinkedIn and SEO with no paid ads. Plan and do actions.'
});
const genericCmoLeaderContent = genericCmoLeaderPayload.files[0].content;
assert.ok(genericCmoLeaderContent.includes('example-crm.io'));
assert.ok(/sales teams/i.test(genericCmoLeaderContent));
assert.ok(/qualified leads or inquiries/i.test(genericCmoLeaderContent));
assert.ok(/LinkedIn|SEO/i.test(genericCmoLeaderContent));
assert.ok(/research[\s\S]+planning[\s\S]+preparation[\s\S]+approval[\s\S]+action/i.test(genericCmoLeaderContent));
assert.ok(!/\bCAIt\b|aiagent-marketplace|Work Chat|AI agent marketplace for engineers/i.test(genericCmoLeaderContent));

const genericCmoResearchPayload = sampleAgentPayload('research', {
  prompt: 'Task: cmo_leader Goal: grow demo inquiries for https://example-crm.io. Target sales teams. Use LinkedIn and SEO with no paid ads. Plan and do actions.',
  input: {
    _broker: {
      workflow: {
        primaryTask: 'cmo_leader',
        parentJobId: 'qa-cmo-generic-research',
        sequencePhase: 'research'
      }
    }
  }
});
const genericCmoResearchContent = genericCmoResearchPayload.files[0].content;
assert.ok(genericCmoResearchContent.includes('example-crm.io'));
assert.ok(/sales teams/i.test(genericCmoResearchContent));
assert.ok(/qualified leads or inquiries/i.test(genericCmoResearchContent));
assert.ok(/Acquisition research readout|Customer and positioning hypothesis|Handoff to planning/i.test(genericCmoResearchContent));
assert.ok(!/Evidence and handoff contract|This specialist is producing/i.test(genericCmoResearchContent));
assert.ok(!/\bCAIt\b|aiagent-marketplace|Work Chat|AI agent marketplace for engineers/i.test(genericCmoResearchContent));

const cmoPlatformContaminationPayload = sampleAgentPayload('research', {
  prompt: 'Task: cmo_leader Goal: grow inquiries for https://biz.hrbase.jp. Target HR managers. Use SEO and X. Plan and do actions.',
  input: {
    _broker: {
      workflow: {
        primaryTask: 'cmo_leader',
        parentJobId: 'qa-cmo-no-platform-contamination',
        sequencePhase: 'research',
        leaderHandoff: {
          summary: 'CAIt platform context should not become the customer product.',
          briefFile: {
            name: 'old-platform-brief.md',
            content: 'CAIt Work Chat and aiagent-marketplace.net are platform examples, not this customer product.'
          }
        }
      }
    }
  }
});
const cmoPlatformContaminationContent = cmoPlatformContaminationPayload.files[0].content;
assert.ok(cmoPlatformContaminationContent.includes('biz.hrbase.jp'));
assert.ok(!/\bCAIt\b|aiagent-marketplace|Work Chat|compare-ai-agents-for-engineers/i.test(cmoPlatformContaminationContent));

const cmoFinalSummaryPayload = sampleAgentPayload('cmo_leader', {
  prompt: 'CMO leader: continue customer acquisition for https://aiagent-marketplace.net through execution.',
  input: {
    _broker: {
      workflow: {
        sequencePhase: 'final_summary',
        leaderHandoff: {
          priorRuns: [
            {
              taskType: 'research',
              status: 'completed',
              summary: 'Research found comparison-intent SEO as the first acquisition lane.',
              bullets: ['Comparison queries are closer to signup intent.'],
              files: [{ name: 'research-delivery.md', content: '# Research\n\nComparison SEO first.' }]
            },
            {
              taskType: 'x_post',
              status: 'completed',
              summary: 'Prepared an approval-ready X post packet.',
              bullets: ['Exact post ready.'],
              nextAction: 'Connect X, approve, and publish the post.',
              files: [{ name: 'x-post-pack.md', content: '# X post pack\n\nPost text: Discover and compare AI agents for engineers.' }]
            }
          ]
        }
      }
    }
  }
});
assert.equal(cmoFinalSummaryPayload.report.summary, 'CMO execution delivery');
assert.ok(cmoFinalSummaryPayload.files[0].content.includes('cmo team leader execution delivery'));
assert.ok(cmoFinalSummaryPayload.files[0].content.includes('Execution status'));
assert.ok(cmoFinalSummaryPayload.files[0].content.includes('x_post'));
assert.ok(cmoFinalSummaryPayload.files[0].content.includes('Discover and compare AI agents for engineers'));
assert.ok(cmoFinalSummaryPayload.files[0].content.includes('supporting-specialist-deliverables.md'));
assert.ok(!cmoFinalSummaryPayload.files[0].content.includes('Specialist outputs are not attached'));
assert.ok(!/\bTBD\b|not attached|not connected|最終納品ではありません/i.test(cmoFinalSummaryPayload.files[0].content));
assert.equal(cmoFinalSummaryPayload.files[0].content_type, 'report_bundle');
assert.equal(cmoFinalSummaryPayload.files[0].execution_candidate, true);

const ctoPayload = sampleAgentPayload('cto_leader', {
  prompt: 'Act as CTO and review architecture, security, and rollout.'
});
assert.equal(ctoPayload.report.summary, 'CTO Team Leader delivery');
assert.ok(ctoPayload.report.bullets.some((item) => item.includes('execution lane') || item.includes('実行レーン')));
assert.ok(ctoPayload.files[0].content.includes('System snapshot and constraints'));
assert.ok(ctoPayload.files[0].content.includes('Tradeoff table'));
assert.ok(ctoPayload.files[0].content.includes('Chosen technical path'));
assert.ok(ctoPayload.files[0].content.includes('Specialist dispatch packets'));
assert.ok(ctoPayload.files[0].content.includes('Validation gate'));
assert.ok(ctoPayload.files[0].content.includes('Rollout packet'));
assert.ok(ctoPayload.files[0].content.includes('Monitoring and rollback'));
assert.ok(ctoPayload.files[0].content.includes('Open blockers'));
assert.ok(ctoPayload.runtime.delivery_policy.specialist_method.some((step) => step.includes('dispatch packets') || step.includes('dispatch packet')));
assert.ok(ctoPayload.runtime.delivery_policy.scope_boundaries.some((step) => step.includes('broad rewrite')));

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
const extractedXPost = extractSocialPostTextFromDeliveryContent(xPayload.files[0].content, { maxLength: 280 });
assert.ok(extractedXPost.includes('AI agent marketplace'));
assert.ok(!/\bCAIt\b|aiagent-marketplace\.net|Work Chat|chat-first|dashboard-first|Publish your AI agent/i.test(xPayload.files[0].content));

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
  prompt: 'Build a reviewable lead list of 50 companies for Japanese B2B SaaS teams that look under-instrumented and may need lifecycle automation help.'
});
assert.equal(listCreatorPayload.report.summary, 'List Creator Agent delivery');
assert.equal(listCreatorPayload.usage.total_cost_basis, 192);
assert.ok(listCreatorPayload.files[0].content.includes('Reviewable lead rows'));
assert.ok(listCreatorPayload.files[0].content.includes('Estimate and batch plan'));
assert.ok(listCreatorPayload.files[0].content.includes('requested_companies: 50'));
assert.ok(listCreatorPayload.files[0].content.includes('50 | 3 x 20'));
assert.ok(listCreatorPayload.files[0].content.includes('Public contact capture rules'));
assert.ok(listCreatorPayload.files[0].content.includes('public_email_or_contact_path'));
assert.ok(listCreatorPayload.files[0].content.includes('contact_source_url'));
assert.ok(listCreatorPayload.files[0].content.includes('Import-ready field map'));
assert.ok(listCreatorPayload.files[0].content.includes('next_specialist: cold_email'));
const listCreatorOrderEstimate = listCreatorUsageEstimateForOrder({
  task_type: 'list_creator',
  prompt: '公開メアド付きで100社の営業先リストを作る'
});
assert.equal(listCreatorOrderEstimate.requestedCount, 100);
assert.equal(listCreatorOrderEstimate.batchCount, 5);
assert.equal(listCreatorOrderEstimate.usage.total_cost_basis, 320);

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
assert.ok(seoGapPayload.files[0].content.includes('What happens after the conversion action'));
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
assert.equal(cmoLeaderSeed.metadata.manifest.metadata.leader_control_contract.role, 'agent_selection_handoff_review_synthesis');
assert.ok(cmoLeaderSeed.metadata.manifest.metadata.leader_control_contract.controlLoop.includes('synthesize'));
assert.equal(builtInExecutionPolicyForKind('cmo_leader').leader_contract.role, 'agent_selection_handoff_review_synthesis');
assert.equal(builtInExecutionPolicyForKind('cmo_leader').trust_profile.version, 'agent-trust/v1');
assert.equal(builtInTrustProfileForKind('x_post').level, 'approval_gated');
assert.equal(builtInTrustProfileForKind('research').level, 'source_bound');
assert.equal(builtInExecutionPolicyForKind('x_post').leader_contract, undefined);
assert.equal(builtInAgentHealthPayload('cmo_leader', {}).leader_contract.version, 'leader-control/v1');
assert.equal(builtInAgentHealthPayload('cmo_leader', {}).trust_profile.version, 'agent-trust/v1');
assert.equal(builtInAgentHealthPayload('x_post', {}).leader_contract, null);

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
assert.equal(coldOutboundSeed.metadata.manifest.metadata.secondary_upstream_specialist, 'writer');
assert.ok(coldOutboundSeed.metadata.manifest.capabilities.includes('reviewed_lead_queue'));
assert.ok(coldOutboundSeed.metadata.manifest.capabilities.includes('conversion_tracking'));

const xLinks = agentLinksFromRecord(xSeed, { catalog: DEFAULT_AGENT_SEEDS });
assert.equal(xLinks.layer, 'execution');
assert.equal(xLinks.role, 'x_publish_executor');
assert.ok(xLinks.upstream.task_types.includes('writing'));
assert.ok(xLinks.upstream.resolved.some((item) => item.id === 'agent_writer_01'));

const customXAgentLinks = agentLinksFromRecord({
  id: 'custom_x_agent',
  name: 'Custom X Publisher',
  description: 'Publishes approved X posts',
  taskTypes: ['x_post'],
  metadata: {
    tags: ['social', 'x'],
    manifest: {
      metadata: {
        tags: ['social', 'x']
      }
    }
  }
}, { catalog: DEFAULT_AGENT_SEEDS });
assert.ok(customXAgentLinks.upstream.task_types.includes('writing'));
assert.ok(customXAgentLinks.upstream.resolved.some((item) => item.id === 'agent_writer_01'));

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
assert.ok(dataAnalysisPayload.files[0].content.includes('conversion_completed'));
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
const xSequence = inferTaskSequence('x_post', 'Xで告知投稿を作って承認後に投稿したい', { maxTasks: 4 });
assert.ok(xSequence.includes('writing'));
assert.ok(xSequence.includes('x_post'));
assert.ok(xSequence.indexOf('writing') < xSequence.indexOf('x_post'));
const launchSequence = inferTaskSequence('cmo_leader', '1告知でX Reddit Indie Hackers Instagramまでまとめて作って投稿準備したい', { maxTasks: 14 });
assert.ok(launchSequence.includes('writing'));
assert.ok(launchSequence.includes('x_post'));
assert.ok(launchSequence.indexOf('writing') < launchSequence.indexOf('x_post'));
assert.ok(inferTaskSequence('cmo_leader', 'CMOとしてホームページを見て最適な掲載媒体とGBPまで決めて', { maxTasks: 8 }).includes('media_planner'));
assert.ok(inferTaskSequence('cmo_leader', 'CMOとしてホームページを見て最適な掲載媒体とGBPまで決めて', { maxTasks: 8 }).includes('research'));
assert.ok(inferTaskSequence('cmo_leader', 'CMOとしてホームページを見て最適な掲載媒体とGBPまで決めて', { maxTasks: 8 }).includes('citation_ops'));
assert.equal(inferTaskType('', '無料掲載できる媒体をリスト化して一気に掲載したい'), 'directory_submission');
assert.equal(inferTaskType('', '広告費なしでWeb周りの無料施策を全部やってほしい'), 'cmo_leader');
assert.equal(inferTaskType('', '1告知でX Reddit Indie Hackers Instagramまでまとめて作りたい'), 'cmo_leader');
assert.equal(inferTaskType('', 'CTOとしてアーキテクチャを見て'), 'cto_leader');
assert.equal(inferTaskType('', 'CFOとしてユニットエコノミクスを確認して'), 'cfo_leader');
assert.equal(inferTaskType('', '法務部長として規約リスクを見て'), 'legal_leader');
assert.equal(inferTaskType('', '社長秘書としてメール返信と日程調整をして'), 'secretary_leader');
assert.equal(inferTaskType('', 'Zoomで会議設定と日程調整をしてください'), 'schedule_coordination');
assert.equal(inferTaskType('', 'メール返信案を作って承認後に送れる形にして'), 'reply_draft');
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
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'EXECUTIVE SECRETARY LEADER'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'INBOX TRIAGE AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'REPLY DRAFT AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'SCHEDULE COORDINATION AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'FOLLOW-UP AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'MEETING PREP AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'MEETING NOTES AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'X OPS CONNECTOR AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'EMAIL OPS CONNECTOR AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'COLD EMAIL AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'REDDIT LAUNCH AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'INDIE HACKERS LAUNCH AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'INSTAGRAM LAUNCH AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.some((agent) => agent.name === 'DATA ANALYSIS AGENT'));
assert.ok(DEFAULT_AGENT_SEEDS.length >= 30);

const secretarySequence = inferTaskSequence('secretary_leader', '社長秘書としてメール返信とZoomの日程調整を承認制で進めて', { maxTasks: 7 });
assert.equal(secretarySequence[0], 'secretary_leader');
assert.ok(secretarySequence.includes('inbox_triage'));
assert.ok(secretarySequence.includes('reply_draft'));
assert.ok(secretarySequence.includes('schedule_coordination'));
assert.ok(secretarySequence.indexOf('inbox_triage') < secretarySequence.indexOf('reply_draft'));
assert.ok(secretarySequence.indexOf('inbox_triage') < secretarySequence.indexOf('schedule_coordination'));
const secretarySeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_secretary_leader_01');
const scheduleSeed = DEFAULT_AGENT_SEEDS.find((agent) => agent.id === 'agent_schedule_coordination_01');
assert.ok(secretarySeed);
assert.ok(scheduleSeed);
assert.ok((secretarySeed.metadata?.manifest?.metadata?.downstream_task_types || []).includes('schedule_coordination'));
assert.ok((scheduleSeed.metadata?.manifest?.metadata?.optional_connectors || []).includes('zoom'));
assert.ok((scheduleSeed.metadata?.manifest?.metadata?.optional_connectors || []).includes('microsoft_teams'));
assert.ok((scheduleSeed.metadata?.manifest?.capabilities || []).includes('meeting_link_handoff'));
const secretaryLinks = agentLinksFromRecord(secretarySeed, { catalog: DEFAULT_AGENT_SEEDS });
assert.ok(secretaryLinks.downstream.resolved.some((item) => item.id === 'agent_inbox_triage_01'));
assert.ok(secretaryLinks.downstream.resolved.some((item) => item.id === 'agent_schedule_coordination_01'));
const secretaryPayload = sampleAgentPayload('secretary_leader', {
  prompt: 'Act as an executive secretary. Draft replies and coordinate a Zoom or Teams meeting.',
  output_language: 'en'
});
assert.equal(secretaryPayload.report.summary, 'Executive Secretary Leader delivery');
assert.ok(secretaryPayload.files[0].content.includes('Zoom'));
assert.ok(secretaryPayload.files[0].content.includes('Microsoft Teams'));
assert.ok(/approval/i.test(secretaryPayload.files[0].content));

for (const kind of BUILT_IN_KINDS) {
  const payload = sampleAgentPayload(kind, { prompt: 'QA sample. Answer in English.', output_language: 'en' });
  const executionPolicy = builtInExecutionPolicyForKind(kind);
  const toolStrategy = builtInToolStrategyForKind(kind);
  const specialistMethod = builtInSpecialistMethodForKind(kind);
  const scopeBoundaries = builtInScopeBoundariesForKind(kind);
  const freshnessPolicy = builtInFreshnessPolicyForKind(kind);
  const sensitiveDataPolicy = builtInSensitiveDataPolicyForKind(kind);
  const costControlPolicy = builtInCostControlPolicyForKind(kind);
  const trustProfile = builtInTrustProfileForKind(kind);
  assert.ok(executionPolicy.depth_policy.length > 40, `${kind} should have response depth policy`);
  assert.ok(executionPolicy.concision_rule.length > 40, `${kind} should have concision rule`);
  assert.equal(executionPolicy.trust_profile.version, 'agent-trust/v1', `${kind} should have trust profile`);
  assert.equal(trustProfile.version, 'agent-trust/v1', `${kind} direct trust profile should be versioned`);
  assert.ok(trustProfile.score >= 80, `${kind} trust profile should have a usable score`);
  assert.ok(freshnessPolicy.length > 70, `${kind} should have a specific freshness policy`);
  assert.ok(sensitiveDataPolicy.length > 80, `${kind} should have a specific sensitive data policy`);
  assert.ok(costControlPolicy.length > 70, `${kind} should have a specific cost control policy`);
  assert.ok(Array.isArray(specialistMethod), `${kind} should have specialist method`);
  assert.ok(specialistMethod.length >= 3, `${kind} should have at least three specialist method steps`);
  assert.ok(specialistMethod.every((step) => step.length > 30), `${kind} specialist method steps should be specific`);
  assert.ok(Array.isArray(scopeBoundaries), `${kind} should have scope boundaries`);
  assert.ok(scopeBoundaries.length >= 3, `${kind} should have at least three scope boundaries`);
  assert.ok(scopeBoundaries.every((step) => step.length > 30), `${kind} scope boundaries should be specific`);
  assert.ok(['default', 'when_current', 'provided_only', 'never'].includes(toolStrategy.web_search), `${kind} should have a valid web search mode`);
  assert.ok(toolStrategy.source_mode.length > 8, `${kind} should define source mode`);
  assert.ok(toolStrategy.note.length > 40, `${kind} should define tool strategy note`);
  assert.equal(payload.runtime.delivery_policy.depth_policy, executionPolicy.depth_policy, `${kind} fallback runtime should expose depth policy`);
  assert.equal(payload.runtime.delivery_policy.concision_rule, executionPolicy.concision_rule, `${kind} fallback runtime should expose concision rule`);
  assert.equal(payload.runtime.delivery_policy.freshness_policy, freshnessPolicy, `${kind} fallback runtime should expose freshness policy`);
  assert.equal(payload.runtime.delivery_policy.sensitive_data_policy, sensitiveDataPolicy, `${kind} fallback runtime should expose sensitive data policy`);
  assert.equal(payload.runtime.delivery_policy.cost_control_policy, costControlPolicy, `${kind} fallback runtime should expose cost control policy`);
  assert.deepEqual(payload.runtime.delivery_policy.specialist_method, specialistMethod, `${kind} fallback runtime should expose specialist method`);
  assert.deepEqual(payload.runtime.delivery_policy.scope_boundaries, scopeBoundaries, `${kind} fallback runtime should expose scope boundaries`);
  assert.deepEqual(payload.runtime.delivery_policy.trust_profile, trustProfile, `${kind} fallback runtime should expose trust profile`);
  assert.deepEqual(payload.runtime.tool_strategy, toolStrategy, `${kind} fallback runtime should expose tool strategy`);
  assert.ok(payload.files[0].content.includes('## Trust and quality assurance'), `${kind} fallback delivery should include trust and QA`);
  if (kind === 'cmo_leader') {
    assert.ok(payload.files[0].content.includes('## Answer first'), 'cmo_leader fallback should be a concrete delivery');
    assert.ok(!payload.files[0].content.includes('## Output contract'), 'cmo_leader fallback should not expose output-contract boilerplate');
    assert.ok(!payload.files[0].content.includes('first lane: the one media lane'), 'cmo_leader fallback should not contain placeholders');
    continue;
  }
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
  secretary_leader: 'standard',
  inbox_triage: 'standard',
  reply_draft: 'standard',
  schedule_coordination: 'standard',
  follow_up: 'standard',
  meeting_prep: 'standard',
  meeting_notes: 'standard',
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
  secretary_leader: 'when_current',
  inbox_triage: 'never',
  reply_draft: 'never',
  schedule_coordination: 'when_current',
  follow_up: 'never',
  meeting_prep: 'never',
  meeting_notes: 'never',
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
assert.equal(promptBrushupHealth.trust_profile.version, 'agent-trust/v1');
const braveHealth = builtInAgentHealthPayload('research', { BRAVE_SEARCH_API_KEY: 'test-brave-key' });
assert.equal(braveHealth.mode, 'built_in');
assert.equal(braveHealth.provider, 'built_in');
assert.equal(braveHealth.search_provider, 'brave');
assert.equal(braveHealth.trust_profile.level, 'source_bound');
const ctoHealth = builtInAgentHealthPayload('cto_leader', { OPENAI_API_KEY: 'test-key' });
assert.equal(ctoHealth.model, 'gpt-5.4-mini');
assert.equal(ctoHealth.model_tier, 'code');
assert.equal(ctoHealth.tool_strategy.web_search, 'default');
assert.ok(ctoHealth.specialist_method.some((step) => step.includes('dispatch packets') || step.includes('rollout')));
assert.ok(ctoHealth.scope_boundaries.some((step) => step.includes('architecture changes')));
assert.ok(ctoHealth.freshness_policy.includes('version-sensitive'));
assert.ok(ctoHealth.sensitive_data_policy.includes('security findings'));
assert.ok(ctoHealth.cost_control_policy.includes('smallest reversible technical decision'));

const agentDefinitionsDir = new URL('../lib/builtin-agents/agents/', import.meta.url);
for (const fileName of readdirSync(agentDefinitionsDir).filter((name) => name.endsWith('.js'))) {
  const source = readFileSync(new URL(fileName, agentDefinitionsDir), 'utf8');
  assert.ok(!/for CAIt|CAIt internal|What CAIt should/i.test(source), `${fileName} must not hard-code CAIt as the user product`);
}

const genericMarketingPrompt = 'Grow bookings for Sakura Dental Clinic, a local dental clinic for families, with SEO, one social post, an email draft, and directory submissions. Goal: appointment inquiries. No paid ads.';
const platformContaminationPattern = /\bCAIt\b|aiagent-marketplace\.net|Work Chat|chat-first|dashboard-first|Japanese-speaking engineers|agent listing signup|agent registration|Publish your AI agent|order-ready AI agent work/i;
for (const kind of ['landing', 'growth', 'media_planner', 'email_ops', 'directory_submission', 'x_post', 'reddit', 'indie_hackers', 'instagram', 'seo_gap', 'data_analysis']) {
  const payload = sampleAgentPayload(kind, { prompt: genericMarketingPrompt });
  const content = payload.files?.[0]?.content || '';
  assert.ok(content.includes('Sakura Dental Clinic') || content.includes('local dental clinic'), `${kind} should carry the user-specified product context`);
  assert.ok(!platformContaminationPattern.test(content), `${kind} must not reuse CAIt or AI-agent-marketplace sample content for an unrelated business`);
}

console.log('builtin-agents qa passed');
