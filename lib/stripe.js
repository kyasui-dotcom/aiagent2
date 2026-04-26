const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
]);

function normalizeString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeCurrency(value, fallback = 'USD') {
  return normalizeString(value, fallback).toUpperCase() || fallback;
}

function normalizeCountry(value, fallback = 'JP') {
  return normalizeString(value, fallback).toUpperCase() || fallback;
}

function normalizeAmount(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return +n.toFixed(2);
}

function parseSubscriptionPriceMap(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function minorUnitDivisor(currency = 'USD') {
  return ZERO_DECIMAL_CURRENCIES.has(normalizeCurrency(currency)) ? 1 : 100;
}

export function amountToMinorUnits(amount, currency = 'USD') {
  const divisor = minorUnitDivisor(currency);
  return Math.max(0, Math.round(normalizeAmount(amount, 0) * divisor));
}

export function amountFromMinorUnits(amountMinor, currency = 'USD') {
  const divisor = minorUnitDivisor(currency);
  const scaled = Number(amountMinor || 0) / divisor;
  return divisor === 1 ? Math.round(scaled) : +scaled.toFixed(2);
}

function flattenFormEntries(input, prefix = '') {
  const entries = [];
  if (input == null) return entries;
  if (Array.isArray(input)) {
    input.forEach((value, index) => {
      const key = prefix ? `${prefix}[${index}]` : String(index);
      entries.push(...flattenFormEntries(value, key));
    });
    return entries;
  }
  if (typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      if (value == null) continue;
      const nextKey = prefix ? `${prefix}[${key}]` : key;
      entries.push(...flattenFormEntries(value, nextKey));
    }
    return entries;
  }
  entries.push([prefix, String(input)]);
  return entries;
}

function buildMetadata(account = null, extra = {}) {
  return {
    aiagent2_account_login: normalizeString(account?.login),
    aiagent2_account_id: normalizeString(account?.id),
    ...extra
  };
}

function stripeApiError(message, status = 500, details = null) {
  const error = new Error(message);
  error.statusCode = status;
  error.details = details;
  return error;
}

export function stripeConfigFromEnv(source = {}, options = {}) {
  return {
    secretKey: normalizeString(source.STRIPE_SECRET_KEY),
    publishableKey: normalizeString(source.STRIPE_PUBLISHABLE_KEY),
    webhookSecret: normalizeString(source.STRIPE_WEBHOOK_SECRET),
    defaultCurrency: normalizeCurrency(source.STRIPE_DEFAULT_CURRENCY, 'USD'),
    subscriptionPriceMap: parseSubscriptionPriceMap(source.STRIPE_SUBSCRIPTION_PRICES_JSON),
    baseUrl: normalizeString(options.baseUrl || source.BASE_URL)
  };
}

export function stripeConfigured(config = null) {
  return Boolean(config?.secretKey);
}

export function stripePublicConfig(config = null) {
  const map = config?.subscriptionPriceMap || {};
  return {
    configured: stripeConfigured(config),
    publishableKeyPresent: Boolean(config?.publishableKey),
    webhookConfigured: Boolean(config?.webhookSecret),
    defaultCurrency: config?.defaultCurrency || 'USD',
    baseUrl: config?.baseUrl || '',
    availableSubscriptionPlans: Object.keys(map).filter((key) => normalizeString(map[key]))
  };
}

export async function stripeRequest(config, { method = 'POST', path = '/', form = null, body = null, headers = {} } = {}) {
  if (!stripeConfigured(config)) throw stripeApiError('Stripe is not configured', 503);
  const url = `https://api.stripe.com${path}`;
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Authorization', `Bearer ${config.secretKey}`);
  let payload = body;
  if (form) {
    const params = new URLSearchParams();
    for (const [key, value] of flattenFormEntries(form)) params.append(key, value);
    payload = params.toString();
    requestHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
  } else if (body && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers: requestHeaders, body: payload });
  const text = await res.text();
  let json = {};
  if (text) {
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
  }
  if (!res.ok) {
    const message = json?.error?.message || `Stripe API request failed (${res.status})`;
    throw stripeApiError(message, res.status, json);
  }
  return json;
}

export async function ensureStripeCustomer(config, account) {
  const existing = normalizeString(account?.stripe?.customerId);
  if (existing) return { customerId: existing, created: false };
  const email = normalizeString(account?.billing?.billingEmail || account?.payout?.payoutEmail);
  const name = normalizeString(account?.billing?.companyName || account?.billing?.legalName || account?.profile?.displayName || account?.login);
  const form = {
    metadata: buildMetadata(account, { aiagent2_kind: 'platform_customer' })
  };
  if (email) form.email = email;
  if (name) form.name = name;
  const customer = await stripeRequest(config, {
    path: '/v1/customers',
    form
  });
  return { customerId: customer.id, created: true, customer };
}

