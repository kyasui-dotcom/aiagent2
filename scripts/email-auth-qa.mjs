import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';

const PORT = Number(process.env.PORT || 4324);
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL_AUTH_SECRET = 'qa-email-auth-secret';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    ...options
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { status: response.status, headers: response.headers, body };
}

function createEmailAuthToken({
  email = 'owner@example.com',
  returnTo = '/chat.html',
  loginSource = 'login_page',
  visitorId = 'qa-email-success'
} = {}) {
  const payload = {
    kind: 'email-auth',
    email: String(email || '').trim().toLowerCase(),
    returnTo: String(returnTo || '/chat.html').trim() || '/chat.html',
    loginSource: String(loginSource || 'login_page').trim().toLowerCase() || 'login_page',
    visitorId: String(visitorId || '').trim(),
    exp: Date.now() + 20 * 60 * 1000
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', EMAIL_AUTH_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function cookieHeaderFromSetCookie(value = '') {
  const firstPart = String(value || '').split(';')[0].trim();
  return firstPart || '';
}

function funnelTotal(analytics = null, eventName = '') {
  const row = (analytics?.funnel || []).find((item) => item?.event === eventName);
  return Number(row?.total || 0);
}

async function waitForServer(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('Server did not become ready in time');
}

async function main() {
  const child = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ALLOW_IN_MEMORY_STORAGE: '1',
      EMAIL_AUTH_SECRET,
      PORT: String(PORT)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  try {
    await waitForServer();

    const statusRes = await request('/auth/status');
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.emailConfigured, false, 'email login should report unavailable without Resend');

    const invalidEmailRes = await request('/auth/email/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        return_to: '/chat',
        login_source: 'login_page',
        visitor_id: 'qa-email-invalid'
      })
    });
    assert.equal(invalidEmailRes.status, 400, 'invalid email should be rejected');

    const unavailableRes = await request('/auth/email/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@example.com',
        return_to: '/chat.html',
        login_source: 'login_page',
        visitor_id: 'qa-email-valid'
      })
    });
    assert.equal(unavailableRes.status, 503, 'email route should fail cleanly when Resend is not configured');

    const missingTokenRes = await request('/auth/email/verify');
    assert.equal(missingTokenRes.status, 302, 'missing verify token should redirect back to login');
    assert.match(String(missingTokenRes.headers.get('location') || ''), /^\/login\?/);
    assert.match(String(missingTokenRes.headers.get('location') || ''), /auth_error=email_link_invalid/);

    const invalidTokenRes = await request('/auth/email/verify?token=broken-token');
    assert.equal(invalidTokenRes.status, 302, 'invalid verify token should redirect back to login');
    assert.match(String(invalidTokenRes.headers.get('location') || ''), /^\/login\?/);
    assert.match(String(invalidTokenRes.headers.get('location') || ''), /auth_error=email_link_invalid/);

    const successToken = createEmailAuthToken({
      email: 'owner@example.com',
      returnTo: '/chat',
      loginSource: 'gate_work',
      visitorId: 'qa-email-success'
    });
    const verifySuccessRes = await request(`/auth/email/verify?token=${encodeURIComponent(successToken)}`);
    assert.equal(verifySuccessRes.status, 302, 'valid verify token should redirect into the requested route');
    assert.equal(String(verifySuccessRes.headers.get('location') || ''), '/chat');
    const sessionCookie = cookieHeaderFromSetCookie(verifySuccessRes.headers.get('set-cookie') || '');
    assert.match(sessionCookie, /^aiagent2_session=/, 'email verify should issue a session cookie');

    const loggedInStatusRes = await request('/auth/status', {
      headers: {
        cookie: sessionCookie
      }
    });
    assert.equal(loggedInStatusRes.status, 200);
    assert.equal(loggedInStatusRes.body.loggedIn, true, 'issued email session should be recognized');
    assert.equal(loggedInStatusRes.body.authProvider, 'email');
    assert.equal(loggedInStatusRes.body.login, 'owner@example.com');
    const csrfToken = String(loggedInStatusRes.body.csrfToken || '').trim();
    assert.ok(csrfToken, 'logged-in auth status should expose a CSRF token for browser writes');

    const loggedInLoginPageRes = await request('/login?next=%2F%3Ftab%3Dwork', {
      headers: {
        cookie: sessionCookie
      }
    });
    assert.equal(loggedInLoginPageRes.status, 302, 'logged-in users should not receive the login HTML');
    assert.equal(String(loggedInLoginPageRes.headers.get('location') || ''), '/chat');
    assert.equal(String(loggedInLoginPageRes.headers.get('cache-control') || ''), 'no-store');

    const loggedInLoginAliasRes = await request('/login?next=%2F%3Ftab%3Dagents', {
      headers: {
        cookie: sessionCookie
      }
    });
    assert.equal(loggedInLoginAliasRes.status, 302, 'logged-in users should also skip the /login alias');
    assert.equal(String(loggedInLoginAliasRes.headers.get('location') || ''), '/?tab=agents');

    const firstSnapshotRes = await request('/api/snapshot', {
      headers: {
        cookie: sessionCookie
      }
    });
    assert.equal(firstSnapshotRes.status, 200);
    assert.equal(funnelTotal(firstSnapshotRes.body.conversionAnalytics, 'signup_completed'), 1, 'first verified email login should create one signup conversion');
    assert.equal(funnelTotal(firstSnapshotRes.body.conversionAnalytics, 'email_login_completed'), 1, 'first verified email login should create one login completion');
    assert.equal(Number(firstSnapshotRes.body.conversionAnalytics?.actuals?.accounts?.total || 0), 1, 'first verified email login should create one account');
    const firstSignupRecent = (firstSnapshotRes.body.conversionAnalytics?.recent || []).find((event) => event?.event === 'signup_completed');
    const firstLoginRecent = (firstSnapshotRes.body.conversionAnalytics?.recent || []).find((event) => event?.event === 'email_login_completed');
    assert.equal(firstSignupRecent?.status, 'created');
    assert.equal(firstLoginRecent?.status, 'created');

    const customReturnToken = createEmailAuthToken({
      email: 'owner@example.com',
      returnTo: '/?tab=agents',
      loginSource: 'gate_agents',
      visitorId: 'qa-email-agents'
    });
    const customReturnRes = await request(`/auth/email/verify?token=${encodeURIComponent(customReturnToken)}`);
    assert.equal(customReturnRes.status, 302);
    assert.equal(String(customReturnRes.headers.get('location') || ''), '/?tab=agents', 'custom in-product return path should be preserved');
    const secondSessionCookie = cookieHeaderFromSetCookie(customReturnRes.headers.get('set-cookie') || '') || sessionCookie;

    const secondSnapshotRes = await request('/api/snapshot', {
      headers: {
        cookie: secondSessionCookie
      }
    });
    assert.equal(secondSnapshotRes.status, 200);
    assert.equal(funnelTotal(secondSnapshotRes.body.conversionAnalytics, 'signup_completed'), 1, 'repeat verified email login should not create another signup conversion');
    assert.equal(funnelTotal(secondSnapshotRes.body.conversionAnalytics, 'email_login_completed'), 2, 'repeat verified email login should still create a login completion');
    const secondLoginRecent = (secondSnapshotRes.body.conversionAnalytics?.recent || []).find((event) => event?.event === 'email_login_completed');
    assert.equal(secondLoginRecent?.status, 'existing');

    const externalReturnToken = createEmailAuthToken({
      email: 'owner@example.com',
      returnTo: 'https://evil.example/steal-session',
      loginSource: 'gate_work',
      visitorId: 'qa-email-open-redirect'
    });
    const externalReturnRes = await request(`/auth/email/verify?token=${encodeURIComponent(externalReturnToken)}`);
    assert.equal(externalReturnRes.status, 302);
    assert.equal(String(externalReturnRes.headers.get('location') || ''), '/', 'verify should not allow external redirect targets');

    const logoutRes = await request('/auth/logout', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        origin: BASE,
        'x-aiagent2-csrf': csrfToken
      }
    });
    assert.equal(logoutRes.status, 200, 'logout should succeed for an active session');
    assert.equal(logoutRes.body.ok, true);
    assert.equal(logoutRes.body.redirect_to, '/', 'logout should point back to the public start route');
    assert.match(String(logoutRes.headers.get('set-cookie') || ''), /aiagent2_session=;/, 'logout should clear the session cookie');

    const loggedOutStatusRes = await request('/auth/status', {
      headers: {
        cookie: sessionCookie
      }
    });
    assert.equal(loggedOutStatusRes.status, 200);
    assert.equal(loggedOutStatusRes.body.loggedIn, false, 'logged out session should no longer authenticate');

    console.log('email auth qa passed');
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    if (child.exitCode && child.exitCode !== 0 && !output.includes('email auth qa passed')) {
      process.stderr.write(output);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
