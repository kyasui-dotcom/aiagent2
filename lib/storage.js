import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_AGENT_SEEDS, makeEvent, nowIso } from './shared.js';

const inMemoryState = { agents: structuredClone(DEFAULT_AGENT_SEEDS), jobs: [], events: [makeEvent('LIVE', 'broker storage initialized')] };

export const D1_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS agents (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  description TEXT NOT NULL,\n  task_types TEXT NOT NULL,\n  premium_rate REAL NOT NULL,\n  basic_rate REAL NOT NULL DEFAULT 0.1,\n  success_rate REAL NOT NULL,\n  avg_latency_sec INTEGER NOT NULL,\n  online INTEGER NOT NULL DEFAULT 1,\n  owner TEXT,\n  manifest_url TEXT,\n  manifest_source TEXT,\n  token TEXT,\n  earnings REAL NOT NULL DEFAULT 0,\n  metadata_json TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS jobs (\n  id TEXT PRIMARY KEY,\n  parent_agent_id TEXT NOT NULL,\n  task_type TEXT NOT NULL,\n  prompt TEXT NOT NULL,\n  input_json TEXT,\n  budget_cap REAL,\n  deadline_sec INTEGER,\n  priority TEXT NOT NULL,\n  status TEXT NOT NULL,\n  assigned_agent_id TEXT,\n  score REAL,\n  usage_json TEXT,\n  billing_estimate_json TEXT,\n  actual_billing_json TEXT,\n  output_json TEXT,\n  failure_reason TEXT,\n  failure_category TEXT,\n  callback_token TEXT,\n  dispatch_json TEXT,\n  logs_json TEXT,\n  created_at TEXT NOT NULL,\n  claimed_at TEXT,\n  dispatched_at TEXT,\n  started_at TEXT,\n  last_callback_at TEXT,\n  completed_at TEXT,\n  failed_at TEXT,\n  timed_out_at TEXT\n);\n\nCREATE TABLE IF NOT EXISTS events (\n  id TEXT PRIMARY KEY,\n  type TEXT NOT NULL,\n  message TEXT NOT NULL,\n  meta_json TEXT,\n  created_at TEXT NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);\nCREATE INDEX IF NOT EXISTS idx_jobs_assigned_agent_id ON jobs(assigned_agent_id);\nCREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);`;

export function createLocalStorage(filePath) {
  ensureParent(filePath);
  const initial = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, 'utf8'))
    : { agents: structuredClone(DEFAULT_AGENT_SEEDS), jobs: [], events: [makeEvent('LIVE', 'broker storage initialized')] };

  function persist(state) { writeFileSync(filePath, JSON.stringify(state, null, 2)); }

  const state = {
    agents: Array.isArray(initial.agents) && initial.agents.length ? initial.agents : structuredClone(DEFAULT_AGENT_SEEDS),
    jobs: Array.isArray(initial.jobs) ? initial.jobs : [],
    events: Array.isArray(initial.events) ? initial.events : [makeEvent('LIVE', 'broker storage initialized')]
  };
  persist(state);

  return {
    kind: 'local-json',
    supportsPersistence: true,
    schemaSql: D1_SCHEMA_SQL,
    async getState() { return structuredClone(state); },
    async replaceState(nextState) { state.agents = nextState.agents; state.jobs = nextState.jobs; state.events = nextState.events; persist(state); return structuredClone(state); },
    async mutate(mutator) { const draft = structuredClone(state); const result = await mutator(draft); state.agents = draft.agents; state.jobs = draft.jobs; state.events = draft.events; persist(state); return result; }
  };
}

export function createD1LikeStorage(db) {
  if (!db) {
    return {
      kind: 'd1-ready',
      supportsPersistence: false,
      schemaSql: D1_SCHEMA_SQL,
      async getState() { return structuredClone(inMemoryState); },
      async replaceState(nextState) { inMemoryState.agents = nextState.agents; inMemoryState.jobs = nextState.jobs; inMemoryState.events = nextState.events; return structuredClone(inMemoryState); },
      async mutate(mutator) { const draft = structuredClone(inMemoryState); const result = await mutator(draft); inMemoryState.agents = draft.agents; inMemoryState.jobs = draft.jobs; inMemoryState.events = draft.events; return result; },
      note: 'No DB binding available; using in-memory fallback.'
    };
  }

  let initialized = false;

  async function init() {
    if (initialized) return;
    const statements = D1_SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean);
    for (const sql of statements) await db.prepare(sql).run();
    const seedCheck = await db.prepare('SELECT COUNT(*) as count FROM agents').first();
    if (!Number(seedCheck?.count || 0)) {
      for (const agent of DEFAULT_AGENT_SEEDS) await upsertAgent(agent);
      await insertEvent(makeEvent('LIVE', 'broker storage initialized'));
    }
    initialized = true;
  }

  function serializeAgent(agent) {
    const metadata = {
      ...(agent.metadata || {}),
      __verification: {
        status: agent.verificationStatus || null,
        checkedAt: agent.verificationCheckedAt || null,
        error: agent.verificationError || null,
        details: agent.verificationDetails || null
      }
    };
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      task_types: JSON.stringify(agent.taskTypes || []),
      premium_rate: Number(agent.premiumRate ?? 0),
      basic_rate: Number(agent.basicRate ?? 0.1),
      success_rate: Number(agent.successRate ?? 0.9),
      avg_latency_sec: Number(agent.avgLatencySec ?? 20),
      online: agent.online ? 1 : 0,
      owner: agent.owner || null,
      manifest_url: agent.manifestUrl || null,
      manifest_source: agent.manifestSource || null,
      token: agent.token || null,
      earnings: Number(agent.earnings ?? 0),
      metadata_json: JSON.stringify(metadata),
      created_at: agent.createdAt || nowIso(),
      updated_at: agent.updatedAt || nowIso()
    };
  }
  function deserializeAgent(row) {
    const metadata = safeJson(row.metadata_json, {});
    const verification = metadata?.__verification || {};
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      taskTypes: safeJson(row.task_types, []),
      premiumRate: Number(row.premium_rate ?? 0),
      basicRate: Number(row.basic_rate ?? 0.1),
      successRate: Number(row.success_rate ?? 0.9),
      avgLatencySec: Number(row.avg_latency_sec ?? 20),
      online: Boolean(row.online),
      owner: row.owner,
      manifestUrl: row.manifest_url,
      manifestSource: row.manifest_source,
      token: row.token,
      earnings: Number(row.earnings ?? 0),
      metadata,
      verificationStatus: row.verification_status || verification.status || null,
      verificationCheckedAt: row.verification_checked_at || verification.checkedAt || null,
      verificationError: row.verification_error || verification.error || null,
      verificationDetails: verification.details || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  function serializeJob(job) {
    return {
      id: job.id,
      parent_agent_id: job.parentAgentId,
      task_type: job.taskType,
      prompt: job.prompt,
      input_json: JSON.stringify(job.input || {}),
      budget_cap: job.budgetCap,
      deadline_sec: job.deadlineSec,
      priority: job.priority || 'normal',
      status: job.status,
      assigned_agent_id: job.assignedAgentId || null,
      score: job.score,
      usage_json: JSON.stringify(job.usage || null),
      billing_estimate_json: JSON.stringify(job.billingEstimate || null),
      actual_billing_json: JSON.stringify(job.actualBilling || null),
      output_json: JSON.stringify(job.output || null),
      failure_reason: job.failureReason || null,
      failure_category: job.failureCategory || null,
      callback_token: job.callbackToken || null,
      dispatch_json: JSON.stringify(job.dispatch || null),
      logs_json: JSON.stringify(job.logs || []),
      created_at: job.createdAt || nowIso(),
      claimed_at: job.claimedAt || null,
      dispatched_at: job.dispatchedAt || null,
      started_at: job.startedAt || null,
      last_callback_at: job.lastCallbackAt || null,
      completed_at: job.completedAt || null,
      failed_at: job.failedAt || null,
      timed_out_at: job.timedOutAt || null
    };
  }
  function deserializeJob(row) {
    return {
      id: row.id,
      parentAgentId: row.parent_agent_id,
      taskType: row.task_type,
      prompt: row.prompt,
      input: safeJson(row.input_json, {}),
      budgetCap: row.budget_cap,
      deadlineSec: row.deadline_sec,
      priority: row.priority,
      status: row.status,
      assignedAgentId: row.assigned_agent_id,
      score: row.score == null ? null : Number(row.score),
      usage: safeJson(row.usage_json, null),
      billingEstimate: safeJson(row.billing_estimate_json, null),
      actualBilling: safeJson(row.actual_billing_json, null),
      output: safeJson(row.output_json, null),
      failureReason: row.failure_reason,
      failureCategory: row.failure_category,
      callbackToken: row.callback_token,
      dispatch: safeJson(row.dispatch_json, null),
      logs: safeJson(row.logs_json, []),
      createdAt: row.created_at,
      claimedAt: row.claimed_at,
      dispatchedAt: row.dispatched_at,
      startedAt: row.started_at,
      lastCallbackAt: row.last_callback_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      timedOutAt: row.timed_out_at
    };
  }
  function deserializeEvent(row) {
    return { id: row.id, type: row.type, message: row.message, meta: safeJson(row.meta_json, {}), ts: row.created_at };
  }

  async function upsertAgent(agent) {
    const v = serializeAgent(agent);
    await db.prepare(`INSERT OR REPLACE INTO agents (id,name,description,task_types,premium_rate,basic_rate,success_rate,avg_latency_sec,online,owner,manifest_url,manifest_source,token,earnings,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.id, v.name, v.description, v.task_types, v.premium_rate, v.basic_rate, v.success_rate, v.avg_latency_sec, v.online, v.owner, v.manifest_url, v.manifest_source, v.token, v.earnings, v.metadata_json, v.created_at, v.updated_at)
      .run();
  }
  async function upsertJob(job) {
    const v = serializeJob(job);
    await db.prepare(`INSERT OR REPLACE INTO jobs (id,parent_agent_id,task_type,prompt,input_json,budget_cap,deadline_sec,priority,status,assigned_agent_id,score,usage_json,billing_estimate_json,actual_billing_json,output_json,failure_reason,failure_category,callback_token,dispatch_json,logs_json,created_at,claimed_at,dispatched_at,started_at,last_callback_at,completed_at,failed_at,timed_out_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.id, v.parent_agent_id, v.task_type, v.prompt, v.input_json, v.budget_cap, v.deadline_sec, v.priority, v.status, v.assigned_agent_id, v.score, v.usage_json, v.billing_estimate_json, v.actual_billing_json, v.output_json, v.failure_reason, v.failure_category, v.callback_token, v.dispatch_json, v.logs_json, v.created_at, v.claimed_at, v.dispatched_at, v.started_at, v.last_callback_at, v.completed_at, v.failed_at, v.timed_out_at)
      .run();
  }
  async function insertEvent(event) {
    await db.prepare(`INSERT OR REPLACE INTO events (id,type,message,meta_json,created_at) VALUES (?,?,?,?,?)`)
      .bind(event.id, event.type, event.message, JSON.stringify(event.meta || {}), event.ts || nowIso())
      .run();
  }

  return {
    kind: 'd1',
    supportsPersistence: true,
    schemaSql: D1_SCHEMA_SQL,
    async getState() {
      await init();
      const [agentsRes, jobsRes, eventsRes] = await Promise.all([
        db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all(),
        db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all(),
        db.prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 250').all()
      ]);
      return {
        agents: (agentsRes.results || []).map(deserializeAgent),
        jobs: (jobsRes.results || []).map(deserializeJob),
        events: (eventsRes.results || []).map(deserializeEvent)
      };
    },
    async replaceState(nextState) {
      await init();
      await db.prepare('DELETE FROM agents').run();
      await db.prepare('DELETE FROM jobs').run();
      await db.prepare('DELETE FROM events').run();
      for (const a of nextState.agents) await upsertAgent(a);
      for (const j of nextState.jobs) await upsertJob(j);
      for (const e of nextState.events) await insertEvent(e);
      return nextState;
    },
    async mutate(mutator) {
      await init();
      const draft = await this.getState();
      const result = await mutator(draft);
      await this.replaceState(draft);
      return result;
    }
  };
}

export function touchEvent(state, type, message, meta = {}) {
  state.events.unshift({ ...makeEvent(type, message, meta), createdAt: nowIso() });
  if (state.events.length > 250) state.events.length = 250;
}

function ensureParent(filePath) { mkdirSync(dirname(filePath), { recursive: true }); }
function safeJson(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
