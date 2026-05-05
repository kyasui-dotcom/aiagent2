import { buildCaitAppContext, copyContextJson, downloadContextJson, fetchCaitAppContextFromUrl, sendContextToCait } from './cait-app-bridge.js?v=20260505b';

const data = {
  metrics: {
    sessions: 0,
    clicks: 0,
    conversions: 0,
    rate: '-'
  },
  queries: [],
  pages: [],
  countries: [],
  channels: [],
  measurement: []
};

const state = {
  section: 'dashboard',
  range: '28',
  target: 'cmo_leader',
  googleConnected: false,
  googleWarnings: [],
  googleReportLoaded: false,
  googleReportWarnings: [],
  googleReportDateRange: null,
  gscSite: '',
  ga4Property: '',
  gscSites: [],
  ga4Properties: []
};

let importedContext = null;

const els = {
  sectionButtons: [...document.querySelectorAll('[data-section]')],
  rangeSelect: document.getElementById('rangeSelect'),
  targetSelect: document.getElementById('targetSelect'),
  primaryTableTitle: document.getElementById('primaryTableTitle'),
  primaryTable: document.getElementById('primaryTable'),
  channelChart: document.getElementById('channelChart'),
  measurementTable: document.getElementById('measurementTable'),
  contextPreview: document.getElementById('contextPreview'),
  connectGoogleBtn: document.getElementById('connectGoogleBtn'),
  refreshGoogleSourcesBtn: document.getElementById('refreshGoogleSourcesBtn'),
  loadGoogleReportBtn: document.getElementById('loadGoogleReportBtn'),
  googleSourceStatus: document.getElementById('googleSourceStatus'),
  googleSourceNote: document.getElementById('googleSourceNote'),
  gscSiteSelect: document.getElementById('gscSiteSelect'),
  ga4PropertySelect: document.getElementById('ga4PropertySelect'),
  sendContextBtn: document.getElementById('sendContextBtn'),
  copyContextBtn: document.getElementById('copyContextBtn'),
  sessionsMetric: document.getElementById('sessionsMetric'),
  sessionsDelta: document.getElementById('sessionsDelta'),
  clicksMetric: document.getElementById('clicksMetric'),
  clicksDelta: document.getElementById('clicksDelta'),
  conversionsMetric: document.getElementById('conversionsMetric'),
  conversionsDelta: document.getElementById('conversionsDelta'),
  rateMetric: document.getElementById('rateMetric'),
  rateDelta: document.getElementById('rateDelta'),
  analyticsDashboardCount: document.getElementById('analyticsDashboardCount'),
  analyticsQueriesCount: document.getElementById('analyticsQueriesCount'),
  analyticsPagesCount: document.getElementById('analyticsPagesCount'),
  analyticsChannelsCount: document.getElementById('analyticsChannelsCount'),
  analyticsMeasurementCount: document.getElementById('analyticsMeasurementCount')
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return number.toFixed(number >= 10 ? 0 : 1).replace(/\.0$/, '');
}

function shareOf(value, total) {
  const denominator = Number(total || 0);
  if (!denominator) return 0;
  return Math.round((Number(value || 0) / denominator) * 1000) / 10;
}

function statusClass(value = '') {
  const safe = String(value || '').toLowerCase();
  if (/approved|ready|scheduled/.test(safe)) return 'approved';
  if (/block|missing/.test(safe)) return 'blocked';
  return 'pending';
}

function googleConnectHref() {
  const url = new URL('/auth/google', window.location.origin);
  url.searchParams.set('action', 'link');
  url.searchParams.set('return_to', '/analytics-console');
  url.searchParams.set('login_source', 'analytics_console');
  return url.toString();
}

