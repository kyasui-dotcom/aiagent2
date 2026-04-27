import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createD1LikeStorage } from '../lib/storage.js';
import { recoverMissingAccountsInState } from '../lib/shared.js';

const storageSource = await readFile(new URL('../lib/storage.js', import.meta.url), 'utf8');
assert.equal(storageSource.includes('DELETE FROM'), false, 'D1 storage must not hard-delete existing rows');

function buildAccount(login, updatedAt) {
  return {
    id: `acct:${login}`,
    login,
    profile: { displayName: login },
    billing: {},
    payout: {},
    stripe: {},
    apiAccess: { orderKeys: [] },
    githubAppAccess: { repos: [] },
    linkedIdentities: [],
    aliases: [login],
    authProvider: 'email',
    createdAt: updatedAt,
    updatedAt
  };
}

const storage = createD1LikeStorage(null, { allowInMemory: true });
const emptyState = await storage.getState();

const alpha = buildAccount('alpha@example.com', '2026-04-25T08:00:00.000Z');
await storage.replaceState({
  ...emptyState,
  accounts: [alpha]
});

const beta = buildAccount('beta@example.com', '2026-04-25T09:00:00.000Z');
await storage.replaceState({
  ...emptyState,
  accounts: [beta]
});

const afterMerge = await storage.getState();
assert.equal(afterMerge.accounts.length, 2);
assert.deepEqual(afterMerge.accounts.map((account) => account.login), ['beta@example.com', 'alpha@example.com']);

const betaUpdated = {
  ...beta,
  profile: { displayName: 'Beta Updated' },
  updatedAt: '2026-04-25T10:00:00.000Z'
};
await storage.replaceState({
  ...emptyState,
  accounts: [betaUpdated]
});

const afterUpdate = await storage.getState();
assert.equal(afterUpdate.accounts.length, 2);
assert.equal(afterUpdate.accounts[0].login, 'beta@example.com');
assert.equal(afterUpdate.accounts[0].profile.displayName, 'Beta Updated');
assert.equal(afterUpdate.accounts[1].login, 'alpha@example.com');

const recoverState = {
  accounts: [],
  jobs: [{
    id: 'job_1',
    input: {
      _broker: {
        requester: {
          login: 'job-owner@example.com',
          authProvider: 'google-oauth'
        }
      }
    }
  }],
  events: [{
    id: 'evt_1',
    type: 'TRACK',
    meta: {
      kind: 'conversion',
      login: 'event-owner@example.com',
      authProvider: 'email'
    }
  }],
  agents: [{ id: 'agent_1', owner: 'agent-owner' }],
  recurringOrders: [{ id: 'rec_1', ownerLogin: 'recurring-owner@example.com' }],
  emailDeliveries: [{ id: 'mail_1', accountLogin: 'mail-owner@example.com' }],
  feedbackReports: [{ id: 'report_1', reporterLogin: 'report-owner@example.com' }]
};
const recovered = recoverMissingAccountsInState(recoverState);
assert.equal(recovered.recovered, 6);
assert.deepEqual(
  recoverState.accounts.map((account) => account.login).sort(),
  ['agent-owner', 'event-owner@example.com', 'job-owner@example.com', 'mail-owner@example.com', 'recurring-owner@example.com', 'report-owner@example.com']
);

