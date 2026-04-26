export const WORK_ACTION_IDS = Object.freeze({
  SHOW_COMMANDS: 'show_commands',
  RESET_CHAT: 'reset_chat',
  RESTORE_BRIEF: 'restore_brief',
  QUEUE_PARALLEL_PLAN: 'queue_parallel_plan',
  OPEN_GOOGLE_LOGIN: 'open_google_login',
  OPEN_GITHUB_LOGIN: 'open_github_login',
  OPEN_LOGOUT: 'open_logout',
  OPEN_PAYMENTS: 'open_payments',
  OPEN_PROVIDER: 'open_provider',
  OPEN_AGENT_CATALOG: 'open_agent_catalog',
  OPEN_AGENT_LISTING: 'open_agent_listing',
  OPEN_API_KEYS: 'open_api_keys',
  OPEN_CLI: 'open_cli',
  OPEN_ACCOUNT_SETTINGS: 'open_account_settings',
  OPEN_FEEDBACK: 'open_feedback',
  OPEN_MARKETING_TIMELINE: 'open_marketing_timeline',
  SET_CLARIFY_MODE: 'set_clarify_mode',
  SET_ORDER_MODE: 'set_order_mode',
  SET_ROUTE_AUTO: 'set_route_auto',
  SET_ROUTE_SINGLE: 'set_route_single',
  SET_ROUTE_MULTI: 'set_route_multi',
  OPEN_DELIVERY_HISTORY: 'open_delivery_history',
  OPEN_ORDER_SETTINGS: 'open_order_settings',
  OPEN_PARALLEL_TOOLS: 'open_parallel_tools'
});

export const APP_SETTING_DEFAULTS = Object.freeze({
  work_order_send_label: 'SEND ORDER',
  work_order_add_constraints_label: 'Add constraints',
  work_order_prepare_label: 'PREPARE ORDER',
  work_chat_send_label: 'SEND CHAT',
  work_order_answer_first_label: 'ANSWER FIRST',
  work_order_revise_label: 'Revise conditions',
  work_order_cancel_label: 'Cancel',
  work_chat_intro_title: 'What would you like to do?',
  work_chat_intro_body: 'Tell CAIt what work you want done. This screen is for preparing and sending work orders to agents. When the brief is ready, press SEND ORDER.'
});

export const WORK_ORDER_UI_LABELS = Object.freeze({
  sendOrder: APP_SETTING_DEFAULTS.work_order_send_label,
  addConstraints: APP_SETTING_DEFAULTS.work_order_add_constraints_label,
  prepareOrder: APP_SETTING_DEFAULTS.work_order_prepare_label,
  sendChat: APP_SETTING_DEFAULTS.work_chat_send_label,
  answerFirst: APP_SETTING_DEFAULTS.work_order_answer_first_label,
  revise: APP_SETTING_DEFAULTS.work_order_revise_label,
  cancel: APP_SETTING_DEFAULTS.work_order_cancel_label
});

export const EXACT_MATCH_ALLOWED_WORK_ACTIONS = Object.freeze([
  WORK_ACTION_IDS.SHOW_COMMANDS,
  WORK_ACTION_IDS.RESET_CHAT,
  WORK_ACTION_IDS.RESTORE_BRIEF,
  WORK_ACTION_IDS.QUEUE_PARALLEL_PLAN,
  WORK_ACTION_IDS.OPEN_GOOGLE_LOGIN,
  WORK_ACTION_IDS.OPEN_GITHUB_LOGIN,
  WORK_ACTION_IDS.OPEN_LOGOUT,
  WORK_ACTION_IDS.OPEN_PAYMENTS,
  WORK_ACTION_IDS.OPEN_PROVIDER,
  WORK_ACTION_IDS.OPEN_AGENT_CATALOG,
  WORK_ACTION_IDS.OPEN_AGENT_LISTING,
  WORK_ACTION_IDS.OPEN_API_KEYS,
  WORK_ACTION_IDS.OPEN_CLI,
  WORK_ACTION_IDS.OPEN_ACCOUNT_SETTINGS,
  WORK_ACTION_IDS.OPEN_FEEDBACK,
  WORK_ACTION_IDS.OPEN_MARKETING_TIMELINE,
  WORK_ACTION_IDS.SET_CLARIFY_MODE,
  WORK_ACTION_IDS.SET_ORDER_MODE,
  WORK_ACTION_IDS.SET_ROUTE_AUTO,
  WORK_ACTION_IDS.SET_ROUTE_SINGLE,
  WORK_ACTION_IDS.SET_ROUTE_MULTI,
  WORK_ACTION_IDS.OPEN_DELIVERY_HISTORY,
  WORK_ACTION_IDS.OPEN_ORDER_SETTINGS,
  WORK_ACTION_IDS.OPEN_PARALLEL_TOOLS
]);

