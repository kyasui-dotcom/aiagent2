(function initGlobalAnalytics() {
  const ANALYTICS_ID = 'G-CDHM437KEX';
  const PRODUCTION_HOSTS = new Set(['aiagent-marketplace.net', 'www.aiagent-marketplace.net']);
  const DISABLE_COOKIE_NAME = 'cait_disable_ga4';
  const DISABLE_PARAMS = ['no_ga', 'disable_ga', 'cait_no_ga', 'cait_disable_ga4', 'ga_opt_out'];
  const ENABLE_PARAMS = ['enable_ga', 'cait_enable_ga4', 'ga_opt_in'];

  function flagEnabled(value) {
    return !['0', 'false', 'off', 'no'].includes(String(value || '1').trim().toLowerCase());
  }

  function rememberDisabled(value) {
    try {
      const maxAge = value ? 31536000 : 0;
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${DISABLE_COOKIE_NAME}=${value ? '1' : ''}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
    } catch {}
  }

  function isRememberedDisabled() {
    try {
      return document.cookie.split(';').some((item) => item.trim() === `${DISABLE_COOKIE_NAME}=1`);
    } catch {
      return false;
    }
  }

  function disableAnalytics(reason, persist = false) {
    window[`ga-disable-${ANALYTICS_ID}`] = true;
    window.__aiagent2AnalyticsDisabledReason = reason;
    if (persist) rememberDisabled(true);
  }

  function applyQueryOptOut() {
    const params = new URLSearchParams(window.location.search || '');
    for (const key of ENABLE_PARAMS) {
      if (params.has(key) && flagEnabled(params.get(key))) {
        rememberDisabled(false);
        window[`ga-disable-${ANALYTICS_ID}`] = false;
      }
    }
    for (const key of DISABLE_PARAMS) {
      if (params.has(key) && flagEnabled(params.get(key))) {
        disableAnalytics(`query:${key}`, true);
      }
    }
  }

  function baseSkipReason() {
    if (!ANALYTICS_ID) return 'missing_id';
    if (!/^https?:$/.test(window.location.protocol)) return 'unsupported_protocol';
    if (!PRODUCTION_HOSTS.has(String(window.location.hostname || '').toLowerCase())) return 'non_production_host';
    if (window[`ga-disable-${ANALYTICS_ID}`] || isRememberedDisabled()) return 'opted_out';
    return '';
  }

  function platformAdminStatus(status) {
    return Boolean(status && typeof status === 'object' && status.isPlatformAdmin);
  }

  async function promiseWithTimeout(promise, timeoutMs = 1500) {
    let timeoutId = 0;
    try {
      return await Promise.race([
        promise,
        new Promise((resolve) => {
          timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
        })
      ]);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  async function authStatus() {
    if (window.__CAIT_FAST_AUTH_RESOLVED__) return window.__CAIT_FAST_AUTH_RESOLVED__;
    if (window.__CAIT_FAST_AUTH_STATUS__ && typeof window.__CAIT_FAST_AUTH_STATUS__.then === 'function') {
      return promiseWithTimeout(window.__CAIT_FAST_AUTH_STATUS__);
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch('/auth/status', {
        credentials: 'same-origin',
        signal: controller.signal
      });
      return response.ok ? response.json() : null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function loadAnalytics() {
    if (window.__aiagent2AnalyticsLoaded) return;
    window.__aiagent2AnalyticsLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_ID)}`;
    document.head.appendChild(script);
    window.gtag('js', new Date());
    window.gtag('config', ANALYTICS_ID);
  }

  async function start() {
    applyQueryOptOut();
    const initialReason = baseSkipReason();
    if (initialReason) {
      disableAnalytics(initialReason);
      return;
    }
    const status = await authStatus();
    if (platformAdminStatus(status)) {
      disableAnalytics('platform_admin', true);
      return;
    }
    const finalReason = baseSkipReason();
    if (finalReason) {
      disableAnalytics(finalReason);
      return;
    }
    loadAnalytics();
  }

  void start();
}());