function optionHtml(value = '', label = '') {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label || value || '-')}</option>`;
}

function flattenGa4Properties(accountSummaries = []) {
  return accountSummaries.flatMap((account) => (Array.isArray(account?.propertySummaries) ? account.propertySummaries : [])
    .map((property) => ({
      value: String(property?.property || ''),
      label: [property?.displayName, property?.property].filter(Boolean).join(' - ')
    })))
    .filter((item) => item.value);
}

function renderGoogleSourceControls() {
  const sites = state.gscSites || [];
  const ga4 = state.ga4Properties || [];
  els.gscSiteSelect.innerHTML = [
    optionHtml('', sites.length ? 'Select Search Console site' : 'No Search Console sites loaded'),
    ...sites.map((site) => optionHtml(site.siteUrl, site.siteUrl))
  ].join('');
  els.ga4PropertySelect.innerHTML = [
    optionHtml('', ga4.length ? 'Select GA4 property' : 'No GA4 properties loaded'),
    ...ga4.map((property) => optionHtml(property.value, property.label))
  ].join('');
  els.gscSiteSelect.value = sites.some((site) => site.siteUrl === state.gscSite) ? state.gscSite : '';
  els.ga4PropertySelect.value = ga4.some((property) => property.value === state.ga4Property) ? state.ga4Property : '';
  const connected = Boolean(state.googleConnected);
  els.googleSourceStatus.textContent = connected ? 'Google connected' : 'Google not connected';
  els.googleSourceStatus.className = `status-pill ${connected ? 'approved' : 'pending'}`;
  if (state.googleReportLoaded && state.googleReportDateRange) {
    els.googleSourceNote.textContent = `Report loaded for ${state.googleReportDateRange.start_date} to ${state.googleReportDateRange.end_date}. Send this evidence packet to CAIt when ready.`;
    return;
  }
  els.googleSourceNote.textContent = connected
    ? `Loaded ${sites.length} Search Console site(s) and ${ga4.length} GA4 propert${ga4.length === 1 ? 'y' : 'ies'}. Select sources, then use Load report to fetch performance rows.`
    : 'Use Connect Google to grant GA4 and Search Console read access, then refresh sources.';
}

async function refreshGoogleSources(options = {}) {
  if (!options.silent) els.refreshGoogleSourcesBtn.textContent = 'Refreshing';
  try {
    const response = await fetch('/api/connectors/google/assets?include=gsc,ga4', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Google sources failed (${response.status})`);
    state.googleConnected = Boolean(payload?.google?.connected);
    state.googleWarnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
    state.gscSites = Array.isArray(payload?.search_console?.sites) ? payload.search_console.sites : [];
    state.ga4Properties = flattenGa4Properties(payload?.ga4?.account_summaries || []);
    if (!state.gscSite && state.gscSites[0]?.siteUrl) state.gscSite = state.gscSites[0].siteUrl;
    if (!state.ga4Property && state.ga4Properties[0]?.value) state.ga4Property = state.ga4Properties[0].value;
  } catch (error) {
    state.googleConnected = false;
    state.googleWarnings = [String(error?.message || error || 'Google sources are not connected.')];
    state.gscSites = [];
    state.ga4Properties = [];
  } finally {
    renderGoogleSourceControls();
    els.contextPreview.textContent = JSON.stringify(buildContext(), null, 2);
    if (!options.silent) els.refreshGoogleSourcesBtn.textContent = 'Refresh sources';
  }
}

function resetReportData() {
  data.metrics = { sessions: 0, clicks: 0, conversions: 0, rate: '-' };
  data.queries = [];
  data.pages = [];
  data.countries = [];
  data.channels = [];
  data.measurement = [];
}

function reportWarningText(payload = {}) {
  const warnings = [
    ...(Array.isArray(payload?.warnings) ? payload.warnings : []),
    ...(Array.isArray(state.googleWarnings) ? state.googleWarnings : [])
  ].filter(Boolean);
  return warnings.length ? warnings.join(' / ') : 'No connector warnings returned.';
}

