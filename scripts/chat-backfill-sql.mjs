import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve(process.argv[2] || '.data/broker-state.json');
const outPath = resolve(process.argv[3] || '.tmp/chat-transcripts-backfill.sql');

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
const transcripts = Array.isArray(raw?.chatTranscripts) ? raw.chatTranscripts : [];

const columns = [
  'id',
  'kind',
  'prompt',
  'answer',
  'prompt_chars',
  'answer_chars',
  'redacted',
  'answer_kind',
  'status',
  'task_type',
  'source',
  'page_path',
  'tab',
  'visitor_id',
  'logged_in',
  'auth_provider',
  'account_hash',
  'url_count',
  'file_count',
  'file_chars',
  'review_status',
  'expected_handling',
  'improvement_note',
  'reviewed_by',
  'reviewed_at',
  'updated_at',
  'created_at'
];

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function sqlNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : String(fallback);
}

function rowValues(item = {}) {
  return [
    sqlString(item.id || ''),
    sqlString(item.kind || 'work_chat'),
    sqlString(item.prompt || ''),
    sqlString(item.answer || ''),
    sqlNumber(item.promptChars || item.prompt_chars || 0),
    sqlNumber(item.answerChars || item.answer_chars || 0),
    sqlNumber(item.redacted ? 1 : 0),
    sqlString(item.answerKind || item.answer_kind || ''),
    sqlString(item.status || ''),
    sqlString(item.taskType || item.task_type || ''),
    sqlString(item.source || ''),
    sqlString(item.pagePath || item.page_path || ''),
    sqlString(item.tab || ''),
    sqlString(item.visitorId || item.visitor_id || ''),
    sqlNumber(item.loggedIn || item.logged_in ? 1 : 0),
    sqlString(item.authProvider || item.auth_provider || ''),
    sqlString(item.accountHash || item.account_hash || ''),
    sqlNumber(item.urlCount || item.url_count || 0),
    sqlNumber(item.fileCount || item.file_count || 0),
    sqlNumber(item.fileChars || item.file_chars || 0),
    sqlString(item.reviewStatus || item.review_status || 'new'),
    sqlString(item.expectedHandling || item.expected_handling || ''),
    sqlString(item.improvementNote || item.improvement_note || ''),
    sqlString(item.reviewedBy || item.reviewed_by || ''),
    sqlString(item.reviewedAt || item.reviewed_at || ''),
    sqlString(item.updatedAt || item.updated_at || item.createdAt || item.created_at || ''),
    sqlString(item.createdAt || item.created_at || '')
  ];
}

const lines = ['BEGIN TRANSACTION;'];
for (const transcript of transcripts) {
  lines.push(`INSERT OR REPLACE INTO chat_transcripts (${columns.join(',')}) VALUES (${rowValues(transcript).join(',')});`);
}
lines.push('COMMIT;');

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`wrote ${transcripts.length} chat transcripts to ${outPath}`);
