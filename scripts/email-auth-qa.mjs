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
  returnTo = '/?tab=work',
  loginSource = 'login_page',
  visitorId = 'qa-email-success'
} = {}) {
  const payload = {
    kind: 'email-auth',
    email: String(email || '').trim().toLowerCase(),
    returnTo: String(returnTo || '/?tab=work').trim() || '/?tab=work',
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
        return_to: '/?tab=work',
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
        return_to: '/?tab=work',
        login_source: 'login_page',
        visitor_id: 'qa-email-valid'
      })
    });
    assert.equal(unavailableRes.status, 503, 'email route should fail cleanly when Resend is not configured');

    const missingTokenRes = await request('/auth/email/verify');
    assert.equal(missingTokenRes.status, 302, 'missing verify token should redirect back to login');
    assert.match(String(missingTokenRes.headers.get('location') || ''), /^\/login\.html\?/);
    assert.match(String(missingTokenRes.headers.get('location') || ''), /auth_error=email_link_invalid/);

    const invalidTokenRes = await request('/auth/email/verify?token=broken-token');
    assert.equal(invalidTokenRes.status, 302, 'invalid verify token should redirect back to login');
    assert.match(String(invalidTokenRes.headers.get('location') || ''), /^\/login\.html\?/);
    assert.match(String(invalidTokenRes.headers.get('location') || ''), /auth_error=email_link_invalid/);

    const successToken = createEmailAuthToken({
      email: 'owner@example.com',
      returnTo: '/?tab=work',
      loginSource: 'gate_work',
      visitorId: 'qa-email-success'
    });
    const verifySuccessRes = await request(`/auth/email/verify?token=${encodeURIComponent(successToken)}`);
    assert.equal(verifySuccessRes.status, 302, 'valid verify token should redirect into the requested route');
    assert.equal(String(verifySuccessRes.headers.get('location') || ''), '/?tab=work');
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

    const customReturnToken = createEmailAuthToken({
      email: 'owner@example.com',
      returnTo: '/?tab=agents',
      loginSource: 'gate_agents',
      visitorId: 'qa-email-agents'
    });
    const customReturnRes = await request(`/auth/email/verify?token=${encodeURIComponent(customReturnToken)}`);
    assert.equal(customReturnRes.status, 302);
    assert.equal(String(customReturnRes.headers.get('location') || ''), '/?tab=agents', 'custom in-product return path should be preserved');

    const externalReturnToken = createEmailAuthToken({
      email: 'owner@example.com',
      returnTo: 'https://evil.example/steal-session',
      loginSource: 'gate_work',
      visitorId: 'qa-email-open-redirect'
    });
    const externalReturnRes = await request(`/auth/email/verify?token=${encodeURIComponent(externalReturnToken)}`);
    assert.equal(externalReturnRes.status, 302);
    assert.equal(String(externalReturnRes.headers.get('location') || ''), '/', 'verify should not allow external redirect targets');

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
