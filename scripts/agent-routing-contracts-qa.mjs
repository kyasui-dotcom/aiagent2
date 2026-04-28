import assert from 'node:assert/strict';
import {
  DEFAULT_AGENT_SEEDS,
  agentLinksFromRecord,
  applyConfirmedAgentRoutingToAgent,
  buildAgentRoutingConfirmation,
  inferTaskSequence
} from '../lib/shared.js';

function indexOf(sequence, task) {
  return sequence.indexOf(task);
}

function assertBefore(sequence, left, right, message) {
  assert.ok(sequence.includes(left), `${message}: missing ${left}`);
  assert.ok(sequence.includes(right), `${message}: missing ${right}`);
  assert.ok(indexOf(sequence, left) < indexOf(sequence, right), message);
}

for (const agent of DEFAULT_AGENT_SEEDS) {
  const links = agentLinksFromRecord(agent, { catalog: DEFAULT_AGENT_SEEDS });
  assert.ok(links.layer, `${agent.id} should infer a routing layer`);
  assert.ok(links.role, `${agent.id} should infer a routing role`);
  if (links.layer === 'execution') {
    assert.ok(links.approval_mode, `${agent.id} execution adapter should declare an approval mode`);
    assert.ok(
      links.upstream.task_types.includes('writing') || links.upstream.task_types.includes('research'),
      `${agent.id} execution adapter should link to writing or research upstream`
    );
    assert.ok(links.input_contract.length, `${agent.id} should expose an input contract`);
    assert.ok(links.output_contract.length, `${agent.id} should expose an output contract`);
  }
  if (links.layer === 'leader') {
    assert.ok(
      links.downstream.task_types.length || links.downstream.tags.length,
      `${agent.id} leader should declare downstream routing`
    );
  }
}

const xPostSequence = inferTaskSequence('x_post', 'X postまで作って承認後に投稿準備したい', { maxTasks: 5 });
assertBefore(xPostSequence, 'research', 'writing', 'x_post should research before writing');
assertBefore(xPostSequence, 'writing', 'x_post', 'x_post should draft before execution');

const multiChannelSequence = inferTaskSequence('cmo_leader', '1告知でX Reddit Indie Hackers Instagramまでまとめて作って投稿準備したい', { maxTasks: 14 });
assertBefore(multiChannelSequence, 'writing', 'x_post', 'multi-channel launch should draft before X execution');
assertBefore(multiChannelSequence, 'writing', 'instagram', 'multi-channel launch should draft before Instagram execution');
assertBefore(multiChannelSequence, 'writing', 'reddit', 'multi-channel launch should draft before Reddit execution');

const userTwitterAgent = {
  id: 'agent_user_twitter_adapter_qa',
  name: 'User Twitter Adapter QA',
  description: 'Publishes approved social posts to Twitter and X after user approval.',
  taskTypes: ['twitter'],
  tags: ['social', 'x', 'marketing'],
  online: true,
  verificationStatus: 'verified',
  metadata: {
    manifest: {
      schema_version: 'agent-manifest/v1',
      name: 'user_twitter_adapter_qa',
      task_types: ['twitter'],
      metadata: {
        task_type_scores: {
          x_post: 0.95
        }
      }
    }
  }
};
const twitterConfirmation = buildAgentRoutingConfirmation(userTwitterAgent, { catalog: DEFAULT_AGENT_SEEDS });
assert.equal(twitterConfirmation.inferred.layer, 'execution');
assert.ok(twitterConfirmation.inferred.upstream.task_types.includes('writing'));
assert.ok(twitterConfirmation.inferred.upstream.resolved.some((agent) => agent.id === 'agent_writer_01'));
const confirmedTwitter = structuredClone(userTwitterAgent);
applyConfirmedAgentRoutingToAgent(confirmedTwitter, { catalog: DEFAULT_AGENT_SEEDS, confirmedBy: 'qa' });
assert.equal(confirmedTwitter.metadata.routing_confirmation.confirmed, true);
assert.equal(confirmedTwitter.metadata.agent_layer, 'execution');
assert.ok(confirmedTwitter.metadata.upstream_task_types.includes('writing'));

const userResearchAgent = {
  id: 'agent_user_research_qa',
  name: 'User Research QA',
  description: 'Researches sources, compares options, and returns evidence with confidence.',
  taskTypes: ['research'],
  tags: ['research', 'analysis', 'evidence'],
  online: true,
  verificationStatus: 'verified',
  metadata: {}
};
const researchConfirmation = buildAgentRoutingConfirmation(userResearchAgent, { catalog: DEFAULT_AGENT_SEEDS });
assert.equal(researchConfirmation.inferred.layer, 'research');
assert.ok(researchConfirmation.inferred.downstream.task_types.includes('writing'));

console.log('agent routing contracts qa passed');