export const WORK_UI_ACTION_DEFINITIONS = Object.freeze({
  confirm_order: { kind: 'order_confirmation' },
  revise_order: { kind: 'order_confirmation' },
  cancel_order: { kind: 'order_confirmation' },
  connect_github: { kind: 'connector' },
  connect_google: { kind: 'connector' },
  connect_x: { kind: 'connector' },
  post_current_to_x: { kind: 'executor' },
  register_card: { kind: 'payment' },
  open_payments: { kind: 'navigation' },
  open_provider: { kind: 'navigation' },
  open_api_keys: { kind: 'navigation' },
  open_cli_tab: { kind: 'navigation' },
  open_settings: { kind: 'navigation' },
  open_feedback_tab: { kind: 'navigation' },
  open_work_tab: { kind: 'navigation' },
  browse_agents: { kind: 'navigation' },
  list_agent: { kind: 'navigation' },
  use_agent_team: { kind: 'routing_preference' }
});

export const WORK_COMMAND_COPY = Object.freeze({
  open_google_login: {
    ja: 'Google ログインを開きます。通常の注文、支払い、請求管理に使います。',
    en: 'Opening Google sign-in. Use it for ordering, payments, and billing management.',
    status: 'Opening Google sign-in.\n\nNo order was created and no billing occurred.'
  },
  open_github_login: {
    ja: 'GitHub ログイン/連携を開きます。エージェント登録、repo連携、提供者フローに使います。',
    en: 'Opening GitHub sign-in/linking. Use it for agent publishing, repo access, and provider flows.',
    status: 'Opening GitHub sign-in.\n\nNo order was created and no billing occurred.'
  },
  open_logout: {
    ja: 'ログアウト/セッションリセットを実行します。',
    en: 'Running logout/session reset.',
    status: 'Logging out.\n\nNo order was created and no billing occurred.'
  },
  open_payments: {
    ja: '支払いまわりは SETTINGS の PAYMENTS で確認してください。カード登録、プラン、支払い履歴はそこで管理します。',
    en: 'For billing, go to SETTINGS > PAYMENTS. Manage card registration, plan, and payment history there.',
    status: 'Go to SETTINGS > PAYMENTS.\n\nNo order was created and no billing occurred.'
  },
  open_provider: {
    ja: '提供者まわりは SETTINGS の PROVIDER で確認してください。プロフィールと収益受け取りの準備状況はそこで管理します。',
    en: 'For provider setup, go to SETTINGS > PROVIDER. Manage profile and payout readiness there.',
    status: 'Go to SETTINGS > PROVIDER.\n\nNo order was created and no billing occurred.'
  },
  open_agent_catalog: {
    ja: '使えるエージェントは AGENTS タブで見てください。そこから Work Chat にピン留めできます。',
    en: 'Browse available agents from the AGENTS tab. You can pin one into Work Chat there.',
    status: 'Go to the AGENTS tab.\n\nNo order was created and no billing occurred.'
  },
  open_agent_listing: {
    ja: 'エージェントを登録したい意図なら、AGENTS タブへ行ってください。repo 選択、manifest 生成、PR、import、verify の順です。',
    en: 'If the intent is to register an agent, go to the AGENTS tab. Continue there with repo selection, manifest generation, PR, import, and verify.',
    status: 'Go to the AGENTS tab for listing.\n\nNo order was created and no billing occurred.'
  },
  open_api_keys: {
    ja: 'API key は SETTINGS の KEYS で発行・管理してください。注文、エージェント登録、CLI/API で使います。',
    en: 'For API keys, go to SETTINGS > KEYS. Issue and manage the CAIt API key there.',
    status: 'Go to SETTINGS > KEYS.\n\nNo order was created and no billing occurred.'
  },
  open_cli: {
    ja: 'CLI / API 情報は CONNECT タブで見てください。CAIt API key と /api/jobs の使い方を確認できます。',
    en: 'For CLI / API docs, go to the CONNECT tab. You can inspect CAIt API key usage and /api/jobs examples there.',
    status: 'Go to the CONNECT tab.\n\nNo order was created and no billing occurred.'
  },
  open_account_settings: {
    ja: 'アカウント設定は SETTINGS タブで管理してください。支払い、提供者設定、APIキー、レポートがあります。',
    en: 'Go to the SETTINGS tab for account settings. Manage billing, provider setup, API keys, and reports there.',
    status: 'Go to the SETTINGS tab.\n\nNo order was created and no billing occurred.'
  },
  open_feedback: {
    ja: '問い合わせや不具合報告は SETTINGS の REPORTS から送ってください。タイトルと内容を書いて送信できます。',
    en: 'For bug reports or requests, go to SETTINGS > REPORTS. Add a title and message there.',
    status: 'Go to SETTINGS > REPORTS.\n\nNo order was created and no billing occurred.'
  },
  open_delivery_history: {
    ja: '注文履歴と納品は WORK タブで確認してください。完了した注文、納品、フォローアップをそこで見られます。',
    en: 'Go to the WORK tab for order history and delivery. Review completed orders, deliveries, and follow-up actions there.',
    status: 'Go to the WORK tab.\n\nNo order was created and no billing occurred.'
  },
  open_marketing_timeline: {
    ja: '保存済みの Work timeline を開きます。完了済み run、今後の scheduled action、再実行候補をここで確認できます。',
    en: 'Opening the stored Work timeline. You can inspect completed runs, upcoming scheduled actions, and restart candidates there.',
    status: 'Opening Work timeline.\n\nNo order was created and no billing occurred.'
  },
  open_order_settings: {
    ja: 'URL、ファイル、エージェント指定、並列注文は ORDER SETTINGS で設定してください。',
    en: 'Use ORDER SETTINGS for URLs, files, pinned agent, and parallel order settings.',
    status: 'Open ORDER SETTINGS when needed.\n\nNo order was created and no billing occurred.'
  },
  open_parallel_tools: {
    ja: '並列ワークは ORDER SETTINGS の中で設定してください。複数の独立した依頼をキューに入れてまとめて送れます。',
    en: 'Use the parallel work tools inside ORDER SETTINGS. Queue several independent requests and send them together.',
    status: 'Use ORDER SETTINGS for parallel work.\n\nNo order was created and no billing occurred.'
  },
  set_clarify_mode: {
    ja: 'PLAN mode に切り替えます。質問、整理、draft作成まではできますが、このモードでは有料注文を作りません。',
    en: 'Switching to PLAN mode. I can ask questions, refine, and prepare drafts, but this mode will not create paid orders.',
    status: 'PLAN mode enabled.\n\nNo order was created and no billing occurred.'
  },
  set_order_mode: {
    ja: 'ORDER mode に切り替えます。発注文が準備できたら、確認後に SEND ORDER できます。',
    en: 'Switching to ORDER mode. Once the brief is ready, SEND ORDER can dispatch paid work after confirmation.',
    status: 'ORDER mode enabled.\n\nNo order was created and no billing occurred.'
  },
  set_route_auto: {
    ja: 'ルートを AUTO に戻します。内容に応じて CAIt が通常エージェントかリーダーエージェントかを選びます。',
    en: 'Route set to AUTO. CAIt will choose a Specialist Agent or Leader Agent based on the request.',
    status: 'Route set to AUTO.\n\nNo order was created and no billing occurred.'
  },
  set_route_single: {
    ja: 'ルートを Specialist Agent 優先にします。低コストで、1つの通常エージェントに任せる想定です。',
    en: 'Route set to Specialist Agent. This favors a lower-cost single specialist when the task is focused.',
    status: 'Route set to Specialist Agent.\n\nNo order was created and no billing occurred.'
  },
  set_route_multi: {
    ja: 'ルートを Leader Agent 優先にします。複数領域の整理、分担、統合が必要な依頼に向いています。',
    en: 'Route set to Leader Agent. This favors planning, delegation, and synthesis across multiple specialties.',
    status: 'Route set to Leader Agent.\n\nNo order was created and no billing occurred.'
  }
});

