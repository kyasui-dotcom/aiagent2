const $ = (id) => document.getElementById(id);

const els = {
  flash: $('loginFlash'),
  checkingPanel: $('loginCheckingPanel'),
  checkingStatus: $('loginCheckingStatus'),
  panel: $('loginPanel'),
  hint: $('loginHint'),
  status: $('loginStatus'),
  emailInput: $('loginEmailInput'),
  emailBtn: $('loginEmailBtn'),
  google: $('loginGoogleBtn'),
  github: $('loginGithubBtn'),
  continueBtn: $('loginContinueBtn')
};

let runtimeVisitorId = '';
let authStatusChecked = false;
const AUTH_STATUS_TIMEOUT_MS = 3500;

function safeString(value = '', max = 100) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function visitorId() {
  if (runtimeVisitorId) return runtimeVisitorId;
  const url = new URL(window.location.href);
  const hinted = safeString(url.searchParams.get('visitor_id') || '', 80);
  runtimeVisitorId = hinted || window.crypto?.randomUUID?.() || `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return runtimeVisitorId;
}

function normalizeLocalPath(value = '', fallback = '/') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
}

function postLoginPath(value = '', fallback = '/') {
  const next = normalizeLocalPath(value, fallback);
  try {
    const parsed = new URL(next, window.location.origin);
    if (['/login', '/login.html'].includes(parsed.pathname)) return fallback;
    if (parsed.pathname === '/' && String(parsed.searchParams.get('tab') || '').toLowerCase() === 'work') return '/chat';
    if (parsed.pathname === '/chat.html') return `/chat${parsed.search}${parsed.hash}`;
    if (parsed.pathname === '/admin.html') return `/admin${parsed.search}${parsed.hash}`;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
}

function currentRoute() {
  const url = new URL(window.location.href);
  return {
    source: safeString(url.searchParams.get('source') || 'direct', 40).toLowerCase() || 'direct',
    next: postLoginPath(url.searchParams.get('next') || '', '/chat'),
    authError: safeString(url.searchParams.get('auth_error') || '', 120)
  };
}

function flash(message = '', kind = 'info') {
  if (!els.flash) return;
  const safe = safeString(message, 240);
  if (!safe) {
    els.flash.hidden = true;
    els.flash.textContent = '';
    return;
  }
  els.flash.hidden = false;
  els.flash.className = `auth-flash ${kind}`;
  els.flash.textContent = safe;
}

function showLoginPanel(visible = true) {
  if (els.panel) els.panel.hidden = !visible;
  if (els.checkingPanel) els.checkingPanel.hidden = Boolean(visible);
}

function setCheckingStatus(message = '') {
  if (els.checkingStatus) els.checkingStatus.textContent = safeString(message, 240);
}

async function track(event, meta = {}) {
  const eventName = safeString(event, 64).toLowerCase().replace(/[^a-z0-9_:-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!eventName) return;
  try {
    await fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        event: eventName,
        visitor_id: visitorId(),
        page_path: window.location.pathname || '/login.html',
        current_tab: '',
        source: 'web',
        meta: {
          source: safeString(meta.source || '', 60),
          status: safeString(meta.status || '', 60),
          action: safeString(meta.action || '', 60)
        }
      })
    });
  } catch {
    // Analytics must never block login.
  }
}

function buildAuthUrl(provider = 'google', route = currentRoute()) {
  const base = provider === 'github' ? '/auth/github' : '/auth/google';
  const url = new URL(base, window.location.origin);
  url.searchParams.set('return_to', postLoginPath(route.next));
  url.searchParams.set('login_source', route.source);
  url.searchParams.set('visitor_id', visitorId());
  return `${url.pathname}${url.search}`;
}

function applyProviderAvailability(status = {}) {
  const emailAvailable = Boolean(status?.emailConfigured);
  const googleAvailable = Boolean(status?.googleConfigured);
  const githubAvailable = Boolean(status?.githubConfigured || status?.githubAppConfigured);
  if (els.emailInput) els.emailInput.disabled = !emailAvailable || !authStatusChecked || Boolean(status?.loggedIn);
  if (els.emailBtn) {
    els.emailBtn.hidden = !emailAvailable;
    els.emailBtn.disabled = !emailAvailable || !authStatusChecked || Boolean(status?.loggedIn);
  }
  if (els.google) {
    els.google.hidden = !googleAvailable;
    els.google.disabled = !googleAvailable || !authStatusChecked || Boolean(status?.loggedIn);
  }
  if (els.github) {
    els.github.hidden = !githubAvailable;
    els.github.disabled = !githubAvailable || !authStatusChecked || Boolean(status?.loggedIn);
  }
  if (els.continueBtn) {
    els.continueBtn.hidden = !status?.loggedIn;
  }
  if (!emailAvailable && !googleAvailable && !githubAvailable && els.status) {
    els.status.textContent = 'No login provider is configured on this deployment yet.';
  }
}

function gatedSourceTabLabel(source = '') {
  const safe = safeString(source, 80)
    .replace(/^gate_timeout_/, '')
    .replace(/^gate_/, '')
    .replace(/[^a-z0-9_-]/gi, '')
    .trim();
  return (safe || 'work').toUpperCase();
}

async function loadAuthStatus(route = currentRoute()) {
  authStatusChecked = false;
  showLoginPanel(false);
  setCheckingStatus('Checking your session. This should only take a moment; if it times out, login options will appear.');
  applyProviderAvailability({});
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AUTH_STATUS_TIMEOUT_MS);
  try {
    const response = await fetch('/auth/status', {
      credentials: 'same-origin',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Auth status check failed');
    const status = await response.json().catch(() => ({}));
    const nextPath = postLoginPath(route.next);
    authStatusChecked = true;
    if (status?.loggedIn && els.status) {
      els.status.textContent = 'You are already signed in. Redirecting now.';
    } else if (els.status) {
      els.status.textContent = 'Choose Google, GitHub, or email. After login, CAIt opens the requested chat workspace.';
    }
    if (els.continueBtn) {
      els.continueBtn.hidden = !status?.loggedIn;
      els.continueBtn.onclick = () => { window.location.replace(nextPath); };
    }
    applyProviderAvailability(status);
    if (status?.loggedIn) {
      setCheckingStatus('You are already signed in. Opening your workspace.');
      window.location.replace(nextPath);
      return;
    }
    showLoginPanel(true);
    await track('sign_in_required_shown', { source: `login_page:${route.source}`, status: 'visible' });
  } catch {
    authStatusChecked = true;
    showLoginPanel(true);
    if (els.emailInput) els.emailInput.disabled = false;
    if (els.emailBtn) {
      els.emailBtn.hidden = false;
      els.emailBtn.disabled = false;
    }
    if (els.google) {
      els.google.hidden = false;
      els.google.disabled = false;
    }
    if (els.github) {
      els.github.hidden = false;
      els.github.disabled = false;
    }
    if (els.status) els.status.textContent = 'Could not verify login provider status. You can still try a provider below.';
    await track('sign_in_required_shown', { source: `login_page:${route.source}`, status: 'unknown' });
  } finally {
    window.clearTimeout(timeout);
  }
}

function bindProviderButton(button, provider, route = currentRoute()) {
  if (!button) return;
  const targetUrl = buildAuthUrl(provider, route);
  button.onclick = () => {
    void track(`${provider}_login_started`, {
      source: `login_page:${route.source}`,
      action: route.next
    });
    window.location.href = targetUrl;
  };
}

async function requestEmailLink(route = currentRoute()) {
  const email = safeString(els.emailInput?.value || '', 160).toLowerCase();
  const nextPath = postLoginPath(route.next);
  if (!email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    flash('Enter a valid email address first.', 'error');
    els.emailInput?.focus();
    return;
  }
  if (els.emailBtn) els.emailBtn.disabled = true;
  if (els.status) els.status.textContent = 'Sending your sign-in link. The page stays here.';
  await track('email_login_started', {
    source: `login_page:${route.source}`,
    action: nextPath
  });
  try {
    const response = await fetch('/auth/email/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        email,
        return_to: nextPath,
        login_source: route.source,
        visitor_id: visitorId()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Could not send the email sign-in link.');
    flash('Check your inbox. The email link signs you in and creates your account if needed.', 'ok');
    if (els.status) els.status.textContent = 'Email link sent. Open the link in the same browser if possible.';
  } catch (error) {
    flash(String(error?.message || error || 'Could not send the email sign-in link.'), 'error');
    if (els.status) els.status.textContent = 'Email sign-in failed. Review the address and try again.';
  } finally {
    if (els.emailBtn) els.emailBtn.disabled = false;
  }
}

async function init() {
  const route = currentRoute();
  if (els.hint && route.source.startsWith('gate_')) {
    const gatedTab = gatedSourceTabLabel(route.source);
    els.hint.textContent = `${gatedTab} is private. Sign in or sign up here, then CAIt opens that area.`;
  }
  if (route.authError) {
    flash(`Sign-in failed: ${route.authError}`, 'error');
  }
  if (els.emailBtn) els.emailBtn.onclick = () => { void requestEmailLink(route); };
  if (els.emailInput) els.emailInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void requestEmailLink(route);
  });
  bindProviderButton(els.google, 'google', route);
  bindProviderButton(els.github, 'github', route);
  await track('page_view', { source: `login_page:${route.source}` });
  await loadAuthStatus(route);
}

void init();
