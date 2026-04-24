function normalizeWorkIntentText(prompt = '') {
  return String(prompt || '').trim().toLowerCase();
}

function hasAnyPattern(text = '', patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
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
  if (hasAnyPattern(text, [/(growth|go[-\s]?to[-\s]?market|gtm|acquisition|activation|retention|signup|signups|more users|outreach|community|product hunt|marketing|sales|revenue|集客|登録数|会員登録|ユーザー獲得|マーケ|営業|グロース)/i])) return 'growth';
  if (hasAnyPattern(text, [/(fix|bug|debug|実装|修正|コード|直して|不具合|\bapi\b|server|worker|deploy|billing|\bui\b)/i])) return 'code';
  if (hasAnyPattern(text, [/(research|compare|analysis|investigate|市場|比較|調査|戦略)/i])) return 'research';
  return 'research';
}

export function inferWorkIntentRoute(prompt = '') {
  const taskType = inferWorkIntentTaskType(prompt);
  const text = normalizeWorkIntentText(prompt);
  const repoBackedCode = isRepoBackedCodeIntentText(prompt, taskType);
  if (repoBackedCode) {
    return {
      taskType: 'code',
      strategyHint: 'single',
      routeHint: 'single_agent_code',
      reason: 'Repo-backed coding stays single-agent unless multi-agent routing is explicitly requested.'
    };
  }
  if (['research_team_leader', 'build_team_leader', 'cmo_leader'].includes(taskType)) {
    return {
      taskType,
      strategyHint: 'multi',
      routeHint: 'leader_team',
      reason: 'Leader/team phrasing indicates multi-agent routing.'
    };
  }
  if (hasAnyPattern(text, [/(multiple agents|agent team|team leader|複数エージェント|チームで|leaderでまとめて)/i])) {
    return {
      taskType,
      strategyHint: 'multi',
      routeHint: 'leader_team',
      reason: 'The request explicitly asks for team-style execution.'
    };
  }
  return {
    taskType,
    strategyHint: 'single',
    routeHint: 'single_agent_default',
    reason: 'Defaulting to a single-agent order unless the request clearly needs multi-agent routing.'
  };
}

export function prepareWorkOrderSeed(prompt = '', requestedStrategy = 'auto') {
  const route = inferWorkIntentRoute(prompt);
  const requested = ['single', 'multi'].includes(String(requestedStrategy || '').trim().toLowerCase())
    ? String(requestedStrategy || '').trim().toLowerCase()
    : 'auto';
  let resolvedOrderStrategy = route.strategyHint || 'single';
  if (requested === 'single' || requested === 'multi') resolvedOrderStrategy = requested;
  return {
    taskType: route.taskType,
    requestedOrderStrategy: requested,
    resolvedOrderStrategy,
    routeHint: route.routeHint,
    reason: route.reason
  };
}