export const WORK_COMMAND_BUTTON_ACTIONS = Object.freeze({
  open_payments: [{ action: 'open_payments', labelJa: 'PAYMENTS を開く', labelEn: 'OPEN PAYMENTS' }],
  open_provider: [{ action: 'open_provider', labelJa: 'PROVIDER を開く', labelEn: 'OPEN PROVIDER' }],
  open_agent_catalog: [{ action: 'browse_agents', labelJa: 'AGENTS を開く', labelEn: 'OPEN AGENTS' }],
  open_agent_listing: [{ action: 'list_agent', labelJa: 'AGENTS で登録する', labelEn: 'GO TO AGENTS' }],
  open_api_keys: [{ action: 'open_api_keys', labelJa: 'KEYS を開く', labelEn: 'OPEN KEYS' }],
  open_cli: [{ action: 'open_cli_tab', labelJa: 'CONNECT を開く', labelEn: 'OPEN CONNECT' }],
  open_account_settings: [{ action: 'open_settings', labelJa: 'SETTINGS を開く', labelEn: 'OPEN SETTINGS' }],
  open_feedback: [{ action: 'open_feedback_tab', labelJa: 'REPORTS を開く', labelEn: 'OPEN REPORTS' }],
  open_delivery_history: [{ action: 'open_work_tab', labelJa: 'WORK を開く', labelEn: 'OPEN WORK' }],
  open_marketing_timeline: [{ action: 'open_marketing_timeline', labelJa: 'TIMELINE を開く', labelEn: 'OPEN TIMELINE' }],
  open_order_settings: [{ action: 'open_order_settings', labelJa: 'ORDER SETTINGS', labelEn: 'ORDER SETTINGS' }]
});

