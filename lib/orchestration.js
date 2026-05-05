// Shared orchestration contracts for built-in and externally registered agents.
import { BUILT_IN_KIND_DEFAULTS } from './builtin-agents/agents/index.js';

export const CONNECTOR_EXECUTION_POLICIES = Object.freeze({
  x_post: Object.freeze({
    connector: 'x',
    capability: 'x.post',
    approvalMode: 'human_or_leader_before_external_post',
    approvalFields: ['oauth_account_handle', 'exact_post_text', 'destination_url', 'stop_rule'],
    proofRequired: ['posted_url', 'timestamp', 'account_id_or_handle'],
    fallback: 'manual_posting_packet'
  }),
  instagram: Object.freeze({
    connector: 'instagram',
    capability: 'instagram.post',
    approvalMode: 'human_or_leader_before_external_post',
    proofRequired: ['posted_url', 'timestamp', 'account_id_or_handle'],
    fallback: 'manual_posting_packet'
  }),
  reddit: Object.freeze({
    connector: 'reddit',
    capability: 'reddit.submit',
    approvalMode: 'human_or_leader_before_external_post',
    proofRequired: ['submission_url', 'subreddit', 'timestamp'],
    fallback: 'manual_submission_packet'
  }),
  indie_hackers: Object.freeze({
    connector: 'indie_hackers',
    capability: 'indie_hackers.post',
    approvalMode: 'human_or_leader_before_external_post',
    proofRequired: ['posted_url', 'timestamp'],
    fallback: 'manual_posting_packet'
  }),
  email_ops: Object.freeze({
    connector: 'email',
    capability: 'email.send',
    approvalMode: 'human_or_leader_before_external_send',
    proofRequired: ['message_id', 'recipient_segment', 'timestamp'],
    fallback: 'approval_ready_email_draft'
  }),
  cold_email: Object.freeze({
    connector: 'email',
    capability: 'email.send_outbound',
    approvalMode: 'human_approval_and_compliance_before_send',
    proofRequired: ['message_id', 'recipient_source', 'opt_out_path', 'timestamp'],
    fallback: 'blocked_until_source_sender_and_compliance_approved'
  }),
  directory_submission: Object.freeze({
    connector: 'browser_or_directory',
    capability: 'directory.submit',
    approvalMode: 'human_or_leader_before_external_submission',
    proofRequired: ['directory_url', 'submission_status', 'timestamp'],
    fallback: 'manual_submission_queue'
  }),
  acquisition_automation: Object.freeze({
    connector: 'automation',
    capability: 'automation.write',
    approvalMode: 'human_or_leader_before_connector_write',
    proofRequired: ['workflow_id_or_payload', 'trigger', 'pause_condition'],
    fallback: 'manual_operations_checklist'
  }),
  citation_ops: Object.freeze({
    connector: 'local_seo',
    capability: 'citation.submit',
    approvalMode: 'human_or_leader_before_external_submission',
    proofRequired: ['listing_url', 'status', 'timestamp'],
    fallback: 'manual_citation_queue'
  })
});

export const LEADER_CONTROL_CONTRACT_VERSION = 'leader-control/v1';

export const ORCHESTRATION_WATCHDOG_POLICY = Object.freeze({
  version: 'workflow-watchdog/v1',
  staleAfterMs: 3 * 60 * 1000,
  blockedAfterMs: 30 * 60 * 1000,
  maxParentsPerSweep: 5,
  maxDispatchTargetsPerParent: 8,
  actions: Object.freeze([
    'reconcile_parent',
    'refresh_leader_handoff',
    'schedule_safe_dispatch',
    'surface_visible_blocker'
  ])
});

export const LEADER_CONTROL_STAGES = Object.freeze([
  Object.freeze({
    name: 'select',
    responsibility: 'Choose the smallest set of specialist agents that materially improves the outcome.',
    requiredOutput: Object.freeze(['selected_specialists', 'selection_reason', 'deferred_specialists'])
  }),
  Object.freeze({
    name: 'handoff',
    responsibility: 'Pass objective, constraints, source inputs, required outputs, acceptance checks, and prior findings to each specialist.',
    requiredOutput: Object.freeze(['objective', 'constraints', 'source_inputs', 'required_outputs', 'acceptance_checks'])
  }),
  Object.freeze({
    name: 'review',
    responsibility: 'Verify that each specialist used the handed-off information and returned specific, evidence-backed, actionable output.',
    requiredOutput: Object.freeze(['input_used', 'specificity', 'evidence_status', 'actionability', 'missing_items'])
  }),
  Object.freeze({
    name: 'synthesize',
    responsibility: 'Resolve conflicts, pick the next lane, produce the final summary, and prepare approval-gated execution packets.',
    requiredOutput: Object.freeze(['integrated_decision', 'conflicts_resolved', 'next_lane', 'approval_or_execution_packet'])
  })
]);

