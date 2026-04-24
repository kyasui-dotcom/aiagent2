import assert from 'node:assert/strict';
import { WELCOME_CREDITS_GRANT_AMOUNT, billingProfileForAccount, buildAdminDashboard, buildMonthlyAccountSummary, estimateBilling, estimateRunWindow, ledgerAmountToDisplayCurrency, maybeGrantWelcomeCreditsForSignupInState, maybeGrantWelcomeCreditsForVerifiedAgentInState, providerMonthlyBillingLedgerForLogin, recordProviderMonthlyChargeInAccount, releaseBillingReservationInState, requesterContextFromUser, reserveBillingEstimateInState, resolvePricingPolicy, settleBillingForJobInState, subscriptionIncludedCreditsForPlan, upsertAccountSettingsInState } from '../lib/shared.js';

const agent = {
  providerMarkupRate: 0.1
};

const usage = {
  total_cost_basis: 100,
  compute_cost: 30,
  tool_cost: 10,
  labor_cost: 60,
  api_cost: 0
};

const policy = resolvePricingPolicy(agent, usage);
assert.equal(policy.policyVersion, 'billing-policy/v4-multi-model-pricing');
assert.equal(policy.billableBasis, 100);
assert.equal(policy.rates.providerMarkupRate, 0.1);
assert.equal(policy.rates.platformMarginRate, 0.1);
assert.equal(policy.rates.creatorFeeRate, 0.1);
assert.equal(policy.rates.marketplaceFeeRate, 0.1);

const billing = estimateBilling(agent, usage);
assert.equal(billing.policyVersion, 'billing-policy/v4-multi-model-pricing');
assert.equal(billing.totalCostBasis, 100);
assert.equal(billing.providerMarkup, 10);
assert.equal(billing.creatorFee, 10);
assert.equal(billing.marketplaceFee, 12.22);
assert.equal(billing.agentPayout, 10);
assert.equal(billing.platformRevenue, 12.22);
assert.equal(billing.total, 122.22);

const customBilling = estimateBilling({ providerMarkupRate: 0.25 }, usage);
assert.equal(customBilling.providerMarkup, 25);
assert.equal(customBilling.marketplaceFee, 13.89);
assert.equal(customBilling.agentPayout, 25);
assert.equal(customBilling.total, 138.89);

const tokenBilling = estimateBilling({ providerMarkupRate: 0.1 }, {
  input_tokens: 1_000_000,
  output_tokens: 500_000,
  input_price_per_mtok: 2,
  output_price_per_mtok: 8,
  api_provider: 'test-provider',
  model: 'test-model'
});
assert.equal(tokenBilling.apiCost, 900);
assert.equal(tokenBilling.totalCostBasis, 900);
assert.equal(tokenBilling.providerMarkup, 90);
assert.equal(tokenBilling.marketplaceFee, 110);
assert.equal(tokenBilling.total, 1100);
assert.equal(ledgerAmountToDisplayCurrency(tokenBilling.total), 7.33);
assert.equal(tokenBilling.tokenUsage.inputTokens, 1_000_000);

const usdTokenBilling = estimateBilling({ providerMarkupRate: 0.1 }, {
  input_tokens: 1_000_000,
  output_tokens: 500_000,
  input_price_per_mtok: 2,
  output_price_per_mtok: 8,
  api_cost_currency: 'USD',
  api_provider: 'test-provider',
  model: 'test-model'
});
assert.equal(usdTokenBilling.apiCost, 900);
assert.equal(usdTokenBilling.totalCostBasis, 900);
assert.equal(usdTokenBilling.providerMarkup, 90);
assert.equal(usdTokenBilling.marketplaceFee, 110);
assert.equal(usdTokenBilling.total, 1100);
assert.equal(ledgerAmountToDisplayCurrency(usdTokenBilling.total), 7.33);

const smallReportedUsageBilling = estimateBilling({ providerMarkupRate: 0.1 }, {
  api_cost: 0.043,
  total_cost_basis: 0.043,
  api_cost_currency: 'USD',
  input_tokens: 23703,
  output_tokens: 5608,
  model: 'gpt-5.4-mini'
});
assert.equal(smallReportedUsageBilling.apiCost, 6.45);
assert.equal(smallReportedUsageBilling.totalCostBasis, 6.45);
assert.ok(smallReportedUsageBilling.total > 0, 'positive reported AI usage must not round down to a free order');
assert.equal(smallReportedUsageBilling.total, 7.88);
assert.equal(ledgerAmountToDisplayCurrency(smallReportedUsageBilling.total), 0.05);