const SLASH_NAME_TO_ACTION = Object.freeze({
  help: 'show_commands',
  commands: 'show_commands',
  '?': 'show_commands',
  plan: 'set_clarify_mode',
  clarify: 'set_clarify_mode',
  'ask-first': 'set_clarify_mode',
  order: 'set_order_mode',
  execute: 'set_order_mode',
  dispatch: 'set_order_mode',
  run: 'set_order_mode',
  sources: 'open_order_settings',
  files: 'open_order_settings',
  urls: 'open_order_settings',
  'order-settings': 'open_order_settings',
  parallel: 'open_parallel_tools',
  'multi-work': 'open_parallel_tools',
  'queue-parallel': 'queue_parallel_plan',
  queue: 'queue_parallel_plan',
  'add-parallel': 'queue_parallel_plan',
  restore: 'restore_brief',
  'copy-brief': 'restore_brief',
  brief: 'restore_brief',
  history: 'open_delivery_history',
  delivery: 'open_delivery_history',
  orders: 'open_delivery_history',
  login: 'open_google_login',
  google: 'open_google_login',
  'login-google': 'open_google_login',
  github: 'open_github_login',
  'login-github': 'open_github_login',
  'connect-github': 'open_github_login',
  logout: 'open_logout',
  signout: 'open_logout',
  reset: 'reset_chat',
  new: 'reset_chat'
});

const WORK_COMMAND_PATTERNS = Object.freeze([
  { action: 'open_github_login', patterns: [/^(github login|github sign in|connect github|github連携|githubログイン|git hub連携)$/i, /(?:github|git hub).*(?:ログイン|sign in|login|連携|link|connect|認証|authorize|refresh)/i] },
  { action: 'open_google_login', patterns: [/^(login|sign in|google login|google sign in|ログイン|サインイン|googleログイン|googleでログイン)$/i, /(?:google|ログイン|サインイン|sign in|login).*(?:したい|する|開|open|連携|link)/i] },
  { action: 'open_logout', patterns: [/^(logout|log out|sign out|ログアウト|サインアウト)$/i, /(?:ログアウト|サインアウト|log out|sign out).*(?:したい|する)/i] },
  { action: 'reset_chat', patterns: [/^(reset|clear|clear chat|new topic|start over|リセット|クリア|やり直し|最初から|新規|別件|チャット消して|チャットを消して)$/i, /^(cancel|cancel order|キャンセル|中止|やめる)$/i] },
  { action: 'set_clarify_mode', patterns: [/^(clarify mode|clarification mode|ask first mode|question mode|確認モード|質問モード|整理モード|クラリファイモード)$/i, /(?:clarify|clarification|ask first|question|確認|質問|整理|ヒアリング).*(?:mode|モード).*(?:on|切替|変更|して|にして)?/i] },
  { action: 'set_order_mode', patterns: [/^(order mode|dispatch mode|send order mode|注文モード|発注モード|実行モード|オーダーモード)$/i, /(?:order|dispatch|send order|注文|発注|実行|オーダー).*(?:mode|モード).*(?:on|切替|変更|して|にして)?/i] },
  { action: 'restore_brief', patterns: [/^(copy brief|copy order|restore brief|restore order|発注文をコピー|発注文コピー|ブリーフコピー|発注文を戻して|ブリーフを戻して|コピー)$/i, /(?:発注文|ブリーフ|brief|order).*(?:コピー|copy|戻|restore|入力欄)/i] },
  { action: 'open_delivery_history', patterns: [/^(orders|order history|delivery|deliveries|注文履歴|納品|納品確認|履歴)$/i, /(?:order|orders|delivery|deliveries|注文|納品|履歴|結果).*(?:見る|見たい|確認|開|open|探|inspect)/i] },
  { action: 'open_marketing_timeline', patterns: [/^(work timeline|run history|agent work history|stored timeline|実行履歴|workタイムライン|タイムライン履歴)$/i] },
  { action: 'open_order_settings', patterns: [/^(open order settings|order settings|source settings|詳細設定|歯車|ソースを追加|urlを追加|ファイルを追加)$/i, /(?:url|file|ファイル|source|ソース|添付|歯車).*(?:追加|入れ|開|open|移動|ジャンプ)/i] },
  { action: 'queue_parallel_plan', patterns: [/^(queue parallel|add parallel|add to parallel queue|queue these|並列キューに追加|キューに追加|並列に追加|これを並列に追加)$/i, /(?:parallel|並列).*(?:queue|キュー|追加|add)/i] },
  { action: 'open_parallel_tools', patterns: [/^(open parallel|parallel orders|並列を開いて|複数work|複数注文)$/i, /(?:parallel|並列|複数|まとめて).*(?:開|open|発注|注文|order|work)/i] }
]);

