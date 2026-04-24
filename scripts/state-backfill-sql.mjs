import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve(process.argv[2] || '.data/broker-state.json');
const outPath = resolve(process.argv[3] || '.tmp/state-backfill.sql');

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function sqlNullableString(value) {
  return value == null || value === '' ? 'NULL' : sqlString(value);
}

function sqlNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : String(fallback);
}

function sqlNullableNumber(value) {
  if (value == null || value === '') return 'NULL';
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : 'NULL';
}

function jsonValue(value, fallback) {
  try {
    return JSON.stringify(value == null ? fallback : value);
  } catch {
    return JSON.stringify(fallback);
  }
}

const lines = [];

const agents = Array.isArray(raw.agents) ? raw.agents : [];
for (const agent of agents) {
  const metadata = {
    ...(agent.metadata || {}),
    __verification: {
      status: agent.verificationStatus || null,
      checkedAt: agent.verificationCheckedAt || null,
      error: agent.verificationError || null,
      details: agent.verificationDetails || null
    }
  };
  lines.push(`INSERT OR REPLACE INTO agents (id,name,description,task_types,premium_rate,basic_rate,success_rate,avg_latency_sec,online,owner,manifest_url,manifest_source,token,earnings,metadata_json,created_at,updated_at) VALUES (${[
    sqlString(agent.id || ''),
    sqlString(agent.name || ''),
    sqlString(agent.description || ''),
    sqlString(jsonValue(agent.taskTypes || [], [])),
    sqlNumber(agent.providerMarkupRate ?? agent.tokenMarkupRate ?? agent.creatorFeeRate ?? agent.premiumRate ?? 0.1, 0.1),
    sqlNumber(agent.platformMarginRate ?? agent.marketplaceFeeRate ?? agent.basicRate ?? 0.1, 0.1),
    sqlNumber(agent.successRate ?? 0.9, 0.9),
    sqlNumber(agent.avgLatencySec ?? 20, 20),
    sqlNumber(agent.online ? 1 : 0),
    sqlNullableString(agent.owner || null),
    sqlNullableString(agent.manifestUrl || null),
    sqlNullableString(agent.manifestSource || null),
    sqlNullableString(agent.token || null),
    sqlNumber(agent.earnings ?? 0, 0),
    sqlString(jsonValue(metadata, {})),
    sqlString(agent.createdAt || agent.created_at || ''),
    sqlString(agent.updatedAt || agent.updated_at || agent.createdAt || agent.created_at || '')
  ].join(',')});`);
}

const accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
for (const account of accounts) {
  lines.push(`INSERT OR REPLACE INTO accounts (id,login,profile_json,created_at,updated_at) VALUES (${[
    sqlString(account.id || ''),
    sqlString(account.login || ''),
    sqlString(jsonValue(account, {})),
    sqlString(account.createdAt || account.created_at || ''),
    sqlString(account.updatedAt || account.updated_at || account.createdAt || account.created_at || '')
  ].join(',')});`);
}

const jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
for (const job of jobs) {
  lines.push(`INSERT OR REPLACE INTO jobs (id,parent_agent_id,task_type,prompt,input_json,budget_cap,deadline_sec,priority,status,job_kind,assigned_agent_id,score,usage_json,billing_estimate_json,actual_billing_json,output_json,failure_reason,failure_category,callback_token,dispatch_json,workflow_parent_id,workflow_task,workflow_agent_name,workflow_json,executor_state_json,original_prompt,prompt_optimization_json,selection_mode,estimate_window_json,billing_reservation_json,logs_json,created_at,claimed_at,dispatched_at,started_at,last_callback_at,completed_at,failed_at,timed_out_at) VALUES (${[
    sqlString(job.id || ''),
    sqlString(job.parentAgentId || ''),
    sqlString(job.taskType || ''),
    sqlString(job.prompt || ''),
    sqlString(jsonValue(job.input || {}, {})),
    sqlNullableNumber(job.budgetCap),
    sqlNullableNumber(job.deadlineSec),
    sqlString(job.priority || 'normal'),
    sqlString(job.status || ''),
    sqlNullableString(job.jobKind || null),
    sqlNullableString(job.assignedAgentId || null),
    sqlNullableNumber(job.score),
    sqlNullableString(jsonValue(job.usage ?? null, null)),
    sqlNullableString(jsonValue(job.billingEstimate ?? null, null)),
    sqlNullableString(jsonValue(job.actualBilling ?? null, null)),
    sqlNullableString(jsonValue(job.output ?? null, null)),
    sqlNullableString(job.failureReason || null),
    sqlNullableString(job.failureCategory || null),
    sqlNullableString(job.callbackToken || null),
    sqlNullableString(jsonValue(job.dispatch ?? null, null)),
    sqlNullableString(job.workflowParentId || null),
    sqlNullableString(job.workflowTask || null),
    sqlNullableString(job.workflowAgentName || null),
    sqlNullableString(jsonValue(job.workflow ?? null, null)),
    sqlNullableString(jsonValue(job.executorState ?? null, null)),
    sqlNullableString(job.originalPrompt || null),
    sqlNullableString(jsonValue(job.promptOptimization ?? null, null)),
    sqlNullableString(job.selectionMode || null),
    sqlNullableString(jsonValue(job.estimateWindow ?? null, null)),
    sqlNullableString(jsonValue(job.billingReservation ?? null, null)),
    sqlNullableString(jsonValue(job.logs ?? [], [])),
    sqlString(job.createdAt || ''),
    sqlNullableString(job.claimedAt || null),
    sqlNullableString(job.dispatchedAt || null),
    sqlNullableString(job.startedAt || null),
    sqlNullableString(job.lastCallbackAt || null),
    sqlNullableString(job.completedAt || null),
    sqlNullableString(job.failedAt || null),
    sqlNullableString(job.timedOutAt || null)
  ].join(',')});`);
}

