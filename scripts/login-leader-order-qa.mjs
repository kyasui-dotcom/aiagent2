import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../worker.js';
import {
  chatEngineBuildIntakeCombinedPrompt,
  chatEngineBuildJobPayload,
  chatEngineBuildOrderDraft
} from '../public/chat-engine.js';
import { deliveryQualityScoreForJob } from '../lib/shared.js';

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
  BRAVE_SEARCH_API_KEY: 'brave-login-leader-qa',
  MY_BINDING: null,
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/login') {
        return new Response('<section id="loginCheckingPanel"></section>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        });
      }
      if (url.pathname === '/login.html') {
        return new Response(null, { status: 307, headers: { location: '/login' } });
      }
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
  returnTo = '/chat',
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
  const loginAlias = await request('/login');
  assert.equal(loginAlias.status, 200, 'worker should serve the Cloudflare Assets /login alias without a self-redirect');
  assert.match(loginAlias.text, /loginCheckingPanel/);

  const token = await emailAuthToken();
  const verified = await request(`/auth/email/verify?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
  assert.equal(verified.status, 302, 'email verification should redirect after issuing a session');
  assert.equal(verified.headers.location, '/chat', 'login should return to chat');
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
  assert.equal(loginPage.headers.location, '/chat');
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
  for (let attempt = 0; attempt < 160; attempt += 1) {
    latest = await request(`/api/jobs/${workflowJobId}`, {}, { sessionCookie });
    assert.equal(latest.status, 200, 'workflow job should remain readable by the requester');
    const status = String(latest.body?.job?.status || latest.body?.status || '');
    if (['completed', 'failed', 'timed_out', 'blocked'].includes(status)) return latest.body.job || latest.body;
    await sleep(500);
  }
  const job = latest?.body?.job || latest?.body || {};
  assert.fail(`workflow ${workflowJobId} did not finish; latest=${JSON.stringify({
    status: job.status,
    statusCounts: job.workflow?.statusCounts || {},
    childRuns: (Array.isArray(job.workflow?.childRuns) ? job.workflow.childRuns : []).map((run) => ({
      taskType: run.taskType,
      status: run.status,
      sequencePhase: run.sequencePhase,
      failureReason: run.failureReason || run.failure_reason || ''
    }))
  })}`);
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
    if (String(url || '').startsWith('https://api.search.brave.com/')) {
      return new Response(JSON.stringify({
        web: {
          results: [
            {
              title: 'Japan travel eSIM buying guide',
              url: 'https://example.test/japan-esim-guide',
              description: 'Search-backed QA evidence for Japan eSIM traveler acquisition.'
            },
            {
              title: 'Japan travel connectivity tips',
              url: 'https://example.test/japan-connectivity',
              description: 'QA source for owned-content and SEO growth planning.'
            }
          ]
        }
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

    const initialPrepare = await request('/api/work/prepare-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: '集客したいです',
        requestedStrategy: 'auto'
      })
    }, { sessionCookie });
    assert.equal(initialPrepare.status, 200, 'new chat prepare-order should route broad acquisition intent');
    assert.equal(initialPrepare.body.taskType, 'cmo_leader');
    assert.equal(initialPrepare.body.ownerType, 'leader');
    assert.equal(initialPrepare.body.activeLeaderTaskType, 'cmo_leader');
    assert.equal(initialPrepare.body.resolvedOrderStrategy, 'multi');
    assert.equal(initialPrepare.body.status, 'needs_input');

    const intakeAnswer = [
      '1. autowifi-travel.com https://autowifi-travel.com/ is an eSIM ecommerce site.',
      '2. English-speaking travelers visiting Japan.',
      '3. Purchase Japan eSIMs.',
      '4. No ads; use SEO and owned content as candidate channels.',
      '5. Plan, prepare SEO/landing/growth actions, and return progress plus final delivery in chat.'
    ].join('\n');
    const combinedPrompt = chatEngineBuildIntakeCombinedPrompt(initialPrepare.body.intake, intakeAnswer);
    const answeredPrepare = await request('/api/work/prepare-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: combinedPrompt,
        task_type: initialPrepare.body.taskType,
        active_leader_task_type: initialPrepare.body.activeLeaderTaskType,
        active_leader_name: initialPrepare.body.activeLeaderName,
        requestedStrategy: 'auto',
        intake_answered: true
      })
    }, { sessionCookie });
    assert.equal(answeredPrepare.status, 200, 'answered leader intake should produce a dispatchable draft');
    assert.equal(answeredPrepare.body.taskType, 'cmo_leader');
    assert.equal(answeredPrepare.body.ownerType, 'leader');
    assert.equal(answeredPrepare.body.resolvedOrderStrategy, 'multi');
    assert.notEqual(answeredPrepare.body.status, 'needs_input', 'answered leader intake should not repeat questions');

    const chatDraft = chatEngineBuildOrderDraft(combinedPrompt, answeredPrepare.body, {
      originalPrompt: '集客したいです',
      intakeAnswered: true,
      intakeChecked: true,
      activeLeaderTaskType: answeredPrepare.body.activeLeaderTaskType,
      activeLeaderName: answeredPrepare.body.activeLeaderName
    });
    const chatJobPayload = chatEngineBuildJobPayload(chatDraft, {
      parentAgentId: 'chatux',
      source: 'chatux',
      visitorId: 'qa-login-leader-order',
      budgetCap: 500,
      deadlineSec: 300,
      broker: {
        chatux: {
          delivery_channel: 'chat',
          return_path: '/chat',
          visitor_id: 'qa-login-leader-order'
        },
        intake: {
          prepared_in_chat: true,
          answered: true,
          checked_at: new Date().toISOString()
        }
      }
    });

    const created = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(chatJobPayload)
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
    assert.ok(['completed', 'blocked'].includes(completed.status), `workflow should reach a terminal delivery state: ${JSON.stringify({
      status: completed.status,
      failureReason: completed.failureReason || '',
      authority: completed.output?.report?.authority_request || completed.executorState?.authorityRequired || null,
      statusCounts
    })}`);
    assert.ok(childRuns.length >= 5, 'CMO leader orchestration should include enough specialist runs');
    assert.ok(childRuns.some((run) => run.taskType === 'research'), 'CMO workflow should include research');
    assert.ok(childRuns.some((run) => run.taskType === 'teardown'), 'CMO workflow should include competitor teardown');
    assert.ok(childRuns.some((run) => run.taskType === 'media_planner'), 'CMO workflow should include media planning');
    assert.ok(childRuns.some((run) => run.taskType === 'growth'), 'CMO workflow should include growth execution planning');
    assert.equal(Number(statusCounts.failed || 0), 0, 'no child run should fail');
    assert.equal(Number(statusCounts.queued || 0), 0, 'no child run should remain queued');
    assert.equal(Number(statusCounts.running || 0), 0, 'no child run should remain running');
    assert.ok(String(completed.output?.summary || '').trim(), 'workflow should produce a final delivery summary');
    if (completed.status === 'blocked') {
      const authority = completed.output?.report?.authority_request || completed.executorState?.authorityRequired || {};
      const authorityText = JSON.stringify(authority);
      assert.ok(
        /approval|connector|capabilit|required|x\.post|directory|automation|write/i.test(authorityText),
        'blocked terminal workflow should expose the connector/approval requirement'
      );
      assert.ok(
        Number(statusCounts.blocked || 0) > 0 || completed.output?.report?.completion_state === 'blocked_waiting_for_approval',
        'blocked terminal workflow should count blocked children or mark the parent completion state as approval-waiting'
      );
    } else {
      assert.equal(Number(statusCounts.blocked || 0), 0, 'completed workflow should not leave blocked child runs');
    }
    assert.ok(Array.isArray(completed.output?.report?.childRuns), 'final delivery should include child run summaries');
    assert.equal(completed.output.report.childRuns.length, childRuns.length, 'delivery child summaries should match actual child runs');
    assert.ok(Array.isArray(completed.output?.files) && completed.output.files.length > 0, 'final delivery should include a deliverable file');
    const deliveryText = [
      completed.output?.summary,
      completed.output?.report?.summary,
      completed.output?.report?.nextAction,
      ...completed.output.files.map((file) => `${file?.name || ''}\n${file?.content || ''}`)
    ].map((value) => typeof value === 'string' ? value : JSON.stringify(value || '')).join('\n');
    assert.ok(deliveryQualityScoreForJob(completed) >= 75, 'final delivery should pass the delivery quality score gate');
    assert.match(deliveryText, /autowifi-travel\.com/i, 'delivery should preserve the product URL/domain');
    assert.match(deliveryText, /eSIM|esim/i, 'delivery should preserve the product category');
    assert.match(deliveryText, /purchase|paid conversion|購入|有料化/i, 'delivery should preserve the purchase conversion goal');
    assert.doesNotMatch(deliveryText, /\baccount signups\b/i, 'purchase-focused orders must not be rewritten as account signup work');

    const settingsAfter = await request('/api/settings', {}, { sessionCookie });
    assert.equal(settingsAfter.status, 200);
    assert.ok(Number(settingsAfter.body.account.billing.arrearsTotal || 0) >= 0, 'leader order should keep billing state readable after terminal delivery');

    console.log('login leader order qa passed');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