export function resolveSubscriptionPriceId(config, plan = '', explicitPriceId = '') {
  const direct = normalizeString(explicitPriceId);
  if (direct) return direct;
  const safePlan = normalizeString(plan).toLowerCase();
  if (!safePlan) return '';
  return normalizeString(config?.subscriptionPriceMap?.[safePlan]);
}

export function resolveSubscriptionPlanFromPriceId(config, priceId = '') {
  const safePriceId = normalizeString(priceId);
  if (!safePriceId) return 'none';
  for (const [plan, candidate] of Object.entries(config?.subscriptionPriceMap || {})) {
    if (normalizeString(candidate) === safePriceId) return normalizeString(plan).toLowerCase() || 'none';
  }
  return 'none';
}

export async function createSetupCheckoutSession(config, { account, customerId, baseUrl = '' }) {
  const root = normalizeString(baseUrl || config.baseUrl);
  const metadata = buildMetadata(account, { aiagent2_kind: 'payment_method_setup' });
  return stripeRequest(config, {
    path: '/v1/checkout/sessions',
    form: {
      mode: 'setup',
      customer: customerId,
      success_url: `${root}/?tab=settings&stripe=setup_success`,
      cancel_url: `${root}/?tab=settings&stripe=setup_cancel`,
      metadata,
      setup_intent_data: { metadata }
    }
  });
}

export async function createSubscriptionCheckoutSession(config, { account, customerId, baseUrl = '', plan = '', priceId = '' }) {
  const resolvedPriceId = resolveSubscriptionPriceId(config, plan, priceId);
  if (!resolvedPriceId) throw stripeApiError('Subscription price is not configured for this plan', 400);
  const root = normalizeString(baseUrl || config.baseUrl);
  const metadata = buildMetadata(account, { aiagent2_kind: 'subscription_checkout', aiagent2_plan: normalizeString(plan).toLowerCase() });
  return stripeRequest(config, {
    path: '/v1/checkout/sessions',
    form: {
      mode: 'subscription',
      customer: customerId,
      success_url: `${root}/?tab=settings&stripe=subscription_success`,
      cancel_url: `${root}/?tab=settings&stripe=subscription_cancel`,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      subscription_data: { metadata },
      metadata
    }
  });
}

export async function retrievePaymentIntent(config, paymentIntentId) {
  return stripeRequest(config, { method: 'GET', path: `/v1/payment_intents/${paymentIntentId}` });
}

export async function retrieveSetupIntent(config, setupIntentId) {
  return stripeRequest(config, { method: 'GET', path: `/v1/setup_intents/${setupIntentId}` });
}

export async function retrieveSubscription(config, subscriptionId) {
  return stripeRequest(config, { method: 'GET', path: `/v1/subscriptions/${subscriptionId}` });
}

export async function updateCustomerDefaultPaymentMethod(config, customerId, paymentMethodId) {
  if (!normalizeString(customerId) || !normalizeString(paymentMethodId)) return null;
  return stripeRequest(config, {
    path: `/v1/customers/${customerId}`,
    form: {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    }
  });
}

export async function createOffSessionMonthlyInvoicePaymentIntent(config, { account, customerId, paymentMethodId, amount, currency = 'USD', ledgerAmount = null, period = '' }) {
  const safeCurrency = normalizeCurrency(currency, config.defaultCurrency || 'USD');
  const amountMinor = amountToMinorUnits(amount, safeCurrency);
  if (amountMinor <= 0) throw stripeApiError('Monthly invoice amount must be greater than zero', 400);
  const metadata = buildMetadata(account, {
    aiagent2_kind: 'monthly_invoice_charge',
    aiagent2_period: normalizeString(period),
    aiagent2_amount_minor: String(amountMinor),
    aiagent2_currency: safeCurrency,
    ...(ledgerAmount != null ? { aiagent2_ledger_amount: String(ledgerAmount) } : {})
  });
  return stripeRequest(config, {
    path: '/v1/payment_intents',
    form: {
      amount: amountMinor,
      currency: safeCurrency.toLowerCase(),
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: 'true',
      confirm: 'true',
      description: `CAIt month-end usage${period ? ` ${period}` : ''}`,
      metadata
    }
  });
}

export async function createOffSessionProviderMonthlyPaymentIntent(config, { account, customerId, paymentMethodId, amount, currency = 'USD', ledgerAmount = null, period = '' }) {
  const safeCurrency = normalizeCurrency(currency, config.defaultCurrency || 'USD');
  const amountMinor = amountToMinorUnits(amount, safeCurrency);
  if (amountMinor <= 0) throw stripeApiError('Provider monthly amount must be greater than zero', 400);
  const metadata = buildMetadata(account, {
    aiagent2_kind: 'provider_monthly_saas_charge',
    aiagent2_period: normalizeString(period),
    aiagent2_amount_minor: String(amountMinor),
    aiagent2_currency: safeCurrency,
    ...(ledgerAmount != null ? { aiagent2_ledger_amount: String(ledgerAmount) } : {})
  });
  return stripeRequest(config, {
    path: '/v1/payment_intents',
    form: {
      amount: amountMinor,
      currency: safeCurrency.toLowerCase(),
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: 'true',
      confirm: 'true',
      description: `CAIt provider monthly SaaS fees${period ? ` ${period}` : ''}`,
      metadata
    }
  });
}

