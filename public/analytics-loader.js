(function initGlobalAnalytics() {
  const ANALYTICS_ID = 'G-CDHM437KEX';
  if (!ANALYTICS_ID || !/^https?:$/.test(window.location.protocol)) return;
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
}());
