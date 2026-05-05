export const CHAT_ENGINE_DEFAULT_REQUESTED_STRATEGY = 'auto';

export function chatEngineLooksJapanese(value = '') {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(String(value || ''));
}

export function chatEngineIsNeedsInputResponse(response = {}) {
  return response?.needs_input === true
    || String(response?.status || '').trim().toLowerCase() === 'needs_input';
}

export function chatEngineBuildPrepareOrderPayload(prompt = '', options = {}) {
  const taskType = String(options.taskType || options.task_type || options.selectedTaskType || '').trim();
  const selectedAgentId = String(options.selectedAgentId || options.selected_agent_id || '').trim();
  const selectedAgentName = String(options.selectedAgentName || options.selected_agent_name || '').trim();
  const activeLeaderTaskType = String(options.activeLeaderTaskType || options.active_leader_task_type || '').trim();
  const activeLeaderName = String(options.activeLeaderName || options.active_leader_name || '').trim();
  return {
    prompt: String(prompt || '').trim(),
    requestedStrategy: String(options.requestedStrategy || CHAT_ENGINE_DEFAULT_REQUESTED_STRATEGY).trim() || CHAT_ENGINE_DEFAULT_REQUESTED_STRATEGY,
    ...(taskType ? { task_type: taskType } : {}),
    ...(selectedAgentId ? { selected_agent_id: selectedAgentId } : {}),
    ...(selectedAgentName ? { selected_agent_name: selectedAgentName } : {}),
    ...(activeLeaderTaskType ? { active_leader_task_type: activeLeaderTaskType } : {}),
    ...(activeLeaderName ? { active_leader_name: activeLeaderName } : {}),
    ...(options.intakeAnswered === true ? { intake_answered: true } : {})
  };
}

function chatEngineConversationOwner(response = {}, options = {}) {
  const owner = response?.conversationOwner || response?.conversation_owner || response?.intake?.conversationOwner || response?.intake?.conversation_owner || {};
  const ownerType = String(owner.type || response.ownerType || response.owner_type || '').trim().toLowerCase();
  const fallbackLeaderTaskType = ownerType ? '' : (options.activeLeaderTaskType || '');
  const fallbackLeaderName = ownerType ? '' : (options.activeLeaderName || '');
  const activeLeaderTaskType = String(
    response.activeLeaderTaskType
    || response.active_leader_task_type
    || owner.taskType
    || owner.task_type
    || fallbackLeaderTaskType
    || ''
  ).trim();
  const activeLeaderName = String(
    response.activeLeaderName
    || response.active_leader_name
    || owner.label
    || fallbackLeaderName
    || ''
  ).trim();
  if ((ownerType === 'leader' || activeLeaderTaskType) && activeLeaderTaskType) {
    return {
      type: 'leader',
      taskType: activeLeaderTaskType,
      label: activeLeaderName || activeLeaderTaskType,
      reason: String(owner.reason || response.reason || '').trim()
    };
  }
  return {
    type: 'cait',
    label: 'CAIt',
    reason: String(owner.reason || response.reason || '').trim()
  };
}

export function chatEngineBuildIntakeState(response = {}, originalPrompt = '', options = {}) {
  const responseIntake = response?.intake && typeof response.intake === 'object' ? response.intake : {};
  const questions = Array.isArray(response.questions)
    ? response.questions.filter(Boolean).slice(0, 8)
    : Array.isArray(responseIntake.questions)
      ? responseIntake.questions.filter(Boolean).slice(0, 8)
      : [];
  const prompt = String(
    responseIntake.originalPrompt
    || responseIntake.original_prompt
    || response.prompt
    || originalPrompt
    || options.originalPrompt
    || ''
  ).trim();
  return {
    ...responseIntake,
    id: String(responseIntake.id || `intake-${Date.now().toString(36)}`),
    originalPrompt: prompt,
    taskType: String(
      responseIntake.taskType
      || responseIntake.task_type
      || response.inferred_task_type
      || response.taskType
      || response.task_type
      || options.taskType
      || 'research'
    ).trim() || 'research',
    selectedAgentId: String(responseIntake.selectedAgentId || responseIntake.selected_agent_id || response.selectedAgentId || response.selected_agent_id || options.selectedAgentId || '').trim(),
    selectedAgentName: String(responseIntake.selectedAgentName || responseIntake.selected_agent_name || response.selectedAgentName || response.selected_agent_name || options.selectedAgentName || '').trim(),
    conversationOwner: chatEngineConversationOwner(response, options),
    activeLeaderTaskType: String(responseIntake.activeLeaderTaskType || responseIntake.active_leader_task_type || response.activeLeaderTaskType || response.active_leader_task_type || '').trim(),
    activeLeaderName: String(responseIntake.activeLeaderName || responseIntake.active_leader_name || response.activeLeaderName || response.active_leader_name || '').trim(),
    questions,
    missingFields: Array.isArray(responseIntake.missingFields)
      ? responseIntake.missingFields
      : Array.isArray(response.missing_fields)
        ? response.missing_fields
        : [],
    createdAt: String(responseIntake.createdAt || responseIntake.created_at || new Date().toISOString()),
    answerMode: String(responseIntake.answerMode || responseIntake.answer_mode || 'resubmit_with_answers')
  };
}