const fixedRunBilling = estimateBilling({
  pricingModel: 'fixed_per_run',
  fixedRunPriceUsd: 12
}, usage);
assert.equal(fixedRunBilling.pricingModel, 'fixed_per_run');
assert.equal(ledgerAmountToDisplayCurrency(fixedRunBilling.total), 12);
assert.equal(ledgerAmountToDisplayCurrency(fixedRunBilling.platformRevenue), 1.2);
assert.equal(ledgerAmountToDisplayCurrency(fixedRunBilling.agentPayout), 10.8);

const subscriptionOnlyBilling = estimateBilling({
  pricingModel: 'subscription_required',
  subscriptionMonthlyPriceUsd: 49
}, usage);
assert.equal(subscriptionOnlyBilling.pricingModel, 'subscription_required');
assert.equal(subscriptionOnlyBilling.total, 0);
assert.equal(ledgerAmountToDisplayCurrency(subscriptionOnlyBilling.providerSubscriptionMonthlyPrice), 49);
assert.equal(ledgerAmountToDisplayCurrency(subscriptionOnlyBilling.providerSubscriptionPlatformFee), 4.9);
assert.equal(ledgerAmountToDisplayCurrency(subscriptionOnlyBilling.providerSubscriptionProviderNet), 44.1);

const hybridUsageBilling = estimateBilling({
  pricingModel: 'hybrid',
  subscriptionMonthlyPriceUsd: 29,
  providerMarkupRate: 0.1,
  overageMode: 'usage_based'
}, usage);
assert.equal(hybridUsageBilling.pricingModel, 'hybrid');
assert.equal(hybridUsageBilling.total, 122.22);
assert.equal(ledgerAmountToDisplayCurrency(hybridUsageBilling.providerSubscriptionMonthlyPrice), 29);
assert.equal(ledgerAmountToDisplayCurrency(hybridUsageBilling.providerSubscriptionPlatformFee), 2.9);

const hybridFixedBilling = estimateBilling({
  pricingModel: 'hybrid',
  subscriptionMonthlyPriceUsd: 19,
  overageMode: 'fixed_per_run',
  overageFixedRunPriceUsd: 3
}, usage);
assert.equal(hybridFixedBilling.pricingModel, 'hybrid');
assert.equal(ledgerAmountToDisplayCurrency(hybridFixedBilling.total), 3);
assert.equal(ledgerAmountToDisplayCurrency(hybridFixedBilling.providerSubscriptionPlatformFee), 1.9);