export async function createConnectedAccount(config, { account, payout = {} }) {
  const existing = normalizeString(account?.stripe?.connectedAccountId);
  if (existing) return { connectedAccountId: existing, created: false };
  const country = normalizeCountry(payout.country || account?.payout?.country || 'JP');
  const email = normalizeString(payout.payoutEmail || account?.payout?.payoutEmail || account?.billing?.billingEmail);
  const businessType = normalizeString(payout.entityType || account?.payout?.entityType || 'individual').toLowerCase();
  const businessName = normalizeString(payout.displayName || account?.payout?.displayName || account?.profile?.displayName || account?.login);
  const businessUrl = normalizeString(payout.website || account?.payout?.website);
  const form = {
    country,
    business_type: businessType === 'company' ? 'company' : 'individual',
    capabilities: {
      transfers: { requested: 'true' }
    },
    controller: {
      fees: { payer: 'application' },
      losses: { payments: 'application' },
      stripe_dashboard: { type: 'express' },
      requirement_collection: 'stripe'
    },
    metadata: buildMetadata(account, { aiagent2_kind: 'provider_account' })
  };
  if (email) form.email = email;
  if (businessName || businessUrl) {
    form.business_profile = {};
    if (businessName) form.business_profile.name = businessName;
    if (businessUrl) form.business_profile.url = businessUrl;
  }
  const created = await stripeRequest(config, {
    path: '/v1/accounts',
    form
  });
  return { connectedAccountId: created.id, created: true, account: created };
}

export async function createConnectOnboardingLink(config, { connectedAccountId, baseUrl = '' }) {
  const root = normalizeString(baseUrl || config.baseUrl);
  return stripeRequest(config, {
    path: '/v1/account_links',
    form: {
      account: connectedAccountId,
      type: 'account_onboarding',
      refresh_url: `${root}/?tab=settings&stripe=connect_refresh`,
      return_url: `${root}/?tab=settings&stripe=connect_return`
    }
  });
}

export async function retrieveConnectedAccount(config, connectedAccountId) {
  return stripeRequest(config, { method: 'GET', path: `/v1/accounts/${connectedAccountId}` });
}

export async function createConnectedAccountTransfer(config, { account, connectedAccountId, amount, currency = 'USD', description = '', metadata = {} }) {
  const safeConnectedAccountId = normalizeString(connectedAccountId);
  if (!safeConnectedAccountId) throw stripeApiError('Connected account is missing', 400);
  const safeCurrency = normalizeCurrency(currency, config.defaultCurrency || 'USD');
  const amountMinor = amountToMinorUnits(amount, safeCurrency);
  if (amountMinor <= 0) throw stripeApiError('Payout amount must be greater than zero', 400);
  return stripeRequest(config, {
    path: '/v1/transfers',
    form: {
      amount: amountMinor,
      currency: safeCurrency.toLowerCase(),
      destination: safeConnectedAccountId,
      description: normalizeString(description, 'CAIt provider payout'),
      metadata: buildMetadata(account, {
        aiagent2_kind: 'provider_payout_transfer',
        aiagent2_amount_minor: String(amountMinor),
        aiagent2_currency: safeCurrency,
        ...metadata
      })
    }
  });
}

function parseStripeSignatureHeader(header = '') {
  const parts = String(header || '').split(',').map((item) => item.trim()).filter(Boolean);
  const data = { timestamp: '', signatures: [] };
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') data.timestamp = value || '';
    if (key === 'v1' && value) data.signatures.push(value);
  }
  return data;
}

function timingSafeHexEqual(a = '', b = '') {
  const left = String(a);
  const right = String(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function hmacSha256Hex(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyStripeWebhookSignature(payload, signatureHeader, webhookSecret, toleranceSec = 300) {
  const secret = normalizeString(webhookSecret);
  if (!secret) throw stripeApiError('Stripe webhook secret is not configured', 503);
  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed.timestamp || !parsed.signatures.length) throw stripeApiError('Invalid Stripe signature header', 400);
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(parsed.timestamp || 0));
  if (!Number.isFinite(ageSec) || ageSec > toleranceSec) throw stripeApiError('Stripe webhook timestamp is too old', 400);
  const signedPayload = `${parsed.timestamp}.${payload}`;
  const expected = await hmacSha256Hex(secret, signedPayload);
  const matched = parsed.signatures.some((candidate) => timingSafeHexEqual(candidate, expected));
  if (!matched) throw stripeApiError('Invalid Stripe webhook signature', 400);
  return true;
}