export function normalizeWorkActionPhrase(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function matchSlashWorkAction(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text.startsWith('/')) return '';
  const parts = text.slice(1).trim().split(/\s+/).filter(Boolean);
  const name = String(parts[0] || '').toLowerCase().replace(/_/g, '-');
  const arg = String(parts[1] || '').toLowerCase().replace(/_/g, '-');
  if (!name) return 'show_commands';
  if (name === 'mode') {
    if (['order', 'execute', 'dispatch', 'run'].includes(arg)) return 'set_order_mode';
    return 'set_clarify_mode';
  }
  if (['route', 'agent-route', 'target'].includes(name)) {
    if (['leader', 'team', 'multi', 'manager', 'orchestrator'].includes(arg)) return 'set_route_multi';
    if (['specialist', 'single', 'worker', 'normal', 'agent'].includes(arg)) return 'set_route_single';
    return 'set_route_auto';
  }
  return SLASH_NAME_TO_ACTION[name] || 'show_commands';
}

export function exactWorkActionRuleForPrompt(prompt = '', exactActions = []) {
  const normalized = normalizeWorkActionPhrase(prompt);
  if (!normalized) return null;
  return (Array.isArray(exactActions) ? exactActions : []).find((rule) => normalizeWorkActionPhrase(rule?.normalizedPhrase || rule?.phrase || '') === normalized) || null;
}

export function isDeveloperExecutionIntentText(prompt = '') {
  const compact = String(prompt || '').replace(/\s+/g, ' ').trim();
  return /(github|git hub|repo|repository|pull request|\bpr\b|branch|commit|diff|sandbox|code|coding|debug|fix|bug|修正|直して|実装|デバッグ|コード|プルリク|リポジトリ|ブランチ|コミット|差分|サンドボックス)/i.test(compact)
    && !/^(feedback|report issue|bug report|contact|問い合わせ|バグ報告|不具合報告|要望|問い合わせフォーム)$/i.test(compact)
    && !/(?:feedback|report issue|bug report|問い合わせ|バグ報告|不具合報告|要望|問い合わせフォーム).*(?:送|出|報告|開|open|書きたい|したい)/i.test(compact);
}

export function resolveStaticWorkAction(prompt = '', options = {}) {
  const text = String(prompt || '').trim();
  if (!text) return '';
  const compact = text.replace(/\s+/g, ' ').trim();
  const slash = matchSlashWorkAction(compact);
  if (slash) return slash;
  const exactRule = exactWorkActionRuleForPrompt(compact, options.exactActions || []);
  if (exactRule?.action) return exactRule.action;
  for (const entry of WORK_COMMAND_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(compact))) return entry.action;
  }
  return '';
}

export function commandCopyForWorkAction(action = '') {
  return WORK_COMMAND_COPY[String(action || '').trim()] || null;
}

export function buttonActionsForWorkCommand(action = '', ja = false) {
  return (WORK_COMMAND_BUTTON_ACTIONS[String(action || '').trim()] || []).map((item) => ({
    action: item.action,
    label: ja ? item.labelJa : item.labelEn
  }));
}

export function isKnownWorkUiAction(action = '') {
  return Boolean(WORK_UI_ACTION_DEFINITIONS[String(action || '').trim()]);
}
