import { spawn } from 'node:child_process';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://aiagent-marketplace.net';
const DEFAULT_PARENT_AGENT_ID = 'cloudcode-main';
const DEFAULT_LOCAL_COMMAND_ALLOWLIST = [
  'git',
  'node',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'python',
  'python3',
  'py',
  'pytest',
  'uv',
  'pip',
  'pip3',
  'ruff',
  'eslint',
  'vitest',
  'jest'
];

function envValue(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function usage() {
  return `CAIt external chat bridge

Use this to test an external chat integration from the command line.

Setup:
  1. Open CAIt Web UI > SETTINGS > KEYS
  2. Issue a CAIt API key
  3. Store it only in your shell/backend environment

PowerShell:
  $env:CAIT_API_KEY="ai2k_..."
  $env:CAIT_BASE_URL="${DEFAULT_BASE_URL}"

Commands:
  npm run cait -- send "Compare used iPhone resale routes in Japan"
  npm run cait -- send --watch "Compare used iPhone resale routes in Japan"
  npm run cait -- watch <job_id>
  npm run cait -- follow-up <job_id> "Focus on Japan and include sources"
  npm run cait -- run-local --cwd C:\\path\\to\\repo -- git status
  npm run cait -- send --task seo --strategy auto "Plan a launch post and SEO brief"
  npm run cait -- send --skip-intake "Broad request, run it anyway"
  npm run cait -- list
  npm run cait -- get <job_id>

Env:
  CAIT_API_KEY         required for API calls
  CAIT_BASE_URL        default: ${DEFAULT_BASE_URL}
  CAIT_TASK_TYPE       default: research
  CAIT_AGENT_ID        optional deterministic target agent
  CAIT_ORDER_STRATEGY  default: auto
  CAIT_SKIP_INTAKE     true/false
  CAIT_WATCH_INTERVAL  seconds, default: 5
  CAIT_WATCH_TIMEOUT   seconds, default: 900
  CAIT_LOCAL_ALLOW_COMMANDS comma-separated allowlist for run-local
  CAIT_LOCAL_ALLOW_CWDS     comma-separated allowed root directories for run-local
`;
}

function parseArgs(argv = []) {
  const args = [...argv];
  const command = String(args.shift() || 'help').toLowerCase();
  const options = {
    command,
    taskType: envValue('CAIT_TASK_TYPE', 'research'),
    agentId: envValue('CAIT_AGENT_ID'),
    strategy: envValue('CAIT_ORDER_STRATEGY', 'auto'),
    skipIntake: ['1', 'true', 'yes', 'on'].includes(envValue('CAIT_SKIP_INTAKE').toLowerCase()),
    watch: false,
    watchIntervalSeconds: Math.max(1, Number(envValue('CAIT_WATCH_INTERVAL', '5')) || 5),
    watchTimeoutSeconds: Math.max(5, Number(envValue('CAIT_WATCH_TIMEOUT', '900')) || 900),
    targetId: '',
    localCwd: '',
    promptParts: []
  };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--task' || arg === '--task-type') {
      options.taskType = String(args.shift() || '').trim() || options.taskType;
    } else if (arg === '--agent-id') {
      options.agentId = String(args.shift() || '').trim();
    } else if (arg === '--strategy') {
      options.strategy = String(args.shift() || '').trim() || options.strategy;
    } else if (arg === '--skip-intake') {
      options.skipIntake = true;
    } else if (arg === '--watch') {
      options.watch = true;
    } else if (arg === '--interval') {
      options.watchIntervalSeconds = Math.max(1, Number(args.shift() || options.watchIntervalSeconds) || options.watchIntervalSeconds);
    } else if (arg === '--timeout') {
      options.watchTimeoutSeconds = Math.max(5, Number(args.shift() || options.watchTimeoutSeconds) || options.watchTimeoutSeconds);
    } else if (arg === '--cwd' || arg === '--workdir') {
      options.localCwd = String(args.shift() || '').trim();
    } else if (!options.targetId && ['get', 'watch', 'follow-up', 'followup'].includes(options.command)) {
      options.targetId = String(arg || '').trim();
    } else {
      options.promptParts.push(arg);
    }
  }
  options.prompt = options.promptParts.join(' ').trim();
  options.promptTokens = [...options.promptParts];
  return options;
}

function requireApiKey() {
  const token = envValue('CAIT_API_KEY');
  if (!token) {
    throw new Error('CAIT_API_KEY is required. Issue a CAIt API key in SETTINGS > KEYS and set it in your shell/backend env.');
  }
  return token;
}

function apiUrl(path = '') {
  const base = envValue('CAIT_BASE_URL', DEFAULT_BASE_URL).replace(/\/+$/, '');
  return `${base}${path}`;
}

