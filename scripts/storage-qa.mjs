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

console.log('storage qa passed');
