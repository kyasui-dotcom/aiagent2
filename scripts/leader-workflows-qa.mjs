import assert from 'node:assert/strict';
import worker from '../worker.js';
import { createD1LikeStorage } from '../lib/storage.js';

const env = {
  APP_VERSION: '0.2.0-test',
  ALLOW_OPEN_WRITE_API: '1',
  ALLOW_GUEST_RUN_READ_API: '1',
  ALLOW_DEV_API: '1',
  EXPOSE_JOB_SECRETS: '1',
  SESSION_SECRET: 'leader-workflow-qa-secret',
  STRIPE_SECRET_KEY: 'sk_test_worker_qa',
  STRIPE_WEBHOOK_SECRET: 'whsec_worker_api_qa',
  STRIPE_DEFAULT_CURRENCY: 'USD',
  BASE_URL: 'https://example.test',
  BRAVE_SEARCH_API_KEY: 'brave-leader-workflows-qa',
  ALLOW_IN_MEMORY_STORAGE: '1',
  GOOGLE_CLIENT_ID: 'google-worker-api-qa-client-id',
  GOOGLE_CLIENT_SECRET: 'google-worker-api-qa-client-secret',
  MY_BINDING: null,
  ASSETS: {
    async fetch() {
      return new Response('not found', { status: 404 });
    }
  }
};

const originalLeaderWorkflowQaFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (String(url || '').startsWith('https://api.search.brave.com/')) {
    return new Response(JSON.stringify({
      web: {
        results: [
          {
            title: 'Leader workflow QA source',
            url: 'https://example.test/leader-workflow-source',
            description: 'Search-backed evidence for leader workflow QA.',
            extra_snippets: ['Research layer evidence, action layer decision, and final delivery source.']
          }
        ]
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return originalLeaderWorkflowQaFetch(input, init);
};

const storage = createD1LikeStorage(env.MY_BINDING, { allowInMemory: true, stateCacheTtlMs: 0 });

async function request(path, init = {}) {
  const waitUntilPromises = [];
  const ctx = {
    waitUntil(promise) {
      waitUntilPromises.push(Promise.resolve(promise));
    }
  };
  const res = await worker.fetch(new Request(`https://example.test${path}`, init), env, ctx);
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  await Promise.allSettled(waitUntilPromises);
  return { status: res.status, body };
}

const cases = [
  {
    taskType: 'research_team_leader',
    prompt: 'Research team leader: compare the main competitors, identify the decision blockers, and deliver one final evidence-backed recommendation.',
    minChildren: 4
  },
  {
    taskType: 'build_team_leader',
    prompt: 'Build team leader: review a web app architecture problem, plan the implementation/debug path, and deliver a final technical recommendation.',
    minChildren: 3
  },
  {
    taskType: 'cto_leader',
    prompt: 'CTO leader: assess architecture, implementation risk, and operations tradeoffs for an AI marketplace app and deliver the final engineering recommendation.',
    minChildren: 4
  },
  {
    taskType: 'cpo_leader',
    prompt: 'CPO leader: analyze onboarding friction, feature prioritization, and user evidence, then deliver the final product recommendation.',
    minChildren: 4
  },
  {
    taskType: 'cfo_leader',
    prompt: 'CFO leader: analyze pricing, unit economics, billing risk, and revenue tradeoffs for a subscription AI marketplace, then deliver the final finance recommendation.',
    minChildren: 3
  },
  {
    taskType: 'legal_leader',
    prompt: 'Legal leader: analyze privacy policy, terms, and compliance risks for an AI marketplace and deliver the final legal recommendation.',
    minChildren: 3
  },
  {
    taskType: 'cmo_leader',
    prompt: 'CMO leader: analyze channels, competitors, and signup conversion, then plan and do actions by preparing an X post and directory submission after approval.',
    minChildren: 8,
    expectedStatus: 'blocked',
    expectedBlockedCapability: 'x.post'
  }
];

for (const testCase of cases) {
  const created = await request('/api/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      parent_agent_id: 'qa-runner',
      task_type: testCase.taskType,
      prompt: testCase.prompt,
      order_strategy: 'multi',
      skip_intake: true,
      budget_cap: 500
    })
  });
  assert.equal(created.status, 201, `${testCase.taskType} should create successfully`);
  assert.ok(created.body.workflow_job_id, `${testCase.taskType} should return a workflow job id`);

  let latest = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    latest = await request(`/api/jobs/${created.body.workflow_job_id}`);
    assert.equal(latest.status, 200, `${testCase.taskType} workflow fetch should succeed`);
    if (['completed', 'failed', 'blocked'].includes(latest.body?.job?.status)) break;
  }

  const job = latest.body?.job || {};
  const childRuns = Array.isArray(job.workflow?.childRuns) ? job.workflow.childRuns : [];
  const expectedStatus = testCase.expectedStatus || 'completed';
  assert.equal(job.status, expectedStatus, `${testCase.taskType} workflow should reach ${expectedStatus}`);
  assert.ok(childRuns.length >= testCase.minChildren, `${testCase.taskType} should create enough child runs`);
  assert.ok(childRuns.some((run) => run.taskType === testCase.taskType), `${testCase.taskType} should include the leader child run`);
  assert.ok(childRuns.some((run) => run.taskType !== testCase.taskType), `${testCase.taskType} should include at least one specialist child run`);
  assert.equal(Number(job.workflow?.statusCounts?.failed || 0), 0, `${testCase.taskType} should not leave failed child runs`);
  if (expectedStatus === 'completed') {
    assert.equal(Number(job.workflow?.statusCounts?.blocked || 0), 0, `${testCase.taskType} should not leave blocked child runs at completion`);
    assert.equal(Number(job.workflow?.statusCounts?.queued || 0), 0, `${testCase.taskType} should not leave queued child runs at completion`);
    assert.equal(Number(job.workflow?.statusCounts?.running || 0), 0, `${testCase.taskType} should not leave running child runs at completion`);
  } else {
    assert.ok(Number(job.workflow?.statusCounts?.blocked || 0) > 0, `${testCase.taskType} should expose blocked action children`);
    assert.equal(job.output?.report?.authority_request?.missing_connector_capabilities?.includes(testCase.expectedBlockedCapability), true, `${testCase.taskType} should request the expected action authority`);
  }
  assert.ok(String(job.output?.summary || '').trim(), `${testCase.taskType} should produce a final summary`);
  assert.equal(job.workflow?.leaderActionProtocol?.leaderControlContract?.role, 'agent_selection_handoff_review_synthesis', `${testCase.taskType} should carry the programmed leader control contract`);
  assert.ok(job.workflow?.leaderActionProtocol?.leaderControlContract?.controlLoop?.includes('review'), `${testCase.taskType} leader contract should require review`);

  const rawState = await storage.getState();
  const rawChildren = rawState.jobs.filter((item) => item.workflowParentId === created.body.workflow_job_id);
  const initialLeader = rawChildren.find((item) => item.taskType === testCase.taskType && item.input?._broker?.workflow?.sequencePhase === 'initial');
  assert.ok(initialLeader, `${testCase.taskType} should create an initial leader run`);
  assert.notEqual(initialLeader?.input?._broker?.workflow?.forceWebSearch, true, `${testCase.taskType} initial leader run should not browse`);
  assert.equal(initialLeader?.input?._broker?.workflow?.leaderControlContract?.version, 'leader-control/v1', `${testCase.taskType} initial leader input should include leader contract`);
  const finalSummaryLeader = rawChildren.find((item) => item.taskType === testCase.taskType && item.input?._broker?.workflow?.sequencePhase === 'final_summary');
  assert.ok(finalSummaryLeader, `${testCase.taskType} should create a final summary leader run`);
  assert.equal(finalSummaryLeader?.qualityGate?.type, 'leader_output', `${testCase.taskType} final summary should be checked by the leader result quality gate`);
  assert.equal(finalSummaryLeader?.qualityGate?.passed, true, `${testCase.taskType} final summary should pass leader result quality gate`);
  assert.equal(finalSummaryLeader.status, 'completed', `${testCase.taskType} final summary should complete even when an action child is waiting for approval`);
  const researchLayerChildren = rawChildren.filter((item) => item.taskType !== testCase.taskType && item.input?._broker?.workflow?.sequencePhase === 'research');
  assert.ok(
    researchLayerChildren.every((item) => item.input?._broker?.workflow?.forceWebSearch === true),
    `${testCase.taskType} research-layer children should force web search`
  );
  assert.ok(
    researchLayerChildren.every((item) => item.input?._broker?.workflow?.webSearchRequiredReason === 'leader_research_layer'),
    `${testCase.taskType} research-layer children should explain forced search`
  );
  const nonResearchChildren = rawChildren.filter((item) => item.taskType !== testCase.taskType && item.input?._broker?.workflow?.sequencePhase !== 'research');
  assert.ok(
    nonResearchChildren.every((item) => item.input?._broker?.workflow?.forceWebSearch !== true),
    `${testCase.taskType} non-research workflow children should not force web search`
  );
  if (testCase.taskType === 'cmo_leader') {
    assert.ok(researchLayerChildren.length >= 1, 'cmo_leader should create search/research-layer specialist children');
    const planningLayerChildren = rawChildren.filter((item) => item.taskType !== testCase.taskType && item.input?._broker?.workflow?.sequencePhase === 'planning');
    const preparationLayerChildren = rawChildren.filter((item) => item.taskType !== testCase.taskType && item.input?._broker?.workflow?.sequencePhase === 'preparation');
    const actionLayerChildren = rawChildren.filter((item) => item.taskType !== testCase.taskType && item.input?._broker?.workflow?.sequencePhase === 'action');
    const additionalPromptFor = (item) => String(item?.additionalPrompt || item?.additional_prompt || item?.input?._broker?.workflow?.additionalPrompt || '').trim();
    assert.ok(planningLayerChildren.some((item) => ['media_planner', 'growth'].includes(item.taskType)), 'cmo_leader should create planning-layer specialists');
    assert.ok(preparationLayerChildren.some((item) => ['list_creator', 'seo_gap', 'landing', 'writing', 'writer'].includes(item.taskType)), 'cmo_leader should create preparation-layer specialists');
    assert.ok(preparationLayerChildren.some((item) => item.taskType === 'list_creator'), 'cmo_leader should treat list_creator as preparation, not research');
    assert.ok(actionLayerChildren.some((item) => ['x_post', 'directory_submission', 'acquisition_automation'].includes(item.taskType)), 'cmo_leader action layer should include final action specialists');
    assert.ok(actionLayerChildren.some((item) => item.status === 'blocked' && item.output?.report?.authority_request?.missing_connector_capabilities?.includes('x.post')), 'cmo_leader should block X posting until x.post authority is approved');
    assert.ok(job.output?.report?.authority_request?.missing_connector_capabilities?.includes('x.post'), 'cmo_leader parent delivery should surface the blocked X approval request');
    assert.equal(job.output?.report?.completion_state, 'blocked_waiting_for_approval', 'cmo_leader parent delivery should keep approval-blocked completion state visible');
    assert.ok(job.output?.files?.some((file) => file?.content_type === 'social_post_pack' && file?.execution_candidate === true), 'cmo_leader parent delivery should expose the X action packet as an execution candidate');
    assert.ok(
      planningLayerChildren.concat(preparationLayerChildren, actionLayerChildren).some((item) => additionalPromptFor(item).includes('CANONICAL USER BRIEF')),
      'cmo_leader downstream specialists should receive the canonical user brief in additional_prompt'
    );
    assert.ok(
      planningLayerChildren.concat(preparationLayerChildren, actionLayerChildren).some((item) => additionalPromptFor(item).includes('STRUCTURED HANDOFF DIGEST')),
      'cmo_leader downstream specialists should receive the lightweight structured handoff digest in additional_prompt'
    );
    assert.ok(
      planningLayerChildren.concat(preparationLayerChildren, actionLayerChildren).some((item) => /Facts:|Sources:|Decisions:|Artifacts:|Blockers:|Next inputs:/.test(additionalPromptFor(item))),
      'cmo_leader structured handoff digest should expose compact facts/sources/decisions/artifacts/blockers/next inputs'
    );
    assert.ok(
      planningLayerChildren.concat(preparationLayerChildren, actionLayerChildren).some((item) => Array.isArray(item.input?._broker?.workflow?.leaderHandoff?.structuredHandoffDigest) && item.input._broker.workflow.leaderHandoff.structuredHandoffDigest.length > 0),
      'cmo_leader leaderHandoff should carry structured digest objects between layers'
    );
    assert.ok(
      preparationLayerChildren.concat(actionLayerChildren).some((item) => /Prior deliverable markdown excerpt|```markdown/.test(additionalPromptFor(item))),
      'cmo_leader downstream specialists should receive prior delivery markdown excerpts in additional_prompt'
    );
    const checkpointLeaders = rawChildren.filter((item) => item.taskType === 'cmo_leader' && item.input?._broker?.workflow?.sequencePhase === 'checkpoint');
    assert.ok(checkpointLeaders.length >= 3, 'cmo_leader should bridge research -> planning -> preparation -> action with checkpoint leader runs');
    assert.ok(checkpointLeaders.some((item) => item.input?._broker?.workflow?.requiresUserApprovalBeforeAction === true), 'cmo_leader should require approval before the final action layer');
    assert.ok(rawChildren.some((item) => item.taskType === 'cmo_leader' && item.input?._broker?.workflow?.sequencePhase === 'final_summary'), 'cmo_leader should create a final summary leader run');
  }
}

globalThis.fetch = originalLeaderWorkflowQaFetch;

console.log('leader workflows qa passed');