export const LEADER_CONTROL_QUALITY_CHECKS = Object.freeze([
  Object.freeze({
    id: 'handoff_input_used',
    description: 'Specialist and leader checkpoint outputs must reference the handed-off objective, constraints, prior findings, or source evidence.'
  }),
  Object.freeze({
    id: 'specific_not_generic',
    description: 'Outputs must name concrete pages, channels, files, claims, owners, metrics, or blockers rather than generic advice.'
  }),
  Object.freeze({
    id: 'evidence_before_action',
    description: 'Research or analysis findings must be reviewed before choosing action, implementation, publishing, or sending lanes.'
  }),
  Object.freeze({
    id: 'approval_before_external_write',
    description: 'Posting, sending, scheduling, repository writes, and connector actions require explicit approval or an authority_request blocker.'
  }),
  Object.freeze({
    id: 'synthesis_resolves_conflict',
    description: 'The final leader output must reconcile duplicated, conflicting, or weak specialist outputs before giving a final recommendation.'
  })
]);

const BASE_LEADER_CONTROL_CONTRACT = Object.freeze({
  role: 'agent_selection_handoff_review_synthesis',
  goal: 'Make the team better by selecting the right specialists, preserving context, checking their use of inputs, and integrating their outputs.',
  notResponsibleFor: Object.freeze([
    'doing every specialist task alone',
    'executing OAuth/API writes directly',
    'burying weak specialist output inside a generic summary',
    'reopening research after evidence is already sufficient for the next safe action'
  ]),
  controlLoop: Object.freeze(['select', 'handoff', 'review', 'synthesize']),
  handoffFields: Object.freeze([
    'objective',
    'constraints',
    'source_inputs',
    'prior_findings',
    'required_outputs',
    'acceptance_checks',
    'approval_or_authority_rules'
  ]),
  qualityChecks: LEADER_CONTROL_QUALITY_CHECKS
});

const DEFAULT_LEADER_CONTROL_SPECIALIZATION = Object.freeze({
  selectionRubric: Object.freeze(['specialist fit', 'dependency order', 'evidence need', 'execution risk']),
  synthesisOutputs: Object.freeze(['specialist roster', 'review findings', 'integrated recommendation', 'next action'])
});

function freezeLeaderLayer(layer = {}) {
  return Object.freeze({
    name: String(layer.name || '').trim(),
    ...(String(layer.phase || '').trim() ? { phase: String(layer.phase || '').trim() } : {}),
    number: Math.max(1, Number(layer.number || 1) || 1),
    tasks: Object.freeze((Array.isArray(layer.tasks) ? layer.tasks : [])
      .map((task) => String(task || '').trim().toLowerCase())
      .filter(Boolean))
  });
}

function freezeLeaderProfile(profile = {}) {
  return Object.freeze({
    ...(Array.isArray(profile.aliases) && profile.aliases.length
      ? { aliases: Object.freeze(profile.aliases.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)) }
      : {}),
    defaultLayer: Math.max(1, Number(profile.defaultLayer || 1) || 1),
    actionLayerStart: Math.max(1, Number(profile.actionLayerStart || 2) || 2),
    layers: Object.freeze((Array.isArray(profile.layers) ? profile.layers : [])
      .map((layer) => freezeLeaderLayer(layer))
      .sort((left, right) => left.number - right.number)),
    protocolExtras: Object.freeze((Array.isArray(profile.protocolExtras) ? profile.protocolExtras : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean))
  });
}

function leaderProfilesFromBuiltIns() {
  const profiles = {};
  for (const [kind, defaults] of Object.entries(BUILT_IN_KIND_DEFAULTS)) {
    if (!String(kind || '').endsWith('_leader')) continue;
    const workflowProfile = defaults?.workflowProfile;
    if (!workflowProfile || typeof workflowProfile !== 'object') continue;
    profiles[kind] = freezeLeaderProfile(workflowProfile);
  }
  return Object.freeze(profiles);
}

export const LEADER_ORCHESTRATION_PROFILES = leaderProfilesFromBuiltIns();

