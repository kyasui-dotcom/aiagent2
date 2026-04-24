import assert from 'node:assert/strict';
import {
  accountIdentityForProvider,
  accountSettingsForLogin,
  linkIdentityToAccountInState,
  mergeAccountsInState,
  upsertAccountSettingsForIdentityInState
} from '../lib/shared.js';

const googleIdentity = {
  providerUserId: 'google-123',
  login: 'owner@example.com',
  email: 'owner@example.com',
  name: 'Owner',
  avatarUrl: '',
  profileUrl: ''
};

const githubIdentity = {
  providerUserId: 'github-456',
  login: 'owner-gh',
  email: '',
  name: 'owner-gh',
  avatarUrl: '',
  profileUrl: 'https://github.com/owner-gh'
};

const state = { accounts: [], agents: [], jobs: [], feedbackReports: [] };
upsertAccountSettingsForIdentityInState(state, googleIdentity, 'google-oauth', {});
upsertAccountSettingsForIdentityInState(state, githubIdentity, 'github-app', {});

assert.equal(state.accounts.length, 2, 'fixture should start with split Google/GitHub accounts');

let linked = linkIdentityToAccountInState(state, 'owner@example.com', githubIdentity, 'github-app');
assert.equal(linked.ok, false, 'duplicate provider identity should be detected before merge');
assert.equal(linked.reason, 'identity_already_linked');
assert.equal(linked.linkedAccount.login, 'owner-gh');

mergeAccountsInState(state, linked.linkedAccount.login, 'owner@example.com');
const merged = upsertAccountSettingsForIdentityInState(state, { ...githubIdentity, login: 'owner@example.com' }, 'github-app', {});

assert.equal(state.accounts.length, 1, 'link recovery should merge split OAuth accounts');
assert.equal(merged.login, 'owner@example.com');
assert.ok(merged.aliases.includes('owner-gh'), 'merged account should keep the old GitHub login alias');
assert.equal(accountIdentityForProvider(merged, 'google')?.providerUserId, 'google-123');
assert.equal(accountIdentityForProvider(merged, 'github')?.providerUserId, 'github-456');

const lookupByAlias = accountSettingsForLogin(state, 'owner-gh');
assert.equal(lookupByAlias.login, 'owner@example.com', 'old GitHub login should resolve to the merged account');

const missingTargetState = { accounts: [], agents: [], jobs: [], feedbackReports: [] };
upsertAccountSettingsForIdentityInState(missingTargetState, githubIdentity, 'github-app', {});
const missingTargetLinked = linkIdentityToAccountInState(missingTargetState, 'new-google@example.com', githubIdentity, 'github-app');
assert.equal(missingTargetLinked.reason, 'identity_already_linked', 'linking should not fail when the active Google account has no account row yet');
assert.equal(accountSettingsForLogin(missingTargetState, 'new-google@example.com').login, 'new-google@example.com');
mergeAccountsInState(missingTargetState, missingTargetLinked.linkedAccount.login, 'new-google@example.com');
const recovered = upsertAccountSettingsForIdentityInState(missingTargetState, { ...githubIdentity, login: 'new-google@example.com' }, 'github-app', {});
assert.equal(missingTargetState.accounts.length, 1, 'missing target recovery should merge into the newly created account');
assert.equal(recovered.login, 'new-google@example.com');
assert.equal(accountIdentityForProvider(recovered, 'github')?.providerUserId, 'github-456');

const githubFirstState = { accounts: [], agents: [], jobs: [], feedbackReports: [] };
upsertAccountSettingsForIdentityInState(githubFirstState, githubIdentity, 'github-app', {});
let googleAfterGithub = linkIdentityToAccountInState(githubFirstState, 'owner-gh', googleIdentity, 'google-oauth');
assert.equal(googleAfterGithub.ok, true, 'Google login after GitHub session should link into the GitHub account');
assert.equal(accountIdentityForProvider(googleAfterGithub.account, 'github')?.providerUserId, 'github-456');
assert.equal(accountIdentityForProvider(googleAfterGithub.account, 'google')?.providerUserId, 'google-123');

const googleFirstState = { accounts: [], agents: [], jobs: [], feedbackReports: [] };
upsertAccountSettingsForIdentityInState(googleFirstState, googleIdentity, 'google-oauth', {});
let githubAfterGoogle = linkIdentityToAccountInState(googleFirstState, 'owner@example.com', githubIdentity, 'github-app');
assert.equal(githubAfterGoogle.ok, true, 'GitHub login after Google session should link into the Google account');
assert.equal(accountIdentityForProvider(githubAfterGoogle.account, 'google')?.providerUserId, 'google-123');
assert.equal(accountIdentityForProvider(githubAfterGoogle.account, 'github')?.providerUserId, 'github-456');

const differentProviderAccount = {
  providerUserId: 'github-789',
  login: 'kyasui-dotcom',
  email: '',
  name: 'kyasui-dotcom',
  avatarUrl: '',
  profileUrl: 'https://github.com/kyasui-dotcom'
};
const sessionRemainingState = { accounts: [], agents: [], jobs: [], feedbackReports: [] };
upsertAccountSettingsForIdentityInState(sessionRemainingState, googleIdentity, 'google-oauth', {});
let linkedDifferentGithub = linkIdentityToAccountInState(sessionRemainingState, 'owner@example.com', differentProviderAccount, 'github-app');
assert.equal(linkedDifferentGithub.ok, true, 'A different GitHub account chosen while Google session remains should be linked, not switch accounts');
assert.equal(linkedDifferentGithub.account.login, 'owner@example.com');
assert.equal(accountIdentityForProvider(linkedDifferentGithub.account, 'github')?.login, 'kyasui-dotcom');

console.log('auth link qa passed');
