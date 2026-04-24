import assert from 'node:assert/strict';
import worker from '../worker.js';
import { createD1LikeStorage } from '../lib/storage.js';
import { billingPeriodId, providerMonthlyBillingLedgerForLogin, upsertAccountSettingsInState } from '../lib/shared.js';

const env = {
  APP_VERSION: '0.2.0-test',
  ALLOW_OPEN_WRITE_API: '0',
  ALLOW_GUEST_RUN_READ_API: '0',
  ALLOW_DEV_API: '1',
  ALLOW_IN_MEMORY_STORAGE: '1',
  EXPOSE_JOB_SECRETS: '1',
  PRIMARY_BASE_URL: 'https://qa.example',
  BASE_URL: 'https://qa.example',
  STRIPE_SECRET_KEY: 'sk_test_provider_monthly_auto_qa',
  STRIPE_DEFAULT_CURRENCY: 'USD',
  PROVIDER_MONTHLY_BILLING_AUTO_ENABLED: '1',
  PROVIDER_MONTHLY_BILLING_MAX_ATTEMPTS: '3',
  MY_BINDING: null,
  FEEDBACK_EMAIL: {
    async send() {}
  },
  ASSETS: {
    async fetch() {
      return new Response('not found', { status: 404 });
    }
  }
};

const storage = createD1LikeStorage(env.MY_BINDING, { allowInMemory: true });
const period = billingPeriodId('2026-04-21T00:00:00.000Z');

const successUser = { login: 'provider-success', name: 'Provider Success', email: 'success@example.com' };
const failureUser = { login: 'provider-failure', name: 'Provider Failure', email: 'failure@example.com' };

const state = {
  agents: [
    {
      id: 'provider_success_agent',
      owner: successUser.login,
      name: 'Success SaaS Agent',
      description: 'Monthly-priced agent.',
      taskTypes: ['research'],
      pricingModel: 'subscription_required',
      subscriptionMonthlyPriceUsd: 29,
      online: true,
      verificationStatus: 'verified'
    },
    {
      id: 'provider_failure_agent',
      owner: failureUser.login,
      name: 'Failure SaaS Agent',
      description: 'Monthly-priced agent.',
      taskTypes: ['research'],
      pricingModel: 'hybrid',
      subscriptionMonthlyPriceUsd: 19,
      overageMode: 'usage_based',
      online: true,
      verificationStatus: 'verified'
    }
  ],
  jobs: [],
  events: [],
  accounts: [],
  feedbackReports: [],
  chatTranscripts: [],
  recurringOrders: []
};

upsertAccountSettingsInState(state, successUser.login, successUser, 'github-app', {
  billing: {
    billingEmail: successUser.email
  },
  stripe: {
    customerId: 'cus_success',
    customerStatus: 'ready',
    defaultPaymentMethodId: 'pm_success',
    defaultPaymentMethodStatus: 'ready',
    mode: 'configured'
  }
});

upsertAccountSettingsInState(state, failureUser.login, failureUser, 'github-app', {
  billing: {
    billingEmail: failureUser.email
  },
  stripe: {
    customerId: 'cus_failure',
    customerStatus: 'ready',
    defaultPaymentMethodId: 'pm_failure',
    defaultPaymentMethodStatus: 'ready',
    mode: 'configured'
  }
});

await storage.replaceState(state);

const fetchAttempts = {
  success: 0,
  failure: 0
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  if (!String(url).startsWith('https://api.stripe.com/v1/payment_intents')) {
    return originalFetch(input, init);
  }
  const body = String(init?.body || '');
  const params = new URLSearchParams(body);
  const login = params.get('metadata[aiagent2_account_login]');
  if (login === successUser.login) {
    fetchAttempts.success += 1;
    return new Response(JSON.stringify({
      id: `pi_success_${fetchAttempts.success}`,
      status: 'succeeded'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (login === failureUser.login) {
    fetchAttempts.failure += 1;
    return new Response(JSON.stringify({
      error: {
        message: 'Card declined',
        code: 'card_declined'
      }
    }), { status: 402, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unexpected Stripe request for login=${login || '-'}`);
};

async function runScheduledCron() {
  const waitUntilPromises = [];
  await worker.scheduled({ cron: '*/15 * * * *' }, env, {
    waitUntil(promise) {
      waitUntilPromises.push(Promise.resolve(promise));
    }
  });
  await Promise.allSettled(waitUntilPromises);
}

try {
  await runScheduledCron();
  let afterFirst = await storage.getState();
  const successAccount1 = afterFirst.accounts.find((item) => item.login === successUser.login);
  const failureAccount1 = afterFirst.accounts.find((item) => item.login === failureUser.login);
  assert.equal(fetchAttempts.success, 1);
  assert.equal(fetchAttempts.failure, 1);
  assert.equal(successAccount1.stripe.lastProviderMonthlyChargeStatus, 'succeeded');
  assert.equal(successAccount1.stripe.providerMonthlyRetryCount, 0);
  assert.equal(failureAccount1.stripe.providerMonthlyRetryPeriod, period);
  assert.equal(failureAccount1.stripe.providerMonthlyRetryCount, 1);
  assert.equal(failureAccount1.stripe.providerMonthlyLastNotificationPeriod, null);

  await runScheduledCron();
  let afterSecond = await storage.getState();
  const failureAccount2 = afterSecond.accounts.find((item) => item.login === failureUser.login);
  assert.equal(fetchAttempts.success, 1);
  assert.equal(fetchAttempts.failure, 2);
  assert.equal(failureAccount2.stripe.providerMonthlyRetryCount, 2);
  assert.equal(failureAccount2.stripe.providerMonthlyLastNotificationPeriod, null);

  await runScheduledCron();
  let afterThird = await storage.getState();
  const failureAccount3 = afterThird.accounts.find((item) => item.login === failureUser.login);
  assert.equal(fetchAttempts.success, 1);
  assert.equal(fetchAttempts.failure, 3);
  assert.equal(failureAccount3.stripe.providerMonthlyRetryCount, 3);
  assert.equal(failureAccount3.stripe.providerMonthlyLastNotificationPeriod, period);
  assert.ok(String(failureAccount3.stripe.providerMonthlyLastFailureMessage || '').includes('Card declined'));

  await runScheduledCron();
  const afterFourth = await storage.getState();
  const successAccount4 = afterFourth.accounts.find((item) => item.login === successUser.login);
  const failureAccount4 = afterFourth.accounts.find((item) => item.login === failureUser.login);
  assert.equal(fetchAttempts.success, 1);
  assert.equal(fetchAttempts.failure, 3);
  assert.equal(failureAccount4.stripe.providerMonthlyRetryCount, 3);
  assert.equal(failureAccount4.stripe.providerMonthlyLastNotificationPeriod, period);

  const successLedger = providerMonthlyBillingLedgerForLogin(afterFourth, successUser.login, period, successAccount4);
  const failureLedger = providerMonthlyBillingLedgerForLogin(afterFourth, failureUser.login, period, failureAccount4);
  assert.equal(successLedger.dueAmount, 0);
  assert.ok(failureLedger.dueAmount > 0);
  assert.ok(afterFourth.events.some((event) => String(event.message || '').includes('provider monthly auto charge succeeded')));
  assert.ok(afterFourth.events.some((event) => String(event.message || '').includes('provider monthly auto charge failed')));
  assert.ok(afterFourth.events.some((event) => String(event.message || '').includes('provider monthly auto charge notification')));
} finally {
  globalThis.fetch = originalFetch;
}

console.log('provider monthly auto qa passed');