function applyGoogleReport(payload = {}) {
  resetReportData();
  const ga4 = payload?.ga4 && typeof payload.ga4 === 'object' ? payload.ga4 : null;
  const gsc = payload?.search_console && typeof payload.search_console === 'object' ? payload.search_console : null;
  const requested = payload?.requested && typeof payload.requested === 'object' ? payload.requested : {};
  const sessions = Number(ga4?.totals?.sessions || 0);
  const conversions = Number(ga4?.totals?.conversions || 0);
  const clicks = Number(gsc?.totals?.clicks || 0);
  data.metrics.sessions = sessions;
  data.metrics.clicks = clicks;
  data.metrics.conversions = conversions;
  data.metrics.rate = sessions ? `${formatPercent((conversions / sessions) * 100)}%` : '-';
  data.queries = (Array.isArray(gsc?.rows) ? gsc.rows : []).map((row) => [
    row.query || '(not provided)',
    Number(row.clicks || 0),
    row.position ? Number(row.position).toFixed(1) : '-',
    Number(row.impressions || 0),
    row.page ? `Landing page: ${row.page}` : 'Search Console row'
  ]);
  data.pages = (Array.isArray(ga4?.landing_pages) ? ga4.landing_pages : []).map((row) => [
    row.page || '(not set)',
    Number(row.sessions || 0),
    Number(row.conversions || 0),
    `GA4 ${ga4?.conversion_metric || 'conversion'} metric`
  ]);
  data.channels = (Array.isArray(ga4?.channels) ? ga4.channels : []).map((row) => [
    row.channel || '(not set)',
    shareOf(row.sessions, sessions)
  ]);
  data.countries = (Array.isArray(ga4?.countries) ? ga4.countries : []).map((row) => [
    row.country || '(not set)',
    shareOf(row.sessions, sessions),
    Number(row.conversions || 0)
  ]);
  data.measurement = [
    ['GA4 baseline loaded', `${requested.range_days || state.range}d`, ga4 ? 'ready' : 'missing', ga4 ? `${sessions} sessions / ${conversions} conversions` : 'Select a GA4 property and reload.'],
    ['Search Console baseline loaded', `${requested.range_days || state.range}d`, gsc ? 'ready' : 'missing', gsc ? `${clicks} clicks / ${Number(gsc?.totals?.impressions || 0)} impressions` : 'Select a Search Console site and reload.'],
    ['Leader follow-up window', '24h and 7d', 'scheduled', 'After an approved action, reload this app and send the updated packet to CAIt.']
  ];
  state.googleReportLoaded = true;
  state.googleReportWarnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
  state.googleReportDateRange = {
    start_date: requested.start_date || '',
    end_date: requested.end_date || '',
    range_days: requested.range_days || state.range
  };
}

