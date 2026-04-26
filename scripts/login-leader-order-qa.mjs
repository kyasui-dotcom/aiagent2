import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../worker.js';

const EMAIL_AUTH_SECRET = 'qa-login-leader-email-secret';
const STRIPE_WEBHOOK_SECRET = 'whsec_login_leader_qa';
const BASE = 'https://example.test';

const env = {
  APP_VERSION: '0.2.0-test',
  ALLOW_IN_MEMORY_STORAGE: '1',
  SESSION_SECRET: 'login-leader-order-qa-session',
  EMAIL_AUTH_SECRET,
  STRIPE_SECRET_KEY: 'sk_test_login_leader_qa',
  STRIPE_WEBHOOK_SECRET,
  STRIPE_DEFAULT_CURRENCY: 'USD',
  BASE_URL: BASE,
  MY_BINDING: null,
  ASSETS: {
    async fetch() {
      return new Response('not found', { status: 404 });
    }
  }
};

const originalFetch = globalThis.fetch;
const sessionCsrfTokens = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64urlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

async function sealPayload(payload) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SESSION_SECRET));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return `${base64urlEncode(iv)}.${base64urlEncode(new Uint8Array(ciphertext))}`;
}

async function emailAuthToken({
  email = 'leader@example.com',
  returnTo = '/?tab=work',
  loginSource = 'qa_login_leader_order',
  visitorId = 'qa-login-leader-order'
} = {}) {
  const payload = {
    kind: 'email-auth',
    email: String(email || '').trim().toLowerCase(),
    returnTo,
    loginSource,
    visitorId,
    exp: Date.now() + 20 * 60 * 1000
  };
  return sealPayload(payload);
}

function cookieHeaderFromSetCookie(value = '') {
  return String(value || '').split(';')[0].trim();
}

