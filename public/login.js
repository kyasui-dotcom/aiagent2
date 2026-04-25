const $ = (id) => document.getElementById(id);

const els = {
  flash: $('loginFlash'),
  hint: $('loginHint'),
  status: $('loginStatus'),
  google: $('loginGoogleBtn'),
  github: $('loginGithubBtn'),
  continueBtn: $('loginContinueBtn')
};

let runtimeVisitorId = '';
let authStatusChecked = false;

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

function normalizeLocalPath(value = '', fallback = '/?tab=work') {
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

function currentRoute() {
  const url = new URL(window.location.href);
  return {
    source: safeString(url.searchParams.get('source') || 'direct', 40).toLowerCase() || 'direct',
    next: normalizeLocalPath(url.searchParams.get('next') || '', '/?tab=work'),
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
  els.flash.className = `box flash ${kind}`;
  els.flash.textContent = safe;
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
  url.searchParams.set('return_to', route.next);
  url.searchParams.set('login_source', route.source);
  url.searchParams.set('visitor_id', visitorId());
  return `${url.pathname}${url.search}`;
}

function applyProviderAvailability(status = {}) {
  const googleAvailable = Boolean(status?.googleConfigured);
  const githubAvailable = Boolean(status?.githubConfigured || status?.githubAppConfigured);
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
  if (!googleAvailable && !githubAvailable && els.status) {
    els.status.textContent = 'No login provider is configured on this deployment yet.';
  }
}

async function loadAuthStatus(route = currentRoute()) {
  authStatusChecked = false;
  applyProviderAvailability({});
  try {
    const response = await fetch('/auth/status', { credentials: 'same-origin' });
    const status = await response.json().catch(() => ({}));
    authStatusChecked = true;
    if (status?.loggedIn && els.status) {
      els.status.textContent = 'You are already signed in. Continue when ready. Session checking does not auto-navigate.';
    } else if (els.status) {
      els.status.textContent = 'Choose one account provider. After login, CAIt opens the requested product area.';
    }
    if (els.continueBtn) {
      els.continueBtn.hidden = !status?.loggedIn;
      els.continueBtn.onclick = () => { window.location.href = route.next; };
    }
    applyProviderAvailability(status);
  } catch {
    authStatusChecked = true;
    if (els.google) {
      els.google.hidden = false;
      els.google.disabled = false;
    }
    if (els.github) {
      els.github.hidden = false;
      els.github.disabled = false;
    }
    if (els.status) els.status.textContent = 'Could not verify login provider status. You can still try a provider below.';
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

async function init() {
  const route = currentRoute();
  if (els.hint && route.source.startsWith('gate_')) {
    const gatedTab = route.source.replace(/^gate_/, '').toUpperCase();
    els.hint.textContent = `${gatedTab} is private after login. Sign in here, then CAIt opens that area.`;
  }
  if (route.authError) {
    flash(`Sign-in failed: ${route.authError}`, 'error');
  }
  bindProviderButton(els.google, 'google', route);
  bindProviderButton(els.github, 'github', route);
  await track('page_view', { source: `login_page:${route.source}` });
  await track('sign_in_required_shown', { source: `login_page:${route.source}`, status: 'visible' });
  await loadAuthStatus(route);
}

void init();