async function loadGoogleReport() {
  if (!state.gscSite && !state.ga4Property) {
    window.alert('Select at least one Search Console site or GA4 property first.');
    return;
  }
  els.loadGoogleReportBtn.textContent = 'Loading';
  try {
    const url = new URL('/api/connectors/google/analytics-report', window.location.origin);
    url.searchParams.set('range', state.range);
    if (state.gscSite) url.searchParams.set('gsc_site', state.gscSite);
    if (state.ga4Property) url.searchParams.set('ga4_property', state.ga4Property);
    const response = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
      credentials: 'same-origin'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Google report failed (${response.status})`);
    applyGoogleReport(payload);
    renderGoogleSourceControls();
    render();
  } catch (error) {
    state.googleReportLoaded = false;
    state.googleReportWarnings = [String(error?.message || error || 'Google report failed.')];
    els.googleSourceStatus.textContent = 'Report blocked';
    els.googleSourceStatus.className = 'status-pill blocked';
    els.googleSourceNote.textContent = `Report could not load: ${state.googleReportWarnings[0]}`;
    render();
  } finally {
    els.loadGoogleReportBtn.textContent = 'Load report';
  }
}

function artifactRows(context = {}, type = '') {
  const match = (Array.isArray(context.artifacts) ? context.artifacts : [])
    .find((artifact) => String(artifact?.type || '').toLowerCase() === String(type || '').toLowerCase());
  return Array.isArray(match?.rows) ? match.rows : [];
}

function metricByLabel(context = {}, label = '') {
  const target = String(label || '').toLowerCase();
  const metric = (Array.isArray(context.metrics) ? context.metrics : [])
    .find((item) => String(item?.label || item?.name || item?.metric || '').toLowerCase() === target);
  return metric?.value ?? metric?.current ?? '';
}

function applyInboundContext(context = null) {
  if (!context) return;
  importedContext = context;
  const sessions = Number(metricByLabel(context, 'organic_sessions') || metricByLabel(context, 'sessions') || 0);
  const clicks = Number(metricByLabel(context, 'search_clicks') || metricByLabel(context, 'clicks') || 0);
  const conversions = Number(metricByLabel(context, 'conversions') || metricByLabel(context, 'purchases') || 0);
  const rate = metricByLabel(context, 'conversion_rate') || metricByLabel(context, 'cvr') || '';
  if (sessions) data.metrics.sessions = sessions;
  if (clicks) data.metrics.clicks = clicks;
  if (conversions) data.metrics.conversions = conversions;
  if (rate) data.metrics.rate = String(rate);

  const queryRows = artifactRows(context, 'search_queries');
  if (queryRows.length) {
    data.queries = queryRows.map((row) => [
      row.query || row.keyword || row.name || 'unknown query',
      Number(row.clicks || row.sessions || 0),
      row.position || row.avg_position || '-',
      Number(row.conversions || row.cv || row.purchases || 0),
      row.note || row.decision_note || row.intent || context.summary || ''
    ]);
  }

  const pageRows = artifactRows(context, 'landing_pages');
  if (pageRows.length) {
    data.pages = pageRows.map((row) => [
      row.page || row.path || row.url || 'unknown page',
      Number(row.sessions || row.views || 0),
      Number(row.conversions || row.cv || row.purchases || 0),
      row.note || row.decision_note || ''
    ]);
  }

  const channelRows = artifactRows(context, 'channel_mix');
  if (channelRows.length) {
    data.channels = channelRows.map((row) => [
      row.channel || row.source || 'unknown channel',
      Number(row.share || row.percent || row.value || 0)
    ]);
  }

  const countryRows = artifactRows(context, 'country_mix');
  if (countryRows.length) {
    data.countries = countryRows.map((row) => [
      row.country || row.region || 'unknown country',
      Number(row.share || row.percent || 0),
      Number(row.conversions || row.cv || 0)
    ]);
  }

  const target = (Array.isArray(context.handoff_targets) ? context.handoff_targets : []).find(Boolean);
  if (target) {
    state.target = String(target);
    if ([...els.targetSelect.options].some((option) => option.value === state.target)) els.targetSelect.value = state.target;
  }
  const raw = context.raw_context && typeof context.raw_context === 'object' ? context.raw_context : {};
  if (String(raw.googleSearchConsoleSite || raw.searchConsoleSite || '').trim()) state.gscSite = String(raw.googleSearchConsoleSite || raw.searchConsoleSite || '').trim();
  if (String(raw.googleGa4Property || raw.ga4Property || '').trim()) state.ga4Property = String(raw.googleGa4Property || raw.ga4Property || '').trim();
}

function tableHtml(headers = [], rows = []) {
  if (!rows.length) {
    return [
      '<thead><tr>',
      ...headers.map((header) => `<th>${escapeHtml(header)}</th>`),
      '</tr></thead><tbody>',
      `<tr><td colspan="${Math.max(headers.length, 1)}">No server-side app context is loaded yet.</td></tr>`,
      '</tbody>'
    ].join('');
  }
  return [
    '<thead><tr>',
    ...headers.map((header) => `<th>${escapeHtml(header)}</th>`),
    '</tr></thead><tbody>',
    ...rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`),
    '</tbody>'
  ].join('');
}

function primaryRows() {
  if (state.section === 'pages') {
    els.primaryTableTitle.textContent = 'Top landing pages';
    return {
      headers: ['Page', 'Sessions', 'CV', 'Decision note'],
      rows: data.pages.map(([page, sessions, cv, note]) => [
        `<strong>${escapeHtml(page)}</strong>`,
        formatNumber(sessions),
        formatNumber(cv),
        escapeHtml(note)
      ])
    };
  }
  if (state.section === 'channels') {
    els.primaryTableTitle.textContent = 'Country conversion mix';
    return {
      headers: ['Country', 'Traffic share', 'Conversions'],
      rows: data.countries.map(([country, share, conversions]) => [
        escapeHtml(country),
        `${share}%`,
        formatNumber(conversions)
      ])
    };
  }
  els.primaryTableTitle.textContent = 'Top search queries';
  return {
    headers: ['Query', 'Clicks', 'Position', 'CV / Impr.', 'Leader note'],
    rows: data.queries.map(([query, clicks, position, value, note]) => [
      `<strong>${escapeHtml(query)}</strong>`,
      formatNumber(clicks),
      String(position),
      formatNumber(value),
      escapeHtml(note)
    ])
  };
}