async function requestJson(path, options = {}) {
  const token = requireApiKey();
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!response.ok) {
    const message = body?.error || body?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function unwrapJobPayload(value = {}) {
  if (value?.job && typeof value.job === 'object') return value.job;
  if (value && typeof value === 'object' && value.id && value.status) return value;
  return null;
}

function isTerminalJobStatus(status = '') {
  return ['completed', 'failed', 'timed_out'].includes(String(status || '').trim().toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function localCommandAllowlist() {
  const configured = envValue('CAIT_LOCAL_ALLOW_COMMANDS');
  const values = configured
    ? configured.split(',').map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    : DEFAULT_LOCAL_COMMAND_ALLOWLIST;
  return new Set(values);
}

function localAllowedRoots() {
  const configured = envValue('CAIT_LOCAL_ALLOW_CWDS');
  const values = (configured
    ? configured.split(',')
    : [process.cwd()])
    .map((item) => path.resolve(String(item || '').trim()))
    .filter(Boolean);
  return [...new Set(values)];
}

function pathWithinRoot(targetPath = '', rootPath = '') {
  const target = path.resolve(targetPath);
  const root = path.resolve(rootPath);
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateLocalExecution(command = '', cwd = '') {
  const normalizedCommand = String(command || '').trim().toLowerCase();
  if (!normalizedCommand) throw new Error('Local command is required.');
  if (!localCommandAllowlist().has(normalizedCommand)) {
    throw new Error(`Local command "${command}" is not allowed. Configure CAIT_LOCAL_ALLOW_COMMANDS if needed.`);
  }
  const resolvedCwd = path.resolve(cwd || process.cwd());
  const allowedRoots = localAllowedRoots();
  if (!allowedRoots.some((root) => pathWithinRoot(resolvedCwd, root))) {
    throw new Error(`Working directory is outside the allowed roots. Allowed roots: ${allowedRoots.join(', ')}`);
  }
  return { command: normalizedCommand, cwd: resolvedCwd, allowedRoots };
}

async function runLocalCommand(tokens = [], options = {}) {
  const commandTokens = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  if (!commandTokens.length) {
    throw new Error('Local command is required. Example: npm run cait -- run-local --cwd C:\\path\\to\\repo -- git status');
  }
  const [command, ...args] = commandTokens;
  const validated = validateLocalExecution(command, options.localCwd || process.cwd());
  process.stdout.write(`CAIt local executor\ncwd=${validated.cwd}\ncommand=${[command, ...args].join(' ')}\n`);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: validated.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true
    });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        process.stdout.write(`\nCAIt local executor finished: exit_code=0\n`);
        resolve();
      } else {
        reject(new Error(`Local command failed with exit code ${code}`));
      }
    });
  });
}

function summarizeJob(job = {}) {
  const output = job?.output && typeof job.output === 'object' ? job.output : {};
  const report = output.report && typeof output.report === 'object' ? output.report : {};
  const files = Array.isArray(output.files) ? output.files : [];
  return {
    id: job.id || null,
    status: job.status || null,
    task_type: job.taskType || job.task_type || null,
    assigned_agent_id: job.assignedAgentId || job.assigned_agent_id || null,
    workflow_parent_id: job.workflowParentId || job.workflow_parent_id || null,
    created_at: job.createdAt || job.created_at || null,
    started_at: job.startedAt || job.started_at || null,
    completed_at: job.completedAt || job.completed_at || null,
    failed_at: job.failedAt || job.failed_at || null,
    summary: output.summary || report.summary || report.answer || null,
    files: files.map((file) => ({
      name: file?.name || null,
      type: file?.type || null
    })),
    actual_billing: job.actualBilling || null,
    billing_estimate: job.billingEstimate || null
  };
}

function printJobProgress(job = {}, prefix = 'CAIt') {
  const summary = summarizeJob(job);
  const line = [
    `${prefix}: ${summary.id || 'job'}`,
    `status=${summary.status || '-'}`,
    `task=${summary.task_type || '-'}`,
    `agent=${summary.assigned_agent_id || 'auto'}`
  ].join(' | ');
  process.stdout.write(`${line}\n`);
  if (summary.summary && isTerminalJobStatus(summary.status)) {
    process.stdout.write(`Summary: ${String(summary.summary).replace(/\s+/g, ' ').slice(0, 240)}\n`);
  }
  if (summary.files.length && isTerminalJobStatus(summary.status)) {
    process.stdout.write(`Files: ${summary.files.map((file) => file.name || '-').join(', ')}\n`);
  }
}