const providerMonthlyState = { agents: [], jobs: [], accounts: [] };
const providerMonthlyUser = { login: 'saaS-owner', name: 'SaaS Owner' };
const providerMonthlyAccount = upsertAccountSettingsInState(providerMonthlyState, providerMonthlyUser.login, providerMonthlyUser, 'github-app', {});
providerMonthlyState.agents.push({
  id: 'agent_sub_only_1',
  owner: providerMonthlyUser.login,
  name: 'Subscription Agent',
  pricingModel: 'subscription_required',
  subscriptionMonthlyPriceUsd: 29
});
providerMonthlyState.agents.push({
  id: 'agent_hybrid_1',
  owner: providerMonthlyUser.login,
  name: 'Hybrid Agent',
  pricingModel: 'hybrid',
  subscriptionMonthlyPriceUsd: 19,
  overageMode: 'usage_based'
});
let providerMonthlyLedger = providerMonthlyBillingLedgerForLogin(providerMonthlyState, providerMonthlyUser.login, '2026-04', providerMonthlyAccount);
assert.equal(ledgerAmountToDisplayCurrency(providerMonthlyLedger.monthlyPrice), 48);
assert.equal(ledgerAmountToDisplayCurrency(providerMonthlyLedger.marketplaceFee), 4.8);
assert.equal(ledgerAmountToDisplayCurrency(providerMonthlyLedger.providerNet), 43.2);
assert.equal(providerMonthlyLedger.chargeRuns.length, 0);
assert.equal(ledgerAmountToDisplayCurrency(providerMonthlyLedger.dueAmount), 48);
providerMonthlyAccount.stripe.providerMonthlyCharges = recordProviderMonthlyChargeInAccount(providerMonthlyAccount, {
  paymentIntentId: 'pi_provider_monthly_1',
  amount: 3000,
  currency: 'USD',
  period: '2026-04',
  status: 'succeeded',
  lineItems: providerMonthlyLedger.agents,
  createdAt: '2026-04-15T00:00:00.000Z'
});
providerMonthlyLedger = providerMonthlyBillingLedgerForLogin(providerMonthlyState, providerMonthlyUser.login, '2026-04', providerMonthlyAccount);
assert.equal(ledgerAmountToDisplayCurrency(providerMonthlyLedger.chargedAmount), 20);
assert.equal(ledgerAmountToDisplayCurrency(providerMonthlyLedger.dueAmount), 28);
assert.equal(providerMonthlyLedger.chargeRuns[0].paymentIntentId, 'pi_provider_monthly_1');
providerMonthlyAccount.stripe.providerMonthlyRetryPeriod = '2026-04';
providerMonthlyAccount.stripe.providerMonthlyRetryCount = 2;
providerMonthlyAccount.stripe.providerMonthlyLastFailureAt = '2026-04-20T00:00:00.000Z';
providerMonthlyAccount.stripe.providerMonthlyLastFailureMessage = 'Card declined';
providerMonthlyAccount.stripe.providerMonthlyLastNotificationAt = '2026-04-20T00:15:00.000Z';
providerMonthlyAccount.stripe.providerMonthlyLastNotificationPeriod = '2026-04';
const providerMonthlySummary = buildMonthlyAccountSummary(providerMonthlyState, providerMonthlyUser.login, '2026-04', providerMonthlyAccount);
assert.equal(providerMonthlySummary.provider.providerSubscriptionRetryPeriod, '2026-04');
assert.equal(providerMonthlySummary.provider.providerSubscriptionRetryCount, 2);
assert.equal(providerMonthlySummary.provider.providerSubscriptionLastFailureMessage, 'Card declined');
const providerAdminDashboard = buildAdminDashboard(providerMonthlyState, { operator: 'yasuikunihiro@gmail.com' });
assert.equal(providerAdminDashboard.summary.providerBilling.accounts, 1);
assert.equal(providerAdminDashboard.summary.providerBilling.retrying, 1);
assert.equal(providerAdminDashboard.summary.providerBilling.notified, 1);

assert.equal(subscriptionIncludedCreditsForPlan('starter'), 3150);
assert.equal(subscriptionIncludedCreditsForPlan('pro'), 22400);

const builtInResearchEstimate = estimateRunWindow({ providerMarkupRate: 0.1, verificationStatus: 'verified', avgLatencySec: 25 }, 'research');
assert.equal(builtInResearchEstimate.estimateMin.total, 2.44);
assert.equal(builtInResearchEstimate.estimateMax.total, 12.22);
assert.equal(builtInResearchEstimate.typical.total, 7.33);

const signupState = { agents: [], jobs: [], accounts: [] };
const signupUser = { login: 'signup-qa', name: 'Signup QA' };
upsertAccountSettingsInState(signupState, signupUser.login, signupUser, 'google-oauth', {});
const signupGrant = maybeGrantWelcomeCreditsForSignupInState(signupState, signupUser.login, signupUser, 'google-oauth');
assert.equal(signupGrant.status, 'granted');
assert.equal(signupGrant.amount, WELCOME_CREDITS_GRANT_AMOUNT);
const signupGrantAgain = maybeGrantWelcomeCreditsForSignupInState(signupState, signupUser.login, signupUser, 'google-oauth');
assert.equal(signupGrantAgain.status, 'already_granted');
const signupProfile = billingProfileForAccount(signupState.accounts[0], '', '2026-04');
assert.equal(signupProfile.welcomeCreditsAvailable, WELCOME_CREDITS_GRANT_AMOUNT);
assert.equal(signupProfile.welcomeCreditsSignupGrantedTotal, WELCOME_CREDITS_GRANT_AMOUNT);