function buildContext() {
  const target = String(state.target || 'cmo_leader');
  const importedFacts = importedContext ? [`Imported context: ${importedContext.title || importedContext.id || 'CAIt app context'}`] : [];
  const topQuery = data.queries[0]?.[0] || '';
  const topPage = data.pages[0]?.[0] || '';
  const reportWindow = state.googleReportDateRange?.start_date && state.googleReportDateRange?.end_date
    ? `${state.googleReportDateRange.start_date} to ${state.googleReportDateRange.end_date}`
    : `last ${state.range} days`;
  return buildCaitAppContext({
    source_app: 'analytics_console',
    source_app_label: 'Analytics Console',
    title: `Acquisition analytics summary - ${reportWindow}`,
    summary: state.googleReportLoaded
      ? `GA4 and/or Search Console data was loaded for ${reportWindow}. Use this evidence before choosing the next SEO, CMO, or growth action.`
      : (importedContext?.summary || 'No analytics report is loaded yet. Connect Google, select a GA4 property or Search Console site, and load a report before asking a leader to make evidence-based decisions.'),
    facts: [
      ...importedFacts,
      state.googleReportLoaded ? `Google report loaded: ${reportWindow}` : '',
      state.gscSite ? `Search Console site: ${state.gscSite}` : '',
      state.ga4Property ? `GA4 property: ${state.ga4Property}` : '',
      `Sessions: ${formatNumber(data.metrics.sessions)}`,
      `Search clicks: ${formatNumber(data.metrics.clicks)}`,
      `Conversions: ${formatNumber(data.metrics.conversions)}`,
      `Conversion rate: ${data.metrics.rate}`,
      topQuery ? `Top query: ${topQuery}` : '',
      topPage ? `Top landing page: ${topPage}` : '',
      state.googleReportWarnings.length ? `Google report warnings: ${state.googleReportWarnings.join(' / ')}` : ''
    ].filter(Boolean),
    assumptions: [
      importedContext ? 'This console is using a server-side CAIt app context received by id/token.' : 'No built-in demo analytics data is used.',
      state.googleConnected ? 'Google OAuth is connected for source selection.' : 'Google OAuth is not connected in this browser session.',
      state.googleReportLoaded ? 'The visible rows came from the connected Google APIs.' : 'The visible rows are empty until the connected Google report is loaded.',
      'External source-sensitive claims should be refreshed through connected APIs before final strategy.'
    ],
    metrics: [
      { label: 'sessions', value: data.metrics.sessions, window: `${state.range}d` },
      { label: 'search_clicks', value: data.metrics.clicks, window: `${state.range}d` },
      { label: 'conversions', value: data.metrics.conversions, window: `${state.range}d` },
      { label: 'conversion_rate', value: data.metrics.rate, window: `${state.range}d` }
    ],
    artifacts: [
      { type: 'search_queries', rows: data.queries.map(([query, clicks, position, impressions, note]) => ({ query, clicks, position, impressions, note })) },
      { type: 'landing_pages', rows: data.pages.map(([page, sessions, conversions, note]) => ({ page, sessions, conversions, note })) },
      { type: 'channel_mix', rows: data.channels.map(([channel, share]) => ({ channel, share })) },
      { type: 'country_mix', rows: data.countries.map(([country, share, conversions]) => ({ country, share, conversions })) },
      { type: 'google_sources', rows: [
        state.gscSite ? { source: 'search_console', value: state.gscSite } : null,
        state.ga4Property ? { source: 'ga4', value: state.ga4Property } : null
      ].filter(Boolean) },
      { type: 'google_report_status', rows: [
        {
          loaded: state.googleReportLoaded,
          range: reportWindow,
          warnings: reportWarningText()
        }
      ] }
    ],
    recommended_next_actions: [
      (state.gscSite || state.ga4Property || importedContext) ? 'Ask the selected leader to prioritize one evidence-backed next action.' : 'Connect Google and select Search Console / GA4 sources first.',
      'Use Publisher & Approval Studio for page/meta changes before external publishing.',
      'Run a 24h and 7d post-run measurement after the approved action is executed.'
    ],
    handoff_targets: [target, 'seo_gap', 'growth'],
    raw_context: {
      ...(importedContext ? { received_context: importedContext } : {}),
      googleSearchConsoleSite: state.gscSite,
      googleGa4Property: state.ga4Property,
      googleReportLoaded: state.googleReportLoaded,
      googleReportDateRange: state.googleReportDateRange,
      googleWarnings: state.googleWarnings,
      googleReportWarnings: state.googleReportWarnings
    }
  });
}

function renderCounts() {
  els.analyticsDashboardCount.textContent = importedContext ? '1' : '0';
  els.analyticsQueriesCount.textContent = String(data.queries.length);
  els.analyticsPagesCount.textContent = String(data.pages.length);
  els.analyticsChannelsCount.textContent = String(data.channels.length);
  els.analyticsMeasurementCount.textContent = String(data.measurement.length);
}