function stripeSignatureForPayload(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function request(path, init = {}, options = {}) {
  const waitUntilPromises = [];
  const headers = new Headers(init.headers || {});
  if (options.sessionCookie) headers.set('cookie', options.sessionCookie);
  const method = String(init.method || 'GET').toUpperCase();
  if (options.sessionCookie && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !options.skipCsrf) {
    if (!headers.has('origin')) headers.set('origin', BASE);
    if (!headers.has('x-aiagent2-csrf')) headers.set('x-aiagent2-csrf', sessionCsrfTokens.get(options.sessionCookie) || '');
  }
  const response = await worker.fetch(new Request(`${BASE}${path}`, { ...init, headers }), env, {
    waitUntil(promise) {
      waitUntilPromises.push(Promise.resolve(promise));
    }
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  await Promise.allSettled(waitUntilPromises);
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    text
  };
}

async function loginWithEmail() {
  const token = await emailAuthToken();
  const verified = await request(`/auth/email/verify?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
  assert.equal(verified.status, 302, 'email verification should redirect after issuing a session');
  assert.equal(verified.headers.location, '/?tab=work', 'login should return to Work');
  const sessionCookie = cookieHeaderFromSetCookie(verified.headers['set-cookie'] || '');
  assert.match(sessionCookie, /^aiagent2_session=/, 'login should issue a session cookie');

  const status = await request('/auth/status', {}, { sessionCookie });
  assert.equal(status.status, 200);
  assert.equal(status.body.loggedIn, true, 'auth status should recognize the logged-in session');
  assert.equal(status.body.login, 'leader@example.com');
  assert.ok(String(status.body.csrfToken || '').trim(), 'logged-in session should expose a CSRF token');
  sessionCsrfTokens.set(sessionCookie, status.body.csrfToken);

  const loginPage = await request('/login.html?next=%2F%3Ftab%3Dwork', {}, { sessionCookie });
  assert.equal(loginPage.status, 302, 'logged-in worker sessions should skip the login HTML');
  assert.equal(loginPage.headers.location, '/?tab=work');
  assert.equal(loginPage.headers['cache-control'], 'no-store');

  return sessionCookie;
}

async function registerCardForLoggedInAccount(sessionCookie) {
  const setupPayload = JSON.stringify({
    id: 'evt_login_leader_setup_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_login_leader_setup_1',
        customer: 'cus_login_leader',
        setup_intent: 'seti_login_leader_card',
        metadata: {
          aiagent2_kind: 'payment_method_setup',
          aiagent2_account_login: 'leader@example.com'
        }
      }
    }
  });
  const setupWebhook = await request('/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': stripeSignatureForPayload(setupPayload)
    },
    body: setupPayload
  }, { skipCsrf: true });
  assert.equal(setupWebhook.status, 200, 'Stripe setup webhook should be accepted');
  assert.equal(setupWebhook.body.ok, true);

  const settings = await request('/api/settings', {}, { sessionCookie });
  assert.equal(settings.status, 200);
  assert.equal(settings.body.account.billing.mode, 'monthly_invoice');
  assert.equal(settings.body.account.billing.invoiceApproved, true);
  assert.equal(settings.body.account.stripe.defaultPaymentMethodId, 'pm_login_leader');
}

async function waitForWorkflowCompletion(workflowJobId, sessionCookie) {
  let latest = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = await request(`/api/jobs/${workflowJobId}`, {}, { sessionCookie });
    assert.equal(latest.status, 200, 'workflow job should remain readable by the requester');
    const status = String(latest.body?.job?.status || latest.body?.status || '');
    if (['completed', 'failed', 'timed_out'].includes(status)) return latest.body.job || latest.body;
    await sleep(50);
  }
  assert.fail(`workflow ${workflowJobId} did not finish`);
}

async function main() {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === 'https://api.stripe.com/v1/setup_intents/seti_login_leader_card') {
      return new Response(JSON.stringify({
        id: 'seti_login_leader_card',
        object: 'setup_intent',
        payment_method: 'pm_login_leader'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === 'https://api.stripe.com/v1/customers/cus_login_leader') {
      return new Response(JSON.stringify({
        id: 'cus_login_leader',
        object: 'customer',
        invoice_settings: { default_payment_method: 'pm_login_leader' }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return originalFetch(input, init);
  };

  try {
    const anonymousOrder = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parent_agent_id: 'qa-runner',
        task_type: 'cmo_leader',
        prompt: 'Anonymous users must not be able to dispatch paid leader work.',
        skip_intake: true
      })
    });
    assert.equal(anonymousOrder.status, 401, 'leader orders should require login when open write is disabled');

    const sessionCookie = await loginWithEmail();

    const paymentBlocked = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parent_agent_id: 'qa-runner',
        task_type: 'cmo_leader',
        prompt: 'CMO leader: create a concrete acquisition plan for an AI agent marketplace targeting SaaS founders, with channels, copy, KPIs, and a 7-day checklist.',
        order_strategy: 'multi',
        skip_intake: true,
        budget_cap: 500
      })
    }, { sessionCookie });
    assert.equal(paymentBlocked.status, 402, 'logged-in paid leader order should require a registered card first');
    assert.equal(paymentBlocked.body.code, 'payment_method_missing');

    await registerCardForLoggedInAccount(sessionCookie);

    const created = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parent_agent_id: 'qa-runner',
        task_type: 'cmo_leader',
        prompt: 'CMO leader: create a concrete acquisition plan for an AI agent marketplace targeting SaaS founders. Include competitor-informed positioning, priority channels, copy variants, KPIs, a 7-day checklist, and actions specialists can execute.',
        order_strategy: 'multi',
        skip_intake: true,
        budget_cap: 500
      })
    }, { sessionCookie });
    assert.equal(created.status, 201, 'card-ready user should be able to send the leader order');
    assert.equal(created.body.mode, 'workflow');
    assert.equal(created.body.selection_mode, 'multi');
    assert.equal(created.body.order_strategy_resolved, 'multi');
    assert.ok(created.body.workflow_job_id, 'leader order should create a workflow parent');
    assert.ok(Array.isArray(created.body.child_runs), 'leader order should expose child runs immediately');
    assert.ok(created.body.child_runs.some((run) => (run.taskType || run.task_type) === 'cmo_leader'), 'workflow should include the CMO leader run');
    assert.ok(created.body.child_runs.some((run) => (run.taskType || run.task_type) !== 'cmo_leader'), 'workflow should include specialist runs');

    const completed = await waitForWorkflowCompletion(created.body.workflow_job_id, sessionCookie);
    const childRuns = Array.isArray(completed.workflow?.childRuns) ? completed.workflow.childRuns : [];
    const statusCounts = completed.workflow?.statusCounts || {};
    assert.equal(completed.status, 'completed', 'workflow should complete');
    assert.ok(childRuns.length >= 5, 'CMO leader orchestration should include enough specialist runs');
    assert.ok(childRuns.some((run) => run.taskType === 'research'), 'CMO workflow should include research');
    assert.ok(childRuns.some((run) => run.taskType === 'teardown'), 'CMO workflow should include competitor teardown');
    assert.ok(childRuns.some((run) => run.taskType === 'media_planner'), 'CMO workflow should include media planning');
    assert.ok(childRuns.some((run) => run.taskType === 'growth'), 'CMO workflow should include growth execution planning');
    assert.equal(Number(statusCounts.failed || 0), 0, 'no child run should fail');
    assert.equal(Number(statusCounts.blocked || 0), 0, 'no child run should remain blocked');
    assert.equal(Number(statusCounts.queued || 0), 0, 'no child run should remain queued');
    assert.equal(Number(statusCounts.running || 0), 0, 'no child run should remain running');
    assert.ok(String(completed.output?.summary || '').trim(), 'workflow should produce a final delivery summary');
    assert.ok(Array.isArray(completed.output?.report?.childRuns), 'final delivery should include child run summaries');
    assert.equal(completed.output.report.childRuns.length, childRuns.length, 'delivery child summaries should match actual child runs');
    assert.ok(Array.isArray(completed.output?.files) && completed.output.files.length > 0, 'final delivery should include a deliverable file');

    const settingsAfter = await request('/api/settings', {}, { sessionCookie });
    assert.equal(settingsAfter.status, 200);
    assert.ok(Number(settingsAfter.body.account.billing.arrearsTotal || 0) > 0, 'completed leader order should accrue to month-end billing');

    console.log('login leader order qa passed');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