const events = Array.isArray(raw.events) ? raw.events : [];
for (const event of events) {
  lines.push(`INSERT OR REPLACE INTO events (id,type,message,meta_json,created_at) VALUES (${[
    sqlString(event.id || ''),
    sqlString(event.type || ''),
    sqlString(event.message || ''),
    sqlString(jsonValue(event.meta || {}, {})),
    sqlString(event.ts || event.createdAt || event.created_at || '')
  ].join(',')});`);
}

const feedbackReports = Array.isArray(raw.feedbackReports) ? raw.feedbackReports : [];
for (const report of feedbackReports) {
  lines.push(`INSERT OR REPLACE INTO feedback_reports (id,type,status,title,message,email,reporter_login,reviewed_by,reviewed_at,resolution_note,context_json,created_at,updated_at) VALUES (${[
    sqlString(report.id || ''),
    sqlString(report.type || ''),
    sqlString(report.status || 'open'),
    sqlString(report.title || ''),
    sqlString(report.message || ''),
    sqlNullableString(report.email || null),
    sqlNullableString(report.reporterLogin || null),
    sqlNullableString(report.reviewedBy || null),
    sqlNullableString(report.reviewedAt || null),
    sqlNullableString(report.resolutionNote || null),
    sqlString(jsonValue(report.context || {}, {})),
    sqlString(report.createdAt || report.created_at || ''),
    sqlString(report.updatedAt || report.updated_at || report.createdAt || report.created_at || '')
  ].join(',')});`);
}

const transcripts = Array.isArray(raw.chatTranscripts) ? raw.chatTranscripts : [];
for (const item of transcripts) {
  lines.push(`INSERT OR REPLACE INTO chat_transcripts (id,kind,prompt,answer,prompt_chars,answer_chars,redacted,answer_kind,status,task_type,source,page_path,tab,session_id,visitor_id,logged_in,auth_provider,account_hash,url_count,file_count,file_chars,review_status,expected_handling,improvement_note,reviewed_by,reviewed_at,updated_at,created_at) VALUES (${[
    sqlString(item.id || ''),
    sqlString(item.kind || 'work_chat'),
    sqlString(item.prompt || ''),
    sqlString(item.answer || ''),
    sqlNumber(item.promptChars || item.prompt_chars || 0),
    sqlNumber(item.answerChars || item.answer_chars || 0),
    sqlNumber(item.redacted ? 1 : 0),
    sqlNullableString(item.answerKind || item.answer_kind || null),
    sqlNullableString(item.status || null),
    sqlNullableString(item.taskType || item.task_type || null),
    sqlNullableString(item.source || null),
    sqlNullableString(item.pagePath || item.page_path || null),
    sqlNullableString(item.tab || null),
    sqlNullableString(item.sessionId || item.session_id || null),
    sqlNullableString(item.visitorId || item.visitor_id || null),
    sqlNumber(item.loggedIn || item.logged_in ? 1 : 0),
    sqlNullableString(item.authProvider || item.auth_provider || null),
    sqlNullableString(item.accountHash || item.account_hash || null),
    sqlNumber(item.urlCount || item.url_count || 0),
    sqlNumber(item.fileCount || item.file_count || 0),
    sqlNumber(item.fileChars || item.file_chars || 0),
    sqlString(item.reviewStatus || item.review_status || 'new'),
    sqlNullableString(item.expectedHandling || item.expected_handling || null),
    sqlNullableString(item.improvementNote || item.improvement_note || null),
    sqlNullableString(item.reviewedBy || item.reviewed_by || null),
    sqlNullableString(item.reviewedAt || item.reviewed_at || null),
    sqlString(item.updatedAt || item.updated_at || item.createdAt || item.created_at || ''),
    sqlString(item.createdAt || item.created_at || '')
  ].join(',')});`);
}

