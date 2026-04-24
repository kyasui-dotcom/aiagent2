import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve(process.argv[2] || '.data/broker-state.json');
const outPath = resolve(process.argv[3] || '.tmp/jobs-backfill.sql');

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
const jobs = Array.isArray(raw?.jobs) ? raw.jobs : [];

const columns = [
  'id',
  'parent_agent_id',
  'task_type',
  'prompt',
  'input_json',
  'budget_cap',
  'deadline_sec',
  'priority',
  'status',
  'job_kind',
  'assigned_agent_id',
  'score',
  'usage_json',
  'billing_estimate_json',
  'actual_billing_json',
  'output_json',
  'failure_reason',
  'failure_category',
  'callback_token',
  'dispatch_json',
  'workflow_parent_id',
  'workflow_task',
  'workflow_agent_name',
  'workflow_json',
  'original_prompt',
  'prompt_optimization_json',
  'selection_mode',
  'estimate_window_json',
  'billing_reservation_json',
  'logs_json',
  'created_at',
  'claimed_at',
  'dispatched_at',
  'started_at',
  'last_callback_at',
  'completed_at',
  'failed_at',
  'timed_out_at'
];

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function sqlNullableString(value) {
  return value == null || value === '' ? 'NULL' : sqlString(value);
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

function rowValues(job = {}) {
  return [
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
  ];
}

const lines = ['BEGIN TRANSACTION;'];
for (const job of jobs) {
  lines.push(`INSERT OR REPLACE INTO jobs (${columns.join(',')}) VALUES (${rowValues(job).join(',')});`);
}
lines.push('COMMIT;');

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`wrote ${jobs.length} jobs to ${outPath}`);