const state = { agents: [], jobs: [], accounts: [] };
const user = { login: 'alice', name: 'Alice Example' };
upsertAccountSettingsInState(state, 'alice', user, 'github-app', {
  billing: {
    mode: 'subscription',
    depositBalance: 500,
    autoTopupEnabled: true,
    autoTopupThreshold: 200,
    autoTopupAmount: 300,
    subscriptionPlan: 'starter',
    subscriptionIncludedCredits: 100,
    subscriptionOverageMode: 'deposit',
    billingEmail: 'billing@example.com',
    legalName: 'Alice Example LLC'
  },
  stripe: {
    subscriptionStatus: 'active',
    subscriptionPlan: 'starter'
  }
});

const reserved = reserveBillingEstimateInState(state, 'alice', user, 'github-app', 180, { period: '2026-04' });
assert.equal(reserved.ok, true);
assert.equal(reserved.reservation.mode, 'subscription');
assert.equal(reserved.reservation.reservedCredits, 100);
assert.equal(reserved.reservation.reservedDeposit, 80);
assert.equal(reserved.profile.subscriptionCreditsReserved, 100);
assert.equal(reserved.profile.depositReserved, 80);

const job = {
  id: 'job_sub_1',
  status: 'completed',
  input: { _broker: { requester: requesterContextFromUser(user, 'github-app'), billingMode: 'subscription' } },
  billingReservation: reserved.reservation
};
const settled = settleBillingForJobInState(state, job, { total: 150 });
assert.equal(settled.creditsApplied, 100);
assert.equal(settled.depositApplied, 50);
assert.equal(job.actualBilling?.funding?.creditsApplied, 100);
assert.equal(job.actualBilling?.funding?.depositApplied, 50);
const settledProfile = billingProfileForAccount(state.accounts[0], '', '2026-04');
assert.equal(settledProfile.subscriptionCreditsUsed, 100);
assert.equal(settledProfile.subscriptionCreditsAvailable, 0);
assert.equal(settledProfile.depositBalance, 450);
assert.equal(settledProfile.depositReserved, 0);

const reservedDeposit = reserveBillingEstimateInState(state, 'alice', user, 'github-app', 500, { period: '2026-04', allowSyntheticTopup: true });
assert.equal(reservedDeposit.ok, true);
assert.ok(reservedDeposit.reservation.autoTopupAdded >= 300);
const failedJob = {
  id: 'job_fail_1',
  status: 'failed',
  input: { _broker: { requester: requesterContextFromUser(user, 'github-app'), billingMode: 'deposit' } },
  billingReservation: reservedDeposit.reservation
};
releaseBillingReservationInState(state, failedJob);
const releasedProfile = billingProfileForAccount(state.accounts[0], '', '2026-04');
assert.equal(releasedProfile.depositReserved, 0);

const planDefaultState = { agents: [], jobs: [], accounts: [] };
const planDefaultAccount = upsertAccountSettingsInState(planDefaultState, 'bob', { login: 'bob', name: 'Bob Example' }, 'github-app', {
  billing: {
    mode: 'subscription',
    subscriptionPlan: 'pro',
    subscriptionIncludedCredits: 0
  },
  stripe: {
    subscriptionStatus: 'active',
    subscriptionPlan: 'pro'
  }
});
assert.equal(planDefaultAccount.billing.subscriptionIncludedCredits, 22400);

const inactiveState = { agents: [], jobs: [], accounts: [] };
const inactiveUser = { login: 'carol', name: 'Carol Example' };
upsertAccountSettingsInState(inactiveState, 'carol', inactiveUser, 'github-app', {
  billing: {
    mode: 'subscription',
    depositBalance: 250,
    subscriptionPlan: 'starter',
    subscriptionIncludedCredits: 3150,
    subscriptionOverageMode: 'deposit'
  },
  stripe: {
    subscriptionStatus: 'not_started',
    subscriptionPlan: 'starter'
  }
});
const inactiveReserved = reserveBillingEstimateInState(inactiveState, 'carol', inactiveUser, 'github-app', 120, { period: '2026-04' });
assert.equal(inactiveReserved.ok, true);
assert.equal(inactiveReserved.reservation.mode, 'deposit');
assert.equal(inactiveReserved.reservation.reservedCredits, 0);
assert.equal(inactiveReserved.reservation.reservedDeposit, 120);
const inactiveProfile = billingProfileForAccount(inactiveState.accounts[0], '', '2026-04');
assert.equal(inactiveProfile.mode, 'deposit');
assert.equal(inactiveProfile.subscriptionPlan, 'none');
assert.equal(inactiveProfile.subscriptionIncludedCredits, 0);
assert.equal(inactiveProfile.subscriptionCreditsAvailable, 0);

