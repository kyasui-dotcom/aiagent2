import assert from 'node:assert/strict';
import { createD1LikeStorage } from '../lib/storage.js';
import { recoverMissingAccountsInState } from '../lib/shared.js';

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

console.log('storage qa passed');
