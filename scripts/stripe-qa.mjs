import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { amountFromMinorUnits, amountToMinorUnits, stripeConfigFromEnv, stripePublicConfig, verifyStripeWebhookSignature } from '../lib/stripe.js';
import { applyStripeRefundToAccount, applySubscriptionRefillToAccount, defaultAccountSettingsForUser, recordStripeTopupInAccount } from '../lib/shared.js';

const config = stripeConfigFromEnv({
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
  STRIPE_DEFAULT_CURRENCY: 'usd',
  STRIPE_SUBSCRIPTION_PRICES_JSON: '{"starter":"price_starter","pro":"price_pro"}',
  BASE_URL: 'https://aiagent-marketplace.net'
});

const publicConfig = stripePublicConfig(config);
assert.equal(publicConfig.configured, true);
assert.equal(publicConfig.publishableKeyPresent, true);
assert.equal(publicConfig.webhookConfigured, true);
assert.equal(publicConfig.defaultCurrency, 'USD');
assert.deepEqual(publicConfig.availableSubscriptionPlans, ['starter', 'pro']);

assert.equal(amountToMinorUnits(500, 'JPY'), 500);
assert.equal(amountToMinorUnits(12.34, 'USD'), 1234);
assert.equal(amountFromMinorUnits(500, 'JPY'), 500);
assert.equal(amountFromMinorUnits(1234, 'USD'), 12.34);

const payload = JSON.stringify({
  id: 'evt_test_123',
  type: 'checkout.session.completed'
});
const timestamp = Math.floor(Date.now() / 1000);
const signature = createHmac('sha256', 'whsec_test_123').update(`${timestamp}.${payload}`).digest('hex');

await verifyStripeWebhookSignature(payload, `t=${timestamp},v1=${signature}`, 'whsec_test_123');

let badSignatureError = null;
try {
  await verifyStripeWebhookSignature(payload, `t=${timestamp},v1=bad_signature`, 'whsec_test_123');
} catch (error) {
  badSignatureError = error;
}
assert.ok(badSignatureError);
assert.match(String(badSignatureError.message || ''), /Invalid Stripe webhook signature/i);

const account = defaultAccountSettingsForUser({ login: 'stripe-qa' }, 'github');
account.billing.depositBalance = 4000;
account.stripe.topupHistory = recordStripeTopupInAccount(account, {
  kind: 'deposit_topup',
  checkoutSessionId: 'cs_test_123',
  paymentIntentId: 'pi_test_123',
  amount: 4000,
  currency: 'USD'
});
const partialRefund = applyStripeRefundToAccount(account, {
  kind: 'deposit_topup',
  paymentIntentId: 'pi_test_123',
  amount: 4000,
  amountRefunded: 1000,
  currency: 'USD'
});
assert.equal(partialRefund.blocked, false);
assert.equal(partialRefund.delta, 1000);
assert.equal(partialRefund.billingPatch.depositBalance, 3000);
assert.equal(partialRefund.billingPatch.arrearsTotal, 0);

const exhaustedAccount = defaultAccountSettingsForUser({ login: 'stripe-qa-2' }, 'github');
exhaustedAccount.billing.depositBalance = 500;
exhaustedAccount.billing.arrearsTotal = 0;
exhaustedAccount.stripe.topupHistory = recordStripeTopupInAccount(exhaustedAccount, {
  kind: 'deposit_topup',
  paymentIntentId: 'pi_test_456',
  amount: 3000,
  currency: 'USD'
});
const largeRefund = applyStripeRefundToAccount(exhaustedAccount, {
  kind: 'deposit_topup',
  paymentIntentId: 'pi_test_456',
  amount: 3000,
  amountRefunded: 2000,
  currency: 'USD'
});
assert.equal(largeRefund.blocked, true);
assert.equal(largeRefund.delta, 0);
assert.equal(largeRefund.availableDeposit, 500);
assert.equal(largeRefund.requiredDeposit, 2000);
assert.equal(largeRefund.billingPatch.depositBalance, 500);
assert.equal(largeRefund.billingPatch.arrearsTotal, 0);

const subscriptionAccount = defaultAccountSettingsForUser({ login: 'stripe-qa-sub' }, 'github');
subscriptionAccount.stripe.subscriptionStatus = 'active';
const firstRefill = applySubscriptionRefillToAccount(subscriptionAccount, {
  plan: 'starter',
  periodEnd: '2026-05-01T00:00:00.000Z',
  at: '2026-04-08T00:00:00.000Z'
});
assert.equal(firstRefill.granted, true);
assert.equal(firstRefill.amount, 3150);
assert.equal(firstRefill.billingPatch.depositBalance, 3150);
const duplicateRefill = applySubscriptionRefillToAccount({
  ...subscriptionAccount,
  billing: firstRefill.billingPatch,
  stripe: firstRefill.stripePatch
}, {
  plan: 'starter',
  periodEnd: '2026-05-01T00:00:00.000Z',
  at: '2026-04-08T01:00:00.000Z'
});
assert.equal(duplicateRefill.granted, false);
assert.equal(duplicateRefill.amount, 0);

console.log('stripe qa passed');