const paymentRequiredState = { agents: [], jobs: [], accounts: [] };
const paymentRequiredUser = { login: 'dave', name: 'Dave Example' };
upsertAccountSettingsInState(paymentRequiredState, 'dave', paymentRequiredUser, 'github-app', {
  billing: {
    mode: 'deposit',
    depositBalance: 0,
    autoTopupEnabled: false
  }
});
const paymentRequired = reserveBillingEstimateInState(paymentRequiredState, 'dave', paymentRequiredUser, 'github-app', 120, { period: '2026-04' });
assert.equal(paymentRequired.ok, false);
assert.equal(paymentRequired.code, 'payment_required');

const welcomeState = { agents: [], jobs: [], accounts: [] };
const welcomeUser = { login: 'hana', name: 'Hana Example' };
upsertAccountSettingsInState(welcomeState, 'hana', welcomeUser, 'github-app', {});
welcomeState.agents.push({
  id: 'agent_welcome_1',
  name: 'SEO_AGENT',
  owner: 'hana',
  description: 'Production SEO agent for ecommerce landing pages, technical audits, keyword clustering, and metadata suggestions.',
  taskTypes: ['seo'],
  manifestSource: 'manifest-url',
  metadata: {
    manifest: {
      name: 'SEO_AGENT',
      description: 'Production SEO agent for ecommerce landing pages, technical audits, keyword clustering, and metadata suggestions.',
      task_types: ['seo'],
      healthcheckUrl: 'https://agent.example/health',
      endpoints: { jobs: 'https://agent.example/jobs' }
    }
  },
  verificationStatus: 'verified'
});
const welcomeGrant = maybeGrantWelcomeCreditsForVerifiedAgentInState(welcomeState, 'hana', 'agent_welcome_1');
assert.equal(welcomeGrant.status, 'granted');
assert.equal(welcomeGrant.amount, WELCOME_CREDITS_GRANT_AMOUNT);
const welcomeProfile = billingProfileForAccount(welcomeState.accounts[0], '', '2026-04');
assert.equal(welcomeProfile.welcomeCreditsAvailable, WELCOME_CREDITS_GRANT_AMOUNT);
assert.equal(welcomeProfile.fundingAvailable, WELCOME_CREDITS_GRANT_AMOUNT);
const welcomeReserved = reserveBillingEstimateInState(welcomeState, 'hana', welcomeUser, 'github-app', 120, { period: '2026-04' });
assert.equal(welcomeReserved.ok, true);
assert.equal(welcomeReserved.reservation.reservedWelcomeCredits, 120);
const welcomeJob = {
  id: 'job_welcome_1',
  status: 'completed',
  input: { _broker: { requester: requesterContextFromUser(welcomeUser, 'github-app'), billingMode: 'deposit' } },
  billingReservation: welcomeReserved.reservation
};
const welcomeSettled = settleBillingForJobInState(welcomeState, welcomeJob, { total: 120 });
assert.equal(welcomeSettled.welcomeCreditsApplied, 120);
assert.equal(welcomeSettled.depositApplied, 0);
assert.equal(welcomeJob.actualBilling?.funding?.welcomeCreditsApplied, 120);
const welcomeSettledProfile = billingProfileForAccount(welcomeState.accounts[0], '', '2026-04');
assert.equal(welcomeSettledProfile.welcomeCreditsAvailable, WELCOME_CREDITS_GRANT_AMOUNT - 120);