export function chatEngineBuildIntakeCombinedPrompt(intake = {}, answer = '', options = {}) {
  const original = String(intake?.originalPrompt || intake?.original_prompt || options.originalPrompt || '').trim();
  const clarification = String(answer || '').trim();
  const lines = [
    'Original request:',
    original,
    '',
    'User clarification:',
    clarification
  ];
  if (options.includeInstruction !== false) {
    lines.push(
      '',
      String(options.instruction || 'Use these clarification details and produce the requested delivery. State any remaining assumptions briefly.').trim()
    );
  }
  return lines.join('\n').trim();
}

export function chatEngineDraftBrief(prompt = '', prepared = {}, options = {}) {
  const ja = options.ja ?? chatEngineLooksJapanese(prompt);
  const task = String(prepared.taskType || prepared.task_type || 'research').trim() || 'research';
  const route = String(prepared.resolvedOrderStrategy || prepared.resolved_order_strategy || 'single').trim() || 'single';
  const owner = chatEngineConversationOwner(prepared, options);
  const deliver = options.deliver || (ja
    ? 'チャットに進捗と納品を返す。必要なHTML/ファイルは納品カードとして表示する。'
    : 'Return progress and delivery in chat. Include HTML/files as delivery cards when relevant.');
  return [
    `Task: ${task}`,
    `Goal: ${String(prompt || '').trim()}`,
    owner.type === 'leader' ? `Conversation lead: ${owner.label} (${owner.taskType})` : 'Conversation lead: CAIt specialist router',
    `Work split: ${route === 'multi' ? 'team workflow' : 'single agent'}`,
    'Inputs: chat request and any URLs or constraints in the message',
    'Constraints: keep the user-facing flow chat-first; do not claim external writes without connector proof',
    `Deliver: ${deliver}`,
    `Output language: ${ja ? 'Japanese' : 'English'}`,
    'Acceptance: concrete delivery, visible blockers, source/connector status, and next action are all posted back into this chat'
  ].filter(Boolean).join('\n');
}

export function chatEngineBuildOrderDraft(prompt = '', prepared = {}, options = {}) {
  const owner = chatEngineConversationOwner(prepared, options);
  return {
    ...prepared,
    prompt: chatEngineDraftBrief(prompt, prepared, options),
    originalPrompt: options.originalPrompt || prompt,
    intakeAnswered: options.intakeAnswered === true,
    intakeChecked: options.intakeChecked === true,
    selectedAgentId: options.selectedAgentId || prepared.selectedAgentId || prepared.selected_agent_id || '',
    selectedAgentName: options.selectedAgentName || prepared.selectedAgentName || prepared.selected_agent_name || '',
    conversationOwner: owner,
    activeLeaderTaskType: owner.type === 'leader' ? owner.taskType : '',
    activeLeaderName: owner.type === 'leader' ? owner.label : '',
    updatedAt: new Date().toISOString()
  };
}

export function chatEngineBuildJobPayload(draft = {}, options = {}) {
  const broker = options.broker && typeof options.broker === 'object' ? options.broker : {};
  const selectedAgentId = draft.selectedAgentId || draft.selected_agent_id || '';
  const selectedAgentName = draft.selectedAgentName || draft.selected_agent_name || '';
  const taskType = draft.taskType || draft.task_type || 'research';
  const owner = chatEngineConversationOwner(draft, options);
  return {
    parent_agent_id: options.parentAgentId || draft.parent_agent_id || draft.parentAgentId || 'cloudcode-main',
    task_type: taskType,
    selected_agent_id: selectedAgentId,
    selected_agent_name: selectedAgentName,
    prompt: String(draft.prompt || '').trim(),
    order_strategy: draft.resolvedOrderStrategy || draft.resolved_order_strategy || draft.order_strategy || 'single',
    async_dispatch: options.asyncDispatch !== false,
    skip_intake: options.skipIntake === true || draft.intakeChecked === true || draft.intakeAnswered === true,
    visitor_id: options.visitorId || draft.visitor_id || '',
    budget_cap: Number(options.budgetCap ?? draft.budget_cap ?? 500),
    deadline_sec: Number(options.deadlineSec ?? draft.deadline_sec ?? 300),
    confirmation: {
      accepted: true,
      source: 'chat_send_order',
      accepted_at: new Date().toISOString(),
      ...(selectedAgentId ? { agent_id: selectedAgentId } : {})
    },
    input: {
      ...(draft.input && typeof draft.input === 'object' ? draft.input : {}),
      source: options.source || draft.input?.source || 'chat',
      original_prompt: draft.originalPrompt || draft.original_prompt || '',
      _broker: {
        ...((draft.input && typeof draft.input === 'object' && draft.input._broker && typeof draft.input._broker === 'object') ? draft.input._broker : {}),
        ...broker,
        conversationOwner: owner,
        ...(owner.type === 'leader' ? {
          activeLeader: {
            taskType: owner.taskType,
            label: owner.label,
            reason: owner.reason || ''
          }
        } : {}),
        ...(selectedAgentId ? {
          selectedWorker: {
            agentId: selectedAgentId,
            agentName: selectedAgentName,
            taskType
          }
        } : {})
      }
    }
  };
}