function createCountingDb() {
  const selectCounts = new Map();
  const columnsByTable = {
    chat_transcripts: [{ name: 'session_id' }],
    jobs: [{ name: 'workflow_parent_id' }, { name: 'workflow_task' }, { name: 'workflow_agent_name' }, { name: 'workflow_json' }, { name: 'executor_state_json' }, { name: 'original_prompt' }, { name: 'prompt_optimization_json' }, { name: 'selection_mode' }, { name: 'estimate_window_json' }, { name: 'billing_reservation_json' }, { name: 'logs_json' }, { name: 'timed_out_at' }, { name: 'last_callback_at' }]
  };
  const emptyResults = { results: [] };
  const recordSelect = (sql) => {
    selectCounts.set(sql, (selectCounts.get(sql) || 0) + 1);
    return emptyResults;
  };
  return {
    selectCounts,
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          if (sql.startsWith('PRAGMA table_info(')) {
            const table = sql.match(/PRAGMA table_info\((.+)\)/)?.[1] || '';
            return { results: columnsByTable[table] || [] };
          }
          if (sql.startsWith('SELECT * FROM agents WHERE id IN')) return emptyResults;
          if (sql.startsWith('SELECT * FROM agents ORDER BY')) return recordSelect('agents');
          if (sql.startsWith('SELECT * FROM jobs ORDER BY')) return recordSelect('jobs');
          if (sql.startsWith('SELECT * FROM events ORDER BY')) return recordSelect('events');
          if (sql.startsWith('SELECT * FROM accounts ORDER BY')) return recordSelect('accounts');
          if (sql.startsWith('SELECT * FROM feedback_reports ORDER BY')) return recordSelect('feedback_reports');
          if (sql.startsWith('SELECT * FROM chat_transcripts ORDER BY')) return recordSelect('chat_transcripts');
          if (sql.startsWith('SELECT * FROM recurring_orders ORDER BY')) return recordSelect('recurring_orders');
          if (sql.startsWith('SELECT * FROM email_deliveries ORDER BY')) return recordSelect('email_deliveries');
          if (sql.startsWith('SELECT * FROM exact_match_actions ORDER BY')) return recordSelect('exact_match_actions');
          if (sql.startsWith('SELECT * FROM app_settings ORDER BY')) return recordSelect('app_settings');
          return emptyResults;
        },
        async first() {
          if (sql.startsWith('SELECT COUNT(*) as count FROM events')) return { count: 1 };
          return null;
        },
        async run() {
          return { success: true };
        }
      };
    }
  };
}

const countingDb = createCountingDb();
const cachedStorage = createD1LikeStorage(countingDb, { stateCacheTtlMs: 5000 });
await cachedStorage.getState();
await cachedStorage.getState();
assert.equal(countingDb.selectCounts.get('agents') || 0, 1);
assert.equal(countingDb.selectCounts.get('jobs') || 0, 1);
assert.equal(countingDb.selectCounts.get('chat_transcripts') || 0, 1);

function createSeedRepairDb() {
  const agentsRows = [{
    id: 'agent_cmo_leader_01',
    name: 'CMO TEAM LEADER',
    description: 'old hidden leader',
    task_types: '["cmo_leader"]',
    premium_rate: 0.1,
    basic_rate: 0.1,
    success_rate: 0.9,
    avg_latency_sec: 20,
    online: 1,
    owner: 'aiagent2',
    manifest_url: 'built-in://cmo',
    manifest_source: 'built-in',
    token: 'seed',
    earnings: 0,
    metadata_json: JSON.stringify({ hidden_from_catalog: true, deleted_at: '2026-04-01T00:00:00.000Z' }),
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z'
  }];
  return {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async all() {
          if (sql.startsWith('PRAGMA table_info(')) {
            const table = sql.match(/PRAGMA table_info\((.+)\)/)?.[1] || '';
            if (table === 'chat_transcripts') return { results: [{ name: 'session_id' }] };
            if (table === 'jobs') return { results: [{ name: 'workflow_parent_id' }, { name: 'workflow_task' }, { name: 'workflow_agent_name' }, { name: 'workflow_json' }, { name: 'executor_state_json' }, { name: 'original_prompt' }, { name: 'prompt_optimization_json' }, { name: 'selection_mode' }, { name: 'estimate_window_json' }, { name: 'billing_reservation_json' }, { name: 'logs_json' }, { name: 'timed_out_at' }, { name: 'last_callback_at' }] };
            return { results: [] };
          }
          if (sql.startsWith('SELECT * FROM agents WHERE id IN')) {
            return { results: agentsRows.filter((row) => bound.includes(row.id)) };
          }
          if (sql.startsWith('SELECT * FROM agents ORDER BY')) {
            return { results: [...agentsRows] };
          }
          if (/SELECT \* FROM (jobs|events|accounts|feedback_reports|chat_transcripts|recurring_orders|email_deliveries|exact_match_actions|app_settings) ORDER BY/.test(sql)) {
            return { results: [] };
          }
          return { results: [] };
        },
        async first() {
          if (sql.startsWith('SELECT COUNT(*) as count FROM events')) return { count: 1 };
          return null;
        },
        async run() {
          if (sql.startsWith('INSERT OR REPLACE INTO agents')) {
            const row = {
              id: bound[0],
              name: bound[1],
              description: bound[2],
              task_types: bound[3],
              premium_rate: bound[4],
              basic_rate: bound[5],
              success_rate: bound[6],
              avg_latency_sec: bound[7],
              online: bound[8],
              owner: bound[9],
              manifest_url: bound[10],
              manifest_source: bound[11],
              token: bound[12],
              earnings: bound[13],
              metadata_json: bound[14],
              created_at: bound[15],
              updated_at: bound[16]
            };
            const index = agentsRows.findIndex((item) => item.id === row.id);
            if (index >= 0) agentsRows[index] = row;
            else agentsRows.push(row);
          }
          return { success: true };
        }
      };
    }
  };
}