const combinedWelcomeState = structuredClone(welcomeState);
const combinedUser = { login: 'mika', name: 'Mika Example' };
upsertAccountSettingsInState(combinedWelcomeState, 'mika', combinedUser, 'google-oauth', {});
combinedWelcomeState.agents.push({
  id: 'agent_combined_welcome_1',
  name: 'Mika SEO Agent',
  owner: 'mika',
  description: 'Production SEO and market research agent for public landing pages, source-backed audits, and launch checklists.',
  taskTypes: ['seo'],
  manifestSource: 'manifest-url',
  metadata: {
    manifest: {
      name: 'Mika SEO Agent',
      description: 'Production SEO and market research agent for public landing pages, source-backed audits, and launch checklists.',
      task_types: ['seo'],
      healthcheckUrl: 'https://mika-agent.example/health',
      endpoints: { jobs: 'https://mika-agent.example/jobs' }
    }
  },
  verificationStatus: 'verified'
});
assert.equal(maybeGrantWelcomeCreditsForSignupInState(combinedWelcomeState, 'mika', combinedUser, 'google-oauth').status, 'granted');
assert.equal(maybeGrantWelcomeCreditsForVerifiedAgentInState(combinedWelcomeState, 'mika', 'agent_combined_welcome_1').status, 'granted');
const combinedProfile = billingProfileForAccount(combinedWelcomeState.accounts.find((item) => item.login === 'mika'), '', '2026-04');
assert.equal(combinedProfile.welcomeCreditsAvailable, WELCOME_CREDITS_GRANT_AMOUNT * 2);
assert.equal(combinedProfile.welcomeCreditsSignupGrantedTotal, WELCOME_CREDITS_GRANT_AMOUNT);
assert.equal(combinedProfile.welcomeCreditsAgentGrantedTotal, WELCOME_CREDITS_GRANT_AMOUNT);

const thinState = { agents: [], jobs: [], accounts: [] };
upsertAccountSettingsInState(thinState, 'ivan', { login: 'ivan', name: 'Ivan Example' }, 'github-app', {});
thinState.agents.push({
  id: 'agent_thin_1',
  name: 'TEST',
  owner: 'ivan',
  description: 'test',
  taskTypes: ['summary'],
  manifestSource: 'manifest-json',
  metadata: {
    manifest: {
      name: 'TEST',
      description: 'test',
      task_types: ['summary'],
      healthcheckUrl: 'https://thin.example/health'
    }
  },
  verificationStatus: 'verified'
});
const thinGrant = maybeGrantWelcomeCreditsForVerifiedAgentInState(thinState, 'ivan', 'agent_thin_1');
assert.equal(thinGrant.status, 'rejected');
assert.equal(thinGrant.code, 'thin_agent_profile');
const thinProfile = billingProfileForAccount(thinState.accounts[0], '', '2026-04');
assert.equal(thinProfile.welcomeCreditsAvailable, 0);

const invoiceFallbackState = { agents: [], jobs: [], accounts: [] };
const invoiceFallbackUser = { login: 'erin', name: 'Erin Example' };
upsertAccountSettingsInState(invoiceFallbackState, 'erin', invoiceFallbackUser, 'github-app', {
  billing: {
    mode: 'monthly_invoice',
    invoiceApproved: false,
    depositBalance: 0,
    autoTopupEnabled: false
  }
});
const invoiceFallback = reserveBillingEstimateInState(invoiceFallbackState, 'erin', invoiceFallbackUser, 'github-app', 120, { period: '2026-04' });
assert.equal(invoiceFallback.ok, false);
assert.equal(invoiceFallback.code, 'payment_required');
assert.equal(invoiceFallback.profile.mode, 'deposit');

const approvedInvoiceState = { agents: [], jobs: [], accounts: [] };
const approvedInvoiceUser = { login: 'fran', name: 'Fran Example' };
upsertAccountSettingsInState(approvedInvoiceState, 'fran', approvedInvoiceUser, 'github-app', {
  billing: {
    mode: 'monthly_invoice',
    invoiceApproved: true,
    depositBalance: 0,
    autoTopupEnabled: false
  }
});
const approvedInvoice = reserveBillingEstimateInState(approvedInvoiceState, 'fran', approvedInvoiceUser, 'github-app', 120, { period: '2026-04' });
assert.equal(approvedInvoice.ok, true);
assert.equal(approvedInvoice.reservation.mode, 'monthly_invoice');
const approvedInvoiceJob = {
  id: 'job_invoice_1',
  status: 'completed',
  input: { _broker: { requester: requesterContextFromUser(approvedInvoiceUser, 'github-app'), billingMode: 'monthly_invoice' } },
  billingReservation: approvedInvoice.reservation
};
const approvedInvoiceSettled = settleBillingForJobInState(approvedInvoiceState, approvedInvoiceJob, { total: 120 });
assert.equal(approvedInvoiceSettled.invoiceApplied, 120);
assert.equal(billingProfileForAccount(approvedInvoiceState.accounts[0], '', '2026-04').arrearsTotal, 120);