function printOrderResult(result) {
  if (result?.needs_input || result?.status === 'needs_input') {
    printJson({
      status: 'needs_input',
      message: 'CAIt needs more details before creating a billable order.',
      questions: result.questions || [],
      next: 'Answer the questions and run the send command again, or add --skip-intake if the broad request is intentional.'
    });
    return;
  }
  printJson({
    ok: result?.ok !== false,
    status: result?.status || result?.job?.status || 'created',
    job_id: result?.job_id || result?.job?.id || null,
    workflow_job_id: result?.workflow_job_id || result?.workflowJobId || null,
    assigned_agent_id: result?.assigned_agent_id || result?.job?.assignedAgentId || null,
    estimated_billing: result?.billing || result?.job?.billingEstimate || null,
    next: result?.job_id || result?.job?.id
      ? `npm run cait -- get ${result.job_id || result.job.id}`
      : 'Check CAIt Web UI > Work list.'
  });
}

async function fetchJob(jobId = '') {
  const result = await requestJson(`/api/jobs/${encodeURIComponent(jobId)}`);
  const job = unwrapJobPayload(result);
  if (!job) throw new Error('Job response did not include a job payload.');
  return job;
}

async function watchJob(jobId = '', options = {}) {
  const intervalMs = Math.max(1_000, Math.round((options.watchIntervalSeconds || 5) * 1_000));
  const timeoutMs = Math.max(intervalMs, Math.round((options.watchTimeoutSeconds || 900) * 1_000));
  const startedAt = Date.now();
  let lastSignature = '';
  while (Date.now() - startedAt <= timeoutMs) {
    const job = await fetchJob(jobId);
    const signature = [
      job.status || '',
      job.assignedAgentId || '',
      job.startedAt || '',
      job.completedAt || '',
      job.failedAt || '',
      job.lastCallbackAt || ''
    ].join('|');
    if (signature !== lastSignature) {
      printJobProgress(job);
      lastSignature = signature;
    }
    if (isTerminalJobStatus(job.status)) {
      printJson({ ok: true, job: summarizeJob(job) });
      return;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Watch timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help' || options.command === '--help' || options.command === '-h') {
    process.stdout.write(usage());
    return;
  }
  if (options.command === 'list') {
    const result = await requestJson('/api/jobs');
    const jobs = Array.isArray(result.jobs) ? result.jobs : [];
    printJson({
      count: jobs.length,
      jobs: jobs.slice(0, 20).map((job) => ({
        id: job.id,
        status: job.status,
        task_type: job.taskType,
        agent: job.assignedAgentId || null,
        created_at: job.createdAt
      }))
    });
    return;
  }
  if (options.command === 'get') {
    const jobId = options.targetId || options.prompt;
    if (!jobId) throw new Error('job_id is required. Example: npm run cait -- get job_...');
    printJson(await requestJson(`/api/jobs/${encodeURIComponent(jobId)}`));
    return;
  }
  if (options.command === 'watch') {
    const jobId = options.targetId || options.prompt;
    if (!jobId) throw new Error('job_id is required. Example: npm run cait -- watch job_...');
    await watchJob(jobId, options);
    return;
  }
  if (options.command === 'run-local' || options.command === 'run_local') {
    const tokens = options.promptTokens[0] === '--' ? options.promptTokens.slice(1) : options.promptTokens;
    await runLocalCommand(tokens, options);
    return;
  }
  if (options.command === 'send') {
    if (!options.prompt) throw new Error('prompt is required. Example: npm run cait -- send "Compare used iPhone resale routes"');
    const payload = {
      parent_agent_id: DEFAULT_PARENT_AGENT_ID,
      task_type: options.taskType,
      order_strategy: options.strategy,
      prompt: options.prompt
    };
    if (options.agentId) payload.agent_id = options.agentId;
    if (options.skipIntake) payload.skip_intake = true;
    const result = await requestJson('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    printOrderResult(result);
    if (options.watch) {
      const jobId = result?.workflow_job_id || result?.job_id || result?.job?.id || '';
      if (jobId) await watchJob(jobId, options);
    }
    return;
  }
  if (options.command === 'follow-up' || options.command === 'followup') {
    const jobId = options.targetId;
    if (!jobId) throw new Error('previous job_id is required. Example: npm run cait -- follow-up job_... "Add sources and focus on Japan"');
    if (!options.prompt) throw new Error('follow-up prompt is required.');
    const payload = {
      parent_agent_id: DEFAULT_PARENT_AGENT_ID,
      task_type: options.taskType,
      order_strategy: options.strategy,
      followup_to_job_id: jobId,
      prompt: options.prompt
    };
    if (options.agentId) payload.agent_id = options.agentId;
    if (options.skipIntake) payload.skip_intake = true;
    const result = await requestJson('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    printOrderResult(result);
    if (options.watch) {
      const nextJobId = result?.workflow_job_id || result?.job_id || result?.job?.id || '';
      if (nextJobId) await watchJob(nextJobId, options);
    }
    return;
  }
  throw new Error(`Unknown command: ${options.command}\n\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`CAIt external chat error: ${error.message}\n`);
  if (error.body) process.stderr.write(`${JSON.stringify(error.body, null, 2)}\n`);
  process.exitCode = 1;
});
