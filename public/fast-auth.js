(() => {
  const privateTabs = new Set(['work', 'agents', 'connect', 'settings', 'admin', 'ops']);
  const url = new URL(window.location.href);
  const requestedTab = String(url.searchParams.get('tab') || '').trim().toLowerCase();
  const targetTab = privateTabs.has(requestedTab) ? requestedTab : '';
  const section = String(url.searchParams.get('section') || '').trim();
  const nextPath = targetTab === 'settings' && section
    ? `/?tab=settings&section=${encodeURIComponent(section)}`
    : targetTab
      ? `/?tab=${encodeURIComponent(targetTab)}`
      : '/?tab=work';
  const visitorId = window.crypto?.randomUUID?.() || `v_${Date.now().toString(36)}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  const statusPromise = fetch('/auth/status', {
    credentials: 'same-origin',
    signal: controller.signal
  })
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null)
    .finally(() => window.clearTimeout(timeout));
  window.__CAIT_FAST_AUTH_STATUS__ = statusPromise;
  window.__CAIT_FAST_AUTH_TARGET__ = targetTab || '';
  const showScreen = (screen) => {
    document.querySelectorAll('[data-screen]').forEach((node) => {
      node.hidden = node.dataset.screen !== screen;
    });
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === screen);
    });
  };
  if (targetTab) showScreen('auth-check');
  statusPromise.then((status) => {
    const resolvedStatus = status && typeof status === 'object'
      ? status
      : { loggedIn: false, authProvider: 'unknown', fastAuthFallback: true };
    window.__CAIT_FAST_AUTH_RESOLVED__ = resolvedStatus;
    if (targetTab && resolvedStatus.loggedIn) {
      showScreen(targetTab);
      return;
    }
    if (targetTab && !resolvedStatus.loggedIn) {
      const loginUrl = new URL('/login.html', window.location.origin);
      loginUrl.searchParams.set('source', resolvedStatus.fastAuthFallback ? `gate_timeout_${targetTab}` : `gate_${targetTab}`);
      loginUrl.searchParams.set('next', nextPath);
      loginUrl.searchParams.set('visitor_id', visitorId);
      window.location.replace(`${loginUrl.pathname}${loginUrl.search}`);
      return;
    }
    if (!targetTab && resolvedStatus.loggedIn) {
      showScreen('work');
    }
  });
})();