const providerState = {
  agents: [{ id: 'agent_provider_1', owner: 'samurai' }],
  jobs: [],
  accounts: []
};
const providerUser = { login: 'gina', name: 'Gina Example' };
upsertAccountSettingsInState(providerState, 'gina', providerUser, 'github-app', {
  billing: {
    mode: 'deposit',
    depositBalance: 500,
    autoTopupEnabled: false
  }
});
const providerReserved = reserveBillingEstimateInState(providerState, 'gina', providerUser, 'github-app', 120, { period: '2026-04' });
assert.equal(providerReserved.ok, true);
const providerJob = {
  id: 'job_provider_1',
  status: 'completed',
  assignedAgentId: 'agent_provider_1',
  input: { _broker: { requester: requesterContextFromUser(providerUser, 'github-app'), billingMode: 'deposit' } },
  billingReservation: providerReserved.reservation
};
const providerSettled = settleBillingForJobInState(providerState, providerJob, { total: 120, agentPayout: 15 });
assert.equal(providerSettled.depositApplied, 120);
const providerCustomerProfile = billingProfileForAccount(providerState.accounts.find((account) => account.login === 'gina'), '', '2026-04');
assert.equal(providerCustomerProfile.depositBalance, 380);
const providerAccount = providerState.accounts.find((account) => account.login === 'samurai');
assert.equal(Number(providerAccount?.payout?.pendingBalance || 0), 15);

const externalTokenAgent = { id: 'agent_external_token_1', owner: 'provider-token', providerMarkupRate: 0.1 };
const externalTokenState = {
  agents: [externalTokenAgent],
  jobs: [],
  accounts: []
};
const externalTokenUser = { login: 'token-buyer', name: 'Token Buyer' };
upsertAccountSettingsInState(externalTokenState, externalTokenUser.login, externalTokenUser, 'google-oauth', {
  billing: {
    mode: 'subscription',
    subscriptionPlan: 'starter',
    subscriptionIncludedCredits: 1200,
    subscriptionOverageMode: 'block',
    depositBalance: 0
  },
  stripe: {
    subscriptionStatus: 'active',
    subscriptionPlan: 'starter'
  }
});
const externalTokenReserved = reserveBillingEstimateInState(externalTokenState, externalTokenUser.login, externalTokenUser, 'google-oauth', 1100, { period: '2026-04' });
assert.equal(externalTokenReserved.ok, true);
assert.equal(externalTokenReserved.reservation.reservedCredits, 1100);
const externalTokenBilling = estimateBilling(externalTokenAgent, {
  input_tokens: 1_000_000,
  output_tokens: 500_000,
  input_price_per_mtok: 2,
  output_price_per_mtok: 8,
  api_provider: 'external-provider',
  model: 'external-model'
});
assert.equal(externalTokenBilling.total, 1100);
assert.equal(ledgerAmountToDisplayCurrency(externalTokenBilling.total), 7.33);
const externalTokenJob = {
  id: 'job_external_token_1',
  status: 'completed',
  assignedAgentId: externalTokenAgent.id,
  input: { _broker: { requester: requesterContextFromUser(externalTokenUser, 'google-oauth'), billingMode: 'subscription' } },
  billingReservation: externalTokenReserved.reservation,
  billingEstimate: estimateBilling(externalTokenAgent, { api_cost: 80 })
};
const externalTokenSettled = settleBillingForJobInState(externalTokenState, externalTokenJob, externalTokenBilling);
assert.equal(externalTokenSettled.creditsApplied, externalTokenBilling.total);
assert.equal(externalTokenSettled.depositApplied, 0);
assert.equal(externalTokenJob.actualBilling?.tokenUsage?.inputTokens, 1_000_000);
assert.equal(externalTokenJob.actualBilling?.costTelemetry?.source, 'token_price_estimate');
const externalTokenProfile = billingProfileForAccount(externalTokenState.accounts.find((account) => account.login === externalTokenUser.login), '', '2026-04');
assert.equal(externalTokenProfile.subscriptionCreditsUsed, externalTokenBilling.total);
assert.equal(externalTokenProfile.subscriptionCreditsReserved, 0);
assert.equal(externalTokenProfile.subscriptionCreditsAvailable, 1200 - externalTokenBilling.total);

console.log('billing qa passed');