const recurringOrders = Array.isArray(raw.recurringOrders) ? raw.recurringOrders : [];
for (const order of recurringOrders) {
  lines.push(`INSERT OR REPLACE INTO recurring_orders (id,owner_login,status,schedule_json,payload_json,runs_attempted,max_runs,next_run_at,last_run_at,last_job_id,last_error,created_at,updated_at) VALUES (${[
    sqlString(order.id || ''),
    sqlString(order.ownerLogin || order.owner_login || ''),
    sqlString(order.status || 'active'),
    sqlString(jsonValue(order.schedule || {}, {})),
    sqlString(jsonValue(order, {})),
    sqlNumber(order.runsAttempted ?? order.runs_attempted ?? 0),
    sqlNumber(order.maxRuns ?? order.max_runs ?? 0),
    sqlNullableString(order.nextRunAt || order.next_run_at || null),
    sqlNullableString(order.lastRunAt || order.last_run_at || null),
    sqlNullableString(order.lastJobId || order.last_job_id || null),
    sqlNullableString(order.lastError || order.last_error || null),
    sqlString(order.createdAt || order.created_at || ''),
    sqlString(order.updatedAt || order.updated_at || order.createdAt || order.created_at || '')
  ].join(',')});`);
}

const emailDeliveries = Array.isArray(raw.emailDeliveries) ? raw.emailDeliveries : [];
for (const delivery of emailDeliveries) {
  lines.push(`INSERT OR REPLACE INTO email_deliveries (id,account_login,recipient_email,sender_email,subject,template,provider,status,provider_message_id,payload_json,response_json,error_text,created_at,updated_at) VALUES (${[
    sqlString(delivery.id || ''),
    sqlNullableString(delivery.accountLogin || delivery.account_login || null),
    sqlString(delivery.recipientEmail || delivery.recipient_email || ''),
    sqlNullableString(delivery.senderEmail || delivery.sender_email || null),
    sqlString(delivery.subject || ''),
    sqlNullableString(delivery.template || null),
    sqlString(delivery.provider || 'resend'),
    sqlString(delivery.status || 'queued'),
    sqlNullableString(delivery.providerMessageId || delivery.provider_message_id || null),
    sqlString(jsonValue(delivery.payload ?? {}, {})),
    sqlString(jsonValue(delivery.response ?? {}, {})),
    sqlNullableString(delivery.errorText || delivery.error_text || null),
    sqlString(delivery.createdAt || delivery.created_at || ''),
    sqlString(delivery.updatedAt || delivery.updated_at || delivery.createdAt || delivery.created_at || '')
  ].join(',')});`);
}

const exactMatchActions = Array.isArray(raw.exactMatchActions) ? raw.exactMatchActions : [];
for (const action of exactMatchActions) {
  const phrase = String(action.phrase || '').trim();
  const normalizedPhrase = String(action.normalizedPhrase || phrase).trim().replace(/\s+/g, ' ').toLowerCase();
  lines.push(`INSERT OR REPLACE INTO exact_match_actions (id,phrase,normalized_phrase,action,enabled,source,notes,created_at,updated_at) VALUES (${[
    sqlString(action.id || `exact_${normalizedPhrase.replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, '_') || 'rule'}`),
    sqlString(phrase),
    sqlString(normalizedPhrase),
    sqlString(action.action || ''),
    sqlNumber(action.enabled === false ? 0 : 1),
    sqlNullableString(action.source || null),
    sqlNullableString(action.notes || null),
    sqlString(action.createdAt || action.created_at || ''),
    sqlString(action.updatedAt || action.updated_at || action.createdAt || action.created_at || '')
  ].join(',')});`);
}

const appSettings = Array.isArray(raw.appSettings) ? raw.appSettings : [];
for (const setting of appSettings) {
  lines.push(`INSERT OR REPLACE INTO app_settings (key,value,source,created_at,updated_at) VALUES (${[
    sqlString(setting.key || ''),
    sqlString(setting.value ?? ''),
    sqlNullableString(setting.source || null),
    sqlString(setting.createdAt || setting.created_at || ''),
    sqlString(setting.updatedAt || setting.updated_at || setting.createdAt || setting.created_at || '')
  ].join(',')});`);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`wrote state backfill SQL to ${outPath}`);
console.log(JSON.stringify({
  agents: agents.length,
  accounts: accounts.length,
  jobs: jobs.length,
  events: events.length,
  feedbackReports: feedbackReports.length,
  chatTranscripts: transcripts.length,
  recurringOrders: recurringOrders.length,
  emailDeliveries: emailDeliveries.length,
  exactMatchActions: exactMatchActions.length,
  appSettings: appSettings.length
}, null, 2));