function normalizedTask(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function isLeaderTaskType(taskType = '') {
  return normalizedTask(taskType).endsWith('_leader');
}

export function leaderOrchestrationProfile(primaryTask = '') {
  const primary = normalizedTask(primaryTask);
  const direct = LEADER_ORCHESTRATION_PROFILES[primary] || null;
  if (direct?.inherits) return leaderOrchestrationProfile(direct.inherits);
  if (direct) return direct;
  for (const profile of Object.values(LEADER_ORCHESTRATION_PROFILES)) {
    if ((profile.aliases || []).includes(primary)) return profile;
  }
  return null;
}

export function leaderProtocolExtras(primaryTask = '') {
  return [...(leaderOrchestrationProfile(primaryTask)?.protocolExtras || [])];
}

export function leaderTaskLayer(primaryTask = '', taskType = '') {
  const task = normalizedTask(taskType);
  if (!task) return null;
  if (isLeaderTaskType(task)) return 0;
  const profile = leaderOrchestrationProfile(primaryTask);
  if (!profile) return null;
  for (const layer of profile.layers || []) {
    if ((layer.tasks || []).includes(task)) return layer.number;
  }
  return profile.defaultLayer;
}

export function leaderTaskPhase(primaryTask = '', taskType = '') {
  const task = normalizedTask(taskType);
  if (!task) return '';
  if (isLeaderTaskType(task)) return 'leader';
  const profile = leaderOrchestrationProfile(primaryTask);
  if (!profile) return '';
  for (const layer of profile.layers || []) {
    if ((layer.tasks || []).includes(task)) return layer.phase || layer.name || '';
  }
  return '';
}

export function leaderActionLayerStart(primaryTask = '') {
  return leaderOrchestrationProfile(primaryTask)?.actionLayerStart || 2;
}

export function leaderTaskUsesWebSearch(primaryTask = '', taskType = '') {
  const task = normalizedTask(taskType);
  if (!task || isLeaderTaskType(task)) return false;
  return leaderTaskPhase(primaryTask, task) === 'research';
}

function leaderProfileTaskTypes(primaryTask = '') {
  const profile = leaderOrchestrationProfile(primaryTask);
  if (!profile) return [];
  return [...new Set((profile.layers || [])
    .flatMap((layer) => Array.isArray(layer.tasks) ? layer.tasks : [])
    .map(normalizedTask)
    .filter((task) => task && task !== 'summary'))];
}

function leaderControlSpecializationForTask(primaryTask = '') {
  const primary = normalizedTask(primaryTask);
  const direct = BUILT_IN_KIND_DEFAULTS[primary]?.leaderControlSpecialization;
  if (direct && typeof direct === 'object') return direct;
  for (const defaults of Object.values(BUILT_IN_KIND_DEFAULTS)) {
    const aliases = Array.isArray(defaults?.workflowProfile?.aliases)
      ? defaults.workflowProfile.aliases.map(normalizedTask)
      : [];
    if (aliases.includes(primary) && defaults?.leaderControlSpecialization) return defaults.leaderControlSpecialization;
  }
  return DEFAULT_LEADER_CONTROL_SPECIALIZATION;
}

export function leaderControlContractForTask(primaryTask = '') {
  const primary = normalizedTask(primaryTask);
  if (!isLeaderTaskType(primary)) return null;
  const specialization = leaderControlSpecializationForTask(primary);
  return {
    version: LEADER_CONTROL_CONTRACT_VERSION,
    primaryTask: primary,
    role: BASE_LEADER_CONTROL_CONTRACT.role,
    goal: BASE_LEADER_CONTROL_CONTRACT.goal,
    controlLoop: [...BASE_LEADER_CONTROL_CONTRACT.controlLoop],
    stages: LEADER_CONTROL_STAGES.map((stage) => ({
      name: stage.name,
      responsibility: stage.responsibility,
      requiredOutput: [...stage.requiredOutput]
    })),
    handoffFields: [...BASE_LEADER_CONTROL_CONTRACT.handoffFields],
    qualityChecks: BASE_LEADER_CONTROL_CONTRACT.qualityChecks.map((check) => ({
      id: check.id,
      description: check.description
    })),
    notResponsibleFor: [...BASE_LEADER_CONTROL_CONTRACT.notResponsibleFor],
    downstreamTaskTypes: leaderProfileTaskTypes(primary),
    selectionRubric: [...specialization.selectionRubric],
    synthesisOutputs: [...specialization.synthesisOutputs]
  };
}

export function leaderControlContractMarkdown(primaryTask = '', isJapanese = false) {
  const contract = leaderControlContractForTask(primaryTask);
  if (!contract) return '';
  if (isJapanese) {
    return [
      '## Leader control contract',
      `- version: ${contract.version}`,
      `- role: ${contract.role}`,
      `- control loop: ${contract.controlLoop.join(' -> ')}`,
      `- handoff fields: ${contract.handoffFields.join(', ')}`,
      `- selection rubric: ${contract.selectionRubric.join(' / ')}`,
      `- synthesis outputs: ${contract.synthesisOutputs.join(' / ')}`,
      '- Leader は専門作業を一人で抱え込まず、適切な専門agentを選び、渡した情報の利用を検査し、統合する。'
    ].join('\n');
  }
  return [
    '## Leader control contract',
    `- version: ${contract.version}`,
    `- role: ${contract.role}`,
    `- control loop: ${contract.controlLoop.join(' -> ')}`,
    `- handoff fields: ${contract.handoffFields.join(', ')}`,
    `- selection rubric: ${contract.selectionRubric.join(' / ')}`,
    `- synthesis outputs: ${contract.synthesisOutputs.join(' / ')}`,
    '- The leader should not act as every specialist; it selects, hands off, checks input usage, and synthesizes.'
  ].join('\n');
}

export function connectorExecutionPolicyForTask(taskType = '') {
  return CONNECTOR_EXECUTION_POLICIES[normalizedTask(taskType)] || null;
}

export function taskRequiresConnectorApproval(taskType = '') {
  return Boolean(connectorExecutionPolicyForTask(taskType)?.approvalMode);
}