const repairedSeedStorage = createD1LikeStorage(createSeedRepairDb(), { stateCacheTtlMs: 0 });
const repairedSeedState = await repairedSeedStorage.getState();
const repairedCmo = repairedSeedState.agents.find((agent) => agent.id === 'agent_cmo_leader_01');
assert.ok(repairedCmo);
assert.equal(Boolean(repairedCmo.metadata?.hidden_from_catalog), false);
assert.equal(Boolean(repairedCmo.metadata?.deleted_at || repairedCmo.metadata?.deletedAt), false);

const jobStorage = createD1LikeStorage(null, { allowInMemory: true });
const jobState = await jobStorage.getState();
await jobStorage.replaceState({
  ...jobState,
  jobs: [{
    id: 'job-parent',
    parentAgentId: 'qa',
    taskType: 'cmo_leader',
    prompt: 'parent',
    input: {},
    priority: 'normal',
    status: 'running',
    workflow: { childRuns: [{ id: 'job-child', status: 'running' }] },
    createdAt: '2026-04-26T08:00:00.000Z',
    startedAt: '2026-04-26T08:05:00.000Z',
    logs: ['parent started']
  }]
});
await jobStorage.replaceState({
  ...jobState,
  jobs: [{
    id: 'job-parent',
    parentAgentId: 'qa',
    taskType: 'cmo_leader',
    prompt: 'parent',
    input: {},
    priority: 'normal',
    status: 'queued',
    createdAt: '2026-04-26T08:00:00.000Z',
    logs: ['stale queued snapshot']
  }]
});
const mergedJobState = await jobStorage.getState();
const mergedParent = mergedJobState.jobs.find((job) => job.id === 'job-parent');
assert.ok(mergedParent);
assert.equal(mergedParent.status, 'running');
assert.ok(Array.isArray(mergedParent.logs) && mergedParent.logs.includes('parent started'));
assert.ok(Array.isArray(mergedParent.logs) && mergedParent.logs.includes('stale queued snapshot'));

