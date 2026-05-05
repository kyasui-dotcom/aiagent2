function normalizeWorkIntentText(prompt = '') {
  return String(prompt || '').trim().toLowerCase();
}

function hasAnyPattern(text = '', patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

export function isNonOrderConversationIntentText(prompt = '') {
  const text = normalizeWorkIntentText(prompt)
    .replace(/[?？!！。.,、\s]+$/g, '')
    .trim();
  if (!text) return false;
  if (isLeaderCatalogQuestionIntentText(text)) return true;
  if (/^(pause|hold|stop|later|not now|cancel|status|help|what now|where are we|continue chatting)$/i.test(text)) return true;
  if (/^(一旦保留|いったん保留|保留|あとで|後で|また後で|ストップ|止めて|中断|キャンセル|やめる|やっぱやめる|今はやめる|状況|現状|今どこ|何待ち|ヘルプ|相談だけ)$/i.test(text)) return true;
  if (/^(pause|hold|stop|later|not now|cancel)\s*(please|pls)?$/i.test(text)) return true;
  if (/^(いや|いえ|no|nope|nah)[、。,.!\s-]*(pause|hold|stop|later|not now|cancel|保留|あとで|後で|やめる|中断)$/i.test(text)) return true;
  return false;
}

export function isLeaderCatalogQuestionIntentText(prompt = '') {
  const raw = String(prompt || '').replace(/\s+/g, ' ').trim();
  const text = normalizeWorkIntentText(raw)
    .replace(/[?？!！。.,、\s]+$/g, '')
    .trim();
  if (!text) return false;
  const asksCatalog = /(?:what|which|who|list|show|tell|explain|available|kind|kinds|types|どんな|どの|何|なに|誰|だれ|一覧|種類|教えて|見せて|ありますか|いる|いますか|使える|選べる)/i.test(raw);
  const leaderContext = /\b(?:leaders?|team leaders?|leader agents?|cmo|cto|cpo|cfo)\b/i.test(text)
    || /(リーダー|チームリーダー|責任者|CMO|CTO|CPO|CFO|法務|秘書|調査チーム|開発チーム)/i.test(raw);
  const executionAsk = /(作って|調べて|分析して|改善して|実装して|送信|投稿|発注|注文|実行|run|create|build|research|analy[sz]e|improve|send|post|order|dispatch)/i.test(raw);
  return asksCatalog && leaderContext && !executionAsk;
}

export function isRepoBackedCodeIntentText(prompt = '', taskType = '') {
  const text = normalizeWorkIntentText(prompt);
  const task = normalizeWorkIntentText(taskType);
  const codeLike = !task || ['code', 'debug', 'ops', 'automation', 'build_team_leader', 'cto_leader'].includes(task);
  if (!codeLike) return false;
  return hasAnyPattern(text, [
    /(github|git hub|repo|repository|pull request|\bpr\b|branch|commit|diff|issue|bug|debug|fix)/i,
    /(修正|直して|デバッグ|リポジトリ|プルリク|ブランチ|コミット|差分)/i
  ]);
}

function isBroadMarketingGrowthIntentText(prompt = '') {
  const text = normalizeWorkIntentText(prompt);
  if (!text) return false;
  return hasAnyPattern(text, [
    /(growth|go[-\s]?to[-\s]?market|gtm|customer acquisition|acquisition|activation|retention|signup|signups|more users|grow users|marketing help|marketing plan|organic growth|organic acquisition|launch growth)/i,
    /(集客|登録数|会員登録|ユーザー獲得|流入|売上.*増|収益.*増|マーケ|営業|グロース|自然流入|オーガニック.*(?:集客|流入|成長))/i
  ]);
}

const LEADER_TASK_TYPES = new Set([
  'research_team_leader',
  'build_team_leader',
  'cmo_leader',
  'secretary_leader',
  'cto_leader',
  'cpo_leader',
  'cfo_leader',
  'legal_leader'
]);

const LEADER_TASK_LABELS = {
  research_team_leader: 'Research Team Leader',
  build_team_leader: 'Build Team Leader',
  cmo_leader: 'CMO Leader',
  secretary_leader: 'Secretary Leader',
  cto_leader: 'CTO Leader',
  cpo_leader: 'CPO Leader',
  cfo_leader: 'CFO Leader',
  legal_leader: 'Legal Leader'
};

function routeOwnerForLeader(taskType = '', reason = '') {
  const task = normalizeWorkIntentText(taskType);
  if (!LEADER_TASK_TYPES.has(task)) return null;
  return {
    taskType: task,
    strategyHint: 'multi',
    routeHint: 'leader_handoff',
    ownerType: 'leader',
    activeLeaderTaskType: task,
    activeLeaderName: LEADER_TASK_LABELS[task] || task,
    conversationOwner: {
      type: 'leader',
      taskType: task,
      label: LEADER_TASK_LABELS[task] || task,
      reason: reason || 'CAIt selected a leader because this request needs cross-agent intake, research, planning, approval, or execution coordination.'
    },
    reason: reason || 'CAIt selected a leader because this request needs cross-agent intake, research, planning, approval, or execution coordination.'
  };
}

function routeOwnerForCait(taskType = '', reason = '') {
  const task = normalizeWorkIntentText(taskType) || 'research';
  return {
    taskType: task,
    strategyHint: 'single',
    routeHint: 'cait_specialist_router',
    ownerType: 'cait',
    activeLeaderTaskType: '',
    activeLeaderName: '',
    conversationOwner: {
      type: 'cait',
      label: 'CAIt',
      reason: reason || 'CAIt will choose the best specialist agent because this does not require a leader-led workflow yet.'
    },
    reason: reason || 'CAIt will choose the best specialist agent because this does not require a leader-led workflow yet.'
  };
}

export function leaderTaskTypeForInitialWork(taskType = '', prompt = '') {
  const task = normalizeWorkIntentText(taskType);
  const text = normalizeWorkIntentText(prompt);
  if (LEADER_TASK_TYPES.has(task)) return task;
  if (hasAnyPattern(`${task}\n${text}`, [/(legal leader|legal counsel|compliance review|terms and privacy|privacy policy|lawyer|法務|規約|プライバシー|特商法|契約|コンプライアンス|法務レビュー)/i])) return 'legal_leader';
  if (hasAnyPattern(`${task}\n${text}`, [/(finance leader|financial model|pricing strategy|price strategy|unit economics|cash flow|cfo|値付け|価格戦略|財務|収支|資金繰り|ユニットエコノミクス)/i])) return 'cfo_leader';
  if (hasAnyPattern(`${task}\n${text}`, [/(product leader|product strategy|roadmap|ux strategy|feature priorit|mvp roadmap|cpo|プロダクト責任者|プロダクト戦略|ロードマップ|機能優先|ux戦略|仮説検証計画|アイデア検証計画)/i])) return 'cpo_leader';
  if (hasAnyPattern(`${task}\n${text}`, [/(secretary leader|assistant ops|executive assistant|inbox.*schedule|reply.*schedule|calendar coordination|meeting workflow|秘書|日程.*返信|返信.*日程|会議.*調整|予定.*調整)/i])) return 'secretary_leader';
  if (hasAnyPattern(`${task}\n${text}`, [/(cmo|chief marketing|marketing leader|growth plan|go[-\s]?to[-\s]?market|gtm|customer acquisition|organic acquisition|launch campaign|no[-\s]?ads?|without ads|マーケ責任者|マーケ部長|集客|顧客獲得|会員登録|自然流入|オーガニック|広告費.*(なし|使わない|ゼロ)|ローンチ.*施策)/i])) return 'cmo_leader';
  if (hasAnyPattern(`${task}\n${text}`, [/(cto|technical leader|architecture|system design|repo-wide|repository-wide|implementation plan|deploy plan|rollback|技術責任者|開発責任者|アーキテクチャ|全体設計|実装計画|デプロイ計画|ロールバック)/i])) return 'build_team_leader';
  if (hasAnyPattern(`${task}\n${text}`, [/(research team|analysis team|decision team|multi[-\s]?source research|evidence plan|調査チーム|分析チーム|複数.*(調査|分析)|意思決定.*調査|根拠.*整理)/i])) return 'research_team_leader';
  return '';
}

export function inferWorkIntentTaskType(prompt = '') {
  const text = normalizeWorkIntentText(prompt);
  if (!text) return 'research';
  if (isRepoBackedCodeIntentText(prompt, 'code')) return 'code';
  if (hasAnyPattern(text, [/(research team|analysis team|decision team|調査チーム|分析チーム)/i])) return 'research_team_leader';
  if (hasAnyPattern(text, [/(build team|coding team|implementation team|engineering team|開発チーム|実装チーム)/i])) return 'build_team_leader';
  if (hasAnyPattern(text, [/(?:\bcmo\b|chief marketing|marketing leader|マーケ責任者|マーケティング責任者)/i])) return 'cmo_leader';
  if (hasAnyPattern(text, [/(?:\bcto\b|chief technology|technical leader|技術責任者|開発責任者|アーキテクチャ)/i])) return 'cto_leader';
  if (hasAnyPattern(text, [/(x\.com|\bx post\b|\bx thread\b|twitter|tweet|tweets|ツイート|x投稿|ポスト|スレッド)/i])) return 'x_post';
  if (hasAnyPattern(text, [/(gmail|email|mail|メール|送信メール|営業メール)/i])) return 'email_ops';
  if (hasAnyPattern(text, [/(data analysis|analytics|metrics|kpi|dashboard|cohort|funnel analysis|ga4|gsc|search console|データ分析|アクセス解析|指標|計測|ファネル)/i])) return 'data_analysis';
  if (hasAnyPattern(text, [/(seo|meta|description|title|検索|流入)/i])) return 'seo';
  if (isBroadMarketingGrowthIntentText(prompt)) return 'cmo_leader';
  if (hasAnyPattern(text, [/(growth|go[-\s]?to[-\s]?market|gtm|acquisition|activation|retention|signup|signups|more users|outreach|community|product hunt|marketing|sales|revenue|集客|登録数|会員登録|ユーザー獲得|マーケ|営業|グロース)/i])) return 'growth';
  if (hasAnyPattern(text, [/(fix|bug|debug|実装|修正|直し|直して|コード|バグ|不具合|\bapi\b|server|worker|deploy|billing|\bui\b)/i])) return 'code';
  if (hasAnyPattern(text, [/(research|compare|analysis|investigate|市場|比較|調査|戦略)/i])) return 'research';
  return 'research';
}

export function inferWorkIntentRoute(prompt = '') {
  const inferredTaskType = inferWorkIntentTaskType(prompt);
  const leaderTaskType = leaderTaskTypeForInitialWork(inferredTaskType, prompt);
  if (leaderTaskType) {
    return routeOwnerForLeader(
      leaderTaskType,
      'CAIt handed this chat to the matching leader because the intent is broad enough to need intake, research, planning, approval, and specialist/app orchestration.'
    );
  }
  return routeOwnerForCait(
    inferredTaskType,
    'CAIt will keep the chat and route directly to the best specialist unless a leader-level scope becomes clear.'
  );
}

export function prepareWorkOrderSeed(prompt = '', requestedStrategy = 'auto', options = {}) {
  const explicitTaskType = normalizeWorkIntentText(options.taskType || options.task_type || options.selectedTaskType || '');
  const selectedAgentId = normalizeWorkIntentText(options.selectedAgentId || options.selected_agent_id || '');
  const selectedWorker = Boolean(selectedAgentId && explicitTaskType);
  const selectedWorkerIsLeader = selectedWorker && LEADER_TASK_TYPES.has(explicitTaskType);
  const route = explicitTaskType
    ? (selectedWorker && !selectedWorkerIsLeader
        ? {
            ...routeOwnerForCait(explicitTaskType, `Selected worker ${selectedAgentId} for task ${explicitTaskType}; preserving that specialist route for intake and dispatch.`),
            routeHint: 'selected_worker'
          }
        : (leaderTaskTypeForInitialWork(explicitTaskType, prompt)
            ? {
                ...routeOwnerForLeader(
                  leaderTaskTypeForInitialWork(explicitTaskType, prompt),
                  selectedWorker
                    ? `Selected leader ${selectedAgentId} for task ${explicitTaskType}; handing the chat to that leader for intake and dispatch.`
                    : `Selected task ${explicitTaskType}; CAIt is handing the chat to the matching leader.`
                ),
                routeHint: selectedWorker ? 'selected_leader' : 'leader_handoff'
              }
            : routeOwnerForCait(explicitTaskType, `Selected task ${explicitTaskType}; CAIt will choose the best matching specialist agent.`)))
    : inferWorkIntentRoute(prompt);
  const requested = ['single', 'multi'].includes(String(requestedStrategy || '').trim().toLowerCase())
    ? String(requestedStrategy || '').trim().toLowerCase()
    : 'auto';
  let resolvedOrderStrategy = route.strategyHint || 'single';
  if (requested === 'multi') resolvedOrderStrategy = 'multi';
  if (requested === 'single' && route.ownerType !== 'leader') resolvedOrderStrategy = 'single';
  if (route.ownerType === 'leader') resolvedOrderStrategy = 'multi';
  return {
    taskType: route.taskType,
    requestedOrderStrategy: requested,
    resolvedOrderStrategy,
    routeHint: route.routeHint,
    reason: route.reason,
    ownerType: route.ownerType || 'cait',
    activeLeaderTaskType: route.activeLeaderTaskType || '',
    activeLeaderName: route.activeLeaderName || '',
    conversationOwner: route.conversationOwner || { type: 'cait', label: 'CAIt' }
  };
}