function render() {
  renderCounts();
  const m = data.metrics;
  els.sessionsMetric.textContent = formatNumber(m.sessions);
  els.sessionsDelta.textContent = state.googleReportLoaded ? 'Loaded from GA4' : (importedContext ? `Loaded from ${importedContext.source_app_label || importedContext.source_app || 'CAIt context'}` : 'No report loaded');
  els.clicksMetric.textContent = formatNumber(m.clicks);
  els.clicksDelta.textContent = state.googleReportLoaded ? 'Loaded from Search Console' : (importedContext ? 'Search data available' : 'Waiting for report');
  els.conversionsMetric.textContent = formatNumber(m.conversions);
  els.conversionsDelta.textContent = state.googleReportLoaded ? 'Loaded from GA4' : (importedContext ? 'Conversion data available' : 'Waiting for report');
  els.rateMetric.textContent = m.rate;
  els.rateDelta.textContent = state.googleReportLoaded ? 'Derived from sessions and conversions' : (importedContext ? 'Needs page-level split' : 'No rate loaded');

  const primary = primaryRows();
  els.primaryTable.innerHTML = tableHtml(primary.headers, primary.rows);
  els.channelChart.innerHTML = data.channels.length ? data.channels.map(([label, share]) => [
    '<div class="bar-row">',
    `<span>${escapeHtml(label)}</span>`,
    `<div class="bar-track"><div class="bar-fill" style="--bar:${Number(share)}%"></div></div>`,
    `<strong>${Number(share)}%</strong>`,
    '</div>'
  ].join('')).join('') : '<p class="muted">No channel mix is loaded yet.</p>';
  els.measurementTable.innerHTML = tableHtml(
    ['Action', 'Window', 'Status', 'Check'],
    data.measurement.map(([action, windowLabel, status, note]) => [
      escapeHtml(action),
      escapeHtml(windowLabel),
      `<span class="status-pill ${statusClass(status)}">${escapeHtml(status)}</span>`,
      escapeHtml(note)
    ])
  );
  els.contextPreview.textContent = JSON.stringify(buildContext(), null, 2);
}

els.sectionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.section = String(button.dataset.section || 'dashboard');
    els.sectionButtons.forEach((item) => item.classList.toggle('active', item === button));
    render();
  });
});

els.rangeSelect.addEventListener('change', () => {
  state.range = String(els.rangeSelect.value || '28');
  state.googleReportLoaded = false;
  renderGoogleSourceControls();
  render();
});

els.targetSelect.addEventListener('change', () => {
  state.target = String(els.targetSelect.value || 'cmo_leader');
  render();
});

els.connectGoogleBtn.addEventListener('click', () => {
  window.location.href = googleConnectHref();
});

els.refreshGoogleSourcesBtn.addEventListener('click', () => {
  void refreshGoogleSources();
});

els.loadGoogleReportBtn.addEventListener('click', () => {
  void loadGoogleReport();
});

els.gscSiteSelect.addEventListener('change', () => {
  state.gscSite = String(els.gscSiteSelect.value || '');
  state.googleReportLoaded = false;
  renderGoogleSourceControls();
  els.contextPreview.textContent = JSON.stringify(buildContext(), null, 2);
});

els.ga4PropertySelect.addEventListener('change', () => {
  state.ga4Property = String(els.ga4PropertySelect.value || '');
  state.googleReportLoaded = false;
  renderGoogleSourceControls();
  els.contextPreview.textContent = JSON.stringify(buildContext(), null, 2);
});

els.sendContextBtn.addEventListener('click', () => {
  void sendContextToCait(buildContext()).catch((error) => {
    window.alert(`CAIt context handoff failed: ${error.message}`);
  });
});

els.copyContextBtn.addEventListener('click', async () => {
  await copyContextJson(buildContext());
  els.copyContextBtn.textContent = 'Copied';
  window.setTimeout(() => { els.copyContextBtn.textContent = 'Copy context'; }, 1200);
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    downloadContextJson(buildContext(), 'analytics-console-context.json');
  }
});

async function bootstrap() {
  applyInboundContext(await fetchCaitAppContextFromUrl());
  render();
  void refreshGoogleSources({ silent: true });
}

void bootstrap();

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