function createConcurrentJobsDb() {
  const jobsRows = [];
  return {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async all() {
          if (sql.startsWith('PRAGMA table_info(')) {
            const table = sql.match(/PRAGMA table_info\((.+)\)/)?.[1] || '';
            if (table === 'chat_transcripts') return { results: [{ name: 'session_id' }] };
            if (table === 'jobs') return { results: [{ name: 'workflow_parent_id' }, { name: 'workflow_task' }, { name: 'workflow_agent_name' }, { name: 'workflow_json' }, { name: 'executor_state_json' }, { name: 'original_prompt' }, { name: 'prompt_optimization_json' }, { name: 'selection_mode' }, { name: 'estimate_window_json' }, { name: 'billing_reservation_json' }, { name: 'logs_json' }, { name: 'timed_out_at' }, { name: 'last_callback_at' }] };
            return { results: [] };
          }
          if (sql.startsWith('SELECT * FROM jobs ORDER BY')) {
            return { results: [...jobsRows] };
          }
          if (/SELECT \* FROM (agents|events|accounts|feedback_reports|chat_transcripts|recurring_orders|email_deliveries|exact_match_actions|app_settings) ORDER BY/.test(sql)) {
            return { results: [] };
          }
          if (sql.startsWith('SELECT * FROM agents WHERE id IN')) return { results: [] };
          return { results: [] };
        },
        async first() {
          if (sql.startsWith('SELECT COUNT(*) as count FROM events')) return { count: 1 };
          return null;
        },
        async run() {
          if (sql.startsWith('INSERT OR REPLACE INTO jobs')) {
            const row = {
              id: bound[0],
              parent_agent_id: bound[1],
              task_type: bound[2],
              prompt: bound[3],
              input_json: bound[4],
              budget_cap: bound[5],
              deadline_sec: bound[6],
              priority: bound[7],
              status: bound[8],
              job_kind: bound[9],
              assigned_agent_id: bound[10],
              score: bound[11],
              usage_json: bound[12],
              billing_estimate_json: bound[13],
              actual_billing_json: bound[14],
              output_json: bound[15],
              failure_reason: bound[16],
              failure_category: bound[17],
              callback_token: bound[18],
              dispatch_json: bound[19],
              workflow_parent_id: bound[20],
              workflow_task: bound[21],
              workflow_agent_name: bound[22],
              workflow_json: bound[23],
              executor_state_json: bound[24],
              original_prompt: bound[25],
              prompt_optimization_json: bound[26],
              selection_mode: bound[27],
              estimate_window_json: bound[28],
              billing_reservation_json: bound[29],
              logs_json: bound[30],
              created_at: bound[31],
              claimed_at: bound[32],
              dispatched_at: bound[33],
              started_at: bound[34],
              last_callback_at: bound[35],
              completed_at: bound[36],
              failed_at: bound[37],
              timed_out_at: bound[38]
            };
            const index = jobsRows.findIndex((item) => item.id === row.id);
            if (index >= 0) jobsRows[index] = row;
            else jobsRows.push(row);
          }
          return { success: true };
        }
      };
    }
  };
}

const concurrentJobsStorage = createD1LikeStorage(createConcurrentJobsDb(), { stateCacheTtlMs: 0 });
const concurrentBase = await concurrentJobsStorage.getState();
await Promise.all([
  concurrentJobsStorage.replaceState({
    ...concurrentBase,
    jobs: [{
      id: 'workflow-root',
      parentAgentId: 'qa',
      taskType: 'cmo_leader',
      prompt: 'parent',
      input: {},
      priority: 'normal',
      status: 'queued',
      jobKind: 'workflow',
      createdAt: '2026-04-26T08:10:00.000Z'
    }]
  }),
  concurrentJobsStorage.replaceState({
    ...concurrentBase,
    jobs: [{
      id: 'workflow-child',
      parentAgentId: 'qa',
      taskType: 'research',
      prompt: 'child',
      input: {},
      priority: 'normal',
      status: 'queued',
      jobKind: 'workflow_child',
      workflowParentId: 'workflow-root',
      workflowTask: 'research',
      createdAt: '2026-04-26T08:10:01.000Z'
    }]
  })
]);
const concurrentJobsState = await concurrentJobsStorage.getState();
assert.equal(concurrentJobsState.jobs.some((job) => job.id === 'workflow-root'), true);
assert.equal(concurrentJobsState.jobs.some((job) => job.id === 'workflow-child'), true);

console.log('storage qa passed');
