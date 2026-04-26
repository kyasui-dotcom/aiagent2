import http from 'node:http';
import { createHmac, createPrivateKey, createSign, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createD1LikeStorage } from './lib/storage.js';
import { BUILT_IN_KINDS, builtInAgentHealthPayload, runBuiltInAgent } from './lib/builtin-agents.js';
import { GITHUB_ADAPTER_MARKER, adapterNextStepText, buildGithubAdapterPlan, createGithubBranch, createGithubPullRequest, fetchGithubBranchSha, fetchGithubRepoTree, fetchGithubTextFile, findKnownBrokerPath, upsertGithubTextFile } from './lib/github-adapter.js';
import { BILLING_DISPLAY_CURRENCY, WELCOME_CREDITS_GRANT_AMOUNT, accountIdForLogin, accountIdentityForProvider, accountSettingsForIdentity, accountSettingsForLogin, aliasLoginsForAccount, applyStripeRefundToAccount, applySubscriptionRefillToAccount, authenticateOrderApiKey, billingAuditsForJobIds, billingModeFromJob, billingPeriodId, billingProfileForAccount, buildAdminDashboard, buildAgentId, buildConversionAnalytics, buildFollowupConversationContext, buildIntakeClarification, buildMonthlyAccountSummary, chatSessionIdForJob, chatTrainingExamplesForClient, chatTranscriptsForClient, computeScore, connectorActionLabel, connectorOAuthActionInstruction, createChatTranscript, createConversionEventPayload, createFeedbackReport, createOrderApiKeyInState, createRecurringOrderInState, defaultLoginForAuthUser, deleteRecurringOrderInState, displayCurrencyToLedgerAmount, dueRecurringOrders, estimateBilling, estimateRunWindow, feedbackReportsForClient, formatFeedbackReportEmail, hideChatMemoryTranscriptForLoginInState, inferTaskSequence, inferTaskType, isAgentOwnedByLogin, isBillableJob, isJobVisibleToLogin, isPrivateNetworkHostname, jobsVisibleToLogin, ledgerAmountToDisplayCurrency, linkIdentityToAccountInState, makeEvent, markRecurringOrderRunInState, maybeGrantWelcomeCreditsForSignupInState, maybeGrantWelcomeCreditsForVerifiedAgentInState, mergeAccountsInState, mergeProtectedPromptSourceIntoInput, normalizeTaskTypes, nowIso, optimizeOrderPromptForBroker, promptInjectionGuardForPrompt, providerMonthlyBillingLedgerForLogin, providerPayoutLedgerForLogin, publicEventView, recordProviderMonthlyChargeInAccount, recurringOrderToJobPayload, recurringOrdersVisibleToLogin, recordStripeTopupInAccount, recoverMissingAccountsInState, releaseBillingReservationInState, requesterContextFromUser, reserveBillingEstimateInState, revokeOrderApiKeyInState, sanitizeAccountSettingsForClient, sanitizeBillingSettingsPatch, sanitizeExecutorPreferencesPatch, sanitizeFeedbackReportForClient, sanitizePayoutSettingsPatch, settleBillingForJobInState, suggestAutoTopupChargeAmount, touchOrderApiKeyUsageInState, updateChatTranscriptReviewInState, updateFeedbackReportInState, updateRecurringOrderInState, upsertAccountSettingsForIdentityInState, upsertAccountSettingsInState } from './lib/shared.js';
import { agentPatternFitScore, applyGuestTrialSignupDebitInState, buildAgentTeamDeliveryOutput, deliveryQualityScoreForJob, ensureGuestTrialAccountInState, guestTrialLoginForVisitorId, guestTrialUsageForVisitorInState, isAgentTeamLaunchIntent, isFreeWebGrowthIntent, isLargeAgentTeamIntent, normalizeGuestTrialRequest, orderPreflightForAgent, ownChatMemoryForClient } from './lib/shared.js';
import { amountFromMinorUnits, createConnectedAccount, createConnectedAccountTransfer, createConnectOnboardingLink, createDepositCheckoutSession, createOffSessionMonthlyInvoicePaymentIntent, createOffSessionProviderMonthlyPaymentIntent, createOffSessionTopupPaymentIntent, createSetupCheckoutSession, createSubscriptionCheckoutSession, ensureStripeCustomer, resolveSubscriptionPlanFromPriceId, retrieveConnectedAccount, retrievePaymentIntent, retrieveSetupIntent, retrieveSubscription, stripeConfigFromEnv, stripeConfigured, stripePublicConfig, updateCustomerDefaultPaymentMethod, verifyStripeWebhookSignature } from './lib/stripe.js';
import { MANIFEST_CANDIDATE_PATHS, assessAgentRegistrationSafety, buildDraftManifestFromAgentSkill, buildDraftManifestFromRepoAnalysis, deriveManifestSignalPaths, normalizeManifest, parseAndValidateManifest, sanitizeManifestForPublic, validateManifest } from './lib/manifest.js';
import { agentReviewRouteBlockReason, applyAgentReviewToAgentRecord, isAgentReviewApproved, manualAgentReviewFromBody, runAgentAutoReview } from './lib/agent-review.js';
import { runAgentOnboardingCheck } from './lib/onboarding.js';
import { isBuiltInSampleAgent, sampleKindFromAgent, verifyAgentByHealthcheck } from './lib/verify.js';
import { buildXAuthorizeUrl, buildXPkcePair, exchangeXOAuthCode, fetchXProfile, postXTweet, publicXConnectorStatus, validateXPostText, xConnectorFromOAuthToken, xOAuthConfigured, xTokenEncryptionConfigured } from './lib/x-connector.js';
import { connectorTokenEncryptionConfigured, decryptConnectorSecret, githubConnectorFromOAuthToken, googleConnectorFromOAuthToken } from './lib/connector-secrets.js';
import {
  deliveryExecutionConfirmationRequirement,
  deliveryDraftDefaultsForType,
  deliveryScheduleConfirmationRequirement,
  isDeliveryExecutionActionSupported,
  isDeliveryScheduleActionSupported,
  deliveryPublishTargetInstruction,
  prepareDeliveryExecutionContractPayload,
  prepareDeliveryPublishContractPayload
} from './public/delivery-action-contract.js';
import {
  APP_SETTING_DEFAULTS,
  WORK_ORDER_UI_LABELS,
  isDeveloperExecutionIntentText,
  resolveStaticWorkAction
} from './public/work-action-registry.js';
import { inferWorkIntentRoute, prepareWorkOrderSeed } from './public/work-intent-resolver.js';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const runtimeAppVersion = process.env.APP_VERSION || '0.2.0';
const normalizedAppVersion = String(runtimeAppVersion || '').trim().toLowerCase();
const isExplicitTestRuntime = normalizedAppVersion.includes('test') || String(process.env.NODE_ENV || '').trim().toLowerCase() === 'test';
const allowInMemoryStorage = isExplicitTestRuntime && String(process.env.ALLOW_IN_MEMORY_STORAGE || '').trim() === '1';
const storage = createD1LikeStorage(null, { allowInMemory: allowInMemoryStorage });
if (process.env.BOOTSTRAP_STATE_JSON) {
  try {
    await storage.replaceState(JSON.parse(process.env.BOOTSTRAP_STATE_JSON));
  } catch (error) {
    throw new Error(`Invalid BOOTSTRAP_STATE_JSON: ${error.message}`);
  }
}
const sseClients = new Set();
const sessions = new Map();
const oauthStates = new Map();
const rateLimitBuckets = new Map();
const secretEncoder = new TextEncoder();
const generatedSessionSecret = `${randomBytes(32).toString('hex')}-${Date.now()}`;
const sessionSecret = process.env.SESSION_SECRET || generatedSessionSecret;
const githubClientId = process.env.GITHUB_CLIENT_ID || '';
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || '';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const deployTarget = process.env.DEPLOY_TARGET || 'cloudflare-worker';
const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;
const SESSION_REFRESH_WINDOW_SEC = 7 * 24 * 60 * 60;
const SESSION_REFRESH_MIN_INTERVAL_SEC = 6 * 60 * 60;
const EMAIL_AUTH_MAX_AGE_SEC = 20 * 60;
const MAX_PROVIDER_MARKUP_RATE = 1;
const SESSION_VERSION = 2;
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://www.google.com https://cloudflareinsights.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' https://github.com https://accounts.google.com https://twitter.com https://x.com https://checkout.stripe.com https://connect.stripe.com",
    'upgrade-insecure-requests'
  ].join('; '),
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};

function securityHeaders(headers = {}) {
  return { ...SECURITY_HEADERS, ...headers };
}

function googleConfigured() {
  return Boolean(googleClientId && googleClientSecret);
}

function googleOAuthScope() {
  return String(
    process.env.GOOGLE_OAUTH_SCOPE
    || [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/presentations.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send'
    ].join(' ')
  ).trim() || 'openid email profile';
}

function googleLoginScope() {
  const configured = String(process.env.GOOGLE_LOGIN_SCOPE || '').trim();
  return configured || 'openid email profile';
}

function googleScopeForOAuthAction(action = 'login') {
  return String(action || '').trim().toLowerCase() === 'link'
    ? googleOAuthScope()
    : googleLoginScope();
}

function googlePromptForOAuthAction(action = 'login') {
  return String(action || '').trim().toLowerCase() === 'link'
    ? 'select_account consent'
    : 'select_account';
}

function xOAuthScopeLabel() {
  return 'tweet.read tweet.write users.read offline.access';
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, securityHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...headers }));
  res.end(JSON.stringify(body, null, 2));
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i === -1 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}
function sign(value) {
  return createHmac('sha256', sessionSecret).update(value).digest('hex');
}
function requestIsSecure(req) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}
function makeSessionCookie(sessionId, req) {
  const payload = `${sessionId}.${sign(sessionId)}`;
  const secure = requestIsSecure(req) ? '; Secure' : '';
  return `aiagent2_session=${encodeURIComponent(payload)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_MAX_AGE_SEC}`;
}
function clearSessionCookie(req) {
  const secure = requestIsSecure(req) ? '; Secure' : '';
  return `aiagent2_session=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}
function getSession(req) {
  const cookies = parseCookies(req);
  const raw = cookies.aiagent2_session;
  if (!raw) return null;
  const [id, signature] = String(raw).split('.');
  if (!id || !signature || sign(id) !== signature) return null;
  const session = sessions.get(id) || null;
  if (!session) return null;
  if (Number(session.sessionVersion || 0) !== SESSION_VERSION) {
    sessions.delete(id);
    return null;
  }
  if (Number(session.expiresAt || 0) <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  if (!session.csrfToken) session.csrfToken = randomBytes(16).toString('hex');
  return session;
}

function verifiedSessionId(req) {
  const cookies = parseCookies(req);
  const raw = cookies.aiagent2_session;
  if (!raw) return '';
  const [id, signature] = String(raw).split('.');
  if (!id || !signature || sign(id) !== signature) return '';
  return id;
}

function sessionNeedsRefresh(session) {
  if (!session) return false;
  const now = Date.now();
  const remainingMs = Number(session.expiresAt || 0) - now;
  const lastRefreshMs = Number(session.refreshedAt || 0);
  if (remainingMs <= SESSION_REFRESH_WINDOW_SEC * 1000) return true;
  if (!lastRefreshMs) return true;
  return now - lastRefreshMs >= SESSION_REFRESH_MIN_INTERVAL_SEC * 1000;
}

function maybeRefreshSessionCookie(req, session = null) {
  const activeSession = session || getSession(req);
  if (!activeSession || !sessionNeedsRefresh(activeSession)) return '';
  const sessionId = verifiedSessionId(req);
  if (!sessionId) return '';
  activeSession.expiresAt = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  activeSession.refreshedAt = Date.now();
  sessions.set(sessionId, activeSession);
  return makeSessionCookie(sessionId, req);
}
function baseUrl(req) {
  return normalizeBaseUrl(process.env.PRIMARY_BASE_URL)
    || normalizeBaseUrl(process.env.BASE_URL)
    || requestOrigin(req);
}
function normalizeBaseUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}
function requestOrigin(req) {
  return `${(req.headers['x-forwarded-proto'] || 'http')}://${req.headers.host}`.replace(/\/$/, '');
}
function configuredBaseUrls(req) {
  const urls = new Set();
  const primary = normalizeBaseUrl(process.env.PRIMARY_BASE_URL);
  const legacy = normalizeBaseUrl(process.env.BASE_URL);
  const current = requestOrigin(req);
  if (primary) urls.add(primary);
  if (legacy) urls.add(legacy);
  for (const part of String(process.env.ALLOWED_BASE_URLS || '').split(/[,\s]+/)) {
    const normalized = normalizeBaseUrl(part);
    if (normalized) urls.add(normalized);
  }
  if (current) urls.add(current);
  return urls;
}
function redirect(res, location, headers = {}) {
  res.writeHead(302, securityHeaders({ Location: location, ...headers }));
  res.end();
}
function hasSessionCookie(req) {
  return Boolean(parseCookies(req).aiagent2_session);
}
function isUnsafeMethod(method = '') {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}
function csrfExemptPath(pathname = '') {
  return pathname === '/api/stripe/webhook'
    || pathname === '/api/agent-callbacks/jobs'
    || pathname === '/mock/accepted/jobs';
}
function trustedOrigins(req) {
  const origins = new Set();
  try {
    origins.add(new URL(`http://${req.headers.host || 'localhost'}${req.url || '/'}`).origin);
  } catch {}
  for (const item of configuredBaseUrls(req)) {
    try {
      origins.add(new URL(item).origin);
    } catch {}
  }
  return origins;
}
function requestSourceOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (origin) return origin.replace(/\/$/, '');
  const referer = String(req.headers.referer || '').trim();
  if (!referer) return '';
  try {
    return new URL(referer).origin;
  } catch {
    return '';
  }
}
function csrfTokenForRequest(req, session = null) {
  if (session?.csrfToken) return String(session.csrfToken);
  const rawSession = String(parseCookies(req).aiagent2_session || '');
  return rawSession ? `v1.${sign(rawSession)}` : '';
}
function enforceBrowserWriteProtection(req, res, pathname) {
  if (!isUnsafeMethod(req.method) || csrfExemptPath(pathname) || !hasSessionCookie(req)) return false;
  const sourceOrigin = requestSourceOrigin(req);
  if (!sourceOrigin || !trustedOrigins(req).has(sourceOrigin)) {
    json(res, 403, { error: 'Cross-site write blocked' });
    return true;
  }
  const session = getSession(req);
  if (!session) return false;
  const expected = csrfTokenForRequest(req, session);
  const provided = String(req.headers['x-aiagent2-csrf'] || '').trim();
  if (!provided || !expected || !secretEquals(provided, expected)) {
    json(res, 403, { error: 'CSRF token required' });
    return true;
  }
  return false;
}
function rateLimitClientKey(req) {
  const forwarded = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}
function rateLimitSpecForPath(pathname = '', method = 'GET') {
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'OPTIONS') return null;
  if (pathname.startsWith('/auth/')) return { name: 'auth', limit: 80, windowMs: 60_000 };
  if (pathname === '/api/analytics/events' && verb === 'POST') return { name: 'analytics-event', limit: 120, windowMs: 60_000 };
  if (pathname === '/api/analytics/chat-transcripts' && verb === 'POST') return { name: 'chat-transcript', limit: 120, windowMs: 60_000 };
  if (pathname === '/api/open-chat/intent' && verb === 'POST') return { name: 'open-chat-intent', limit: 20, windowMs: 60_000 };
  if (pathname === '/api/work/resolve-action' && verb === 'POST') return { name: 'work-resolve-action', limit: 60, windowMs: 60_000 };
  if (pathname === '/api/work/resolve-intent' && verb === 'POST') return { name: 'work-resolve-intent', limit: 60, windowMs: 60_000 };
  if (pathname === '/api/work/prepare-order' && verb === 'POST') return { name: 'work-prepare-order', limit: 60, windowMs: 60_000 };
  if (pathname === '/api/work/preflight-order' && verb === 'POST') return { name: 'work-preflight-order', limit: 60, windowMs: 60_000 };
  if (/^\/api\/jobs\/[^/]+\/executor-state$/.test(pathname) && verb === 'PATCH') return { name: 'job-executor-state', limit: 120, windowMs: 60_000 };
  if (pathname === '/api/deliveries/classify' && verb === 'POST') return { name: 'delivery-classify', limit: 30, windowMs: 60_000 };
  if (pathname === '/api/deliveries/prepare-publish' && verb === 'POST') return { name: 'delivery-prepare-publish', limit: 60, windowMs: 60_000 };
  if (pathname === '/api/deliveries/prepare-publish-order' && verb === 'POST') return { name: 'delivery-prepare-publish-order', limit: 60, windowMs: 60_000 };
  if (pathname === '/api/deliveries/prepare-execution' && verb === 'POST') return { name: 'delivery-prepare-execution', limit: 60, windowMs: 60_000 };
  if (pathname === '/api/deliveries/execute' && verb === 'POST') return { name: 'delivery-execute', limit: 30, windowMs: 60_000 };
  if (pathname === '/api/deliveries/schedule' && verb === 'POST') return { name: 'delivery-schedule', limit: 30, windowMs: 60_000 };
  if (pathname === '/api/connectors/x/post' && verb === 'POST') return { name: 'x-post', limit: 20, windowMs: 10 * 60_000 };
  if (pathname === '/api/connectors/instagram/post' && verb === 'POST') return { name: 'instagram-post', limit: 20, windowMs: 10 * 60_000 };
  if (pathname === '/api/connectors/google/assets' && verb === 'GET') return { name: 'google-assets', limit: 30, windowMs: 60_000 };
  if (pathname === '/api/connectors/google/send-gmail' && verb === 'POST') return { name: 'google-send-gmail', limit: 20, windowMs: 10 * 60_000 };
  if (pathname === '/api/connectors/resend/send-email' && verb === 'POST') return { name: 'resend-send-email', limit: 20, windowMs: 10 * 60_000 };
  if (/^\/api\/settings\/chat-memory\/[^/]+$/.test(pathname) && verb === 'DELETE') return { name: 'hide-chat-memory', limit: 120, windowMs: 60_000 };
  if (pathname === '/api/settings/api-keys' && verb === 'POST') return { name: 'issue-cait-key', limit: 12, windowMs: 10 * 60_000 };
  if (pathname === '/api/jobs' && verb === 'POST') return { name: 'create-job', limit: 120, windowMs: 60_000 };
  if (pathname === '/api/recurring-orders' && verb === 'POST') return { name: 'create-recurring-order', limit: 60, windowMs: 60_000 };
  if (pathname === '/api/feedback' && verb === 'POST') return { name: 'feedback', limit: 20, windowMs: 60_000 };
  if (pathname.startsWith('/api/stripe/') && verb === 'POST') return { name: 'stripe-action', limit: 60, windowMs: 60_000 };
  if (pathname === '/api/agent-callbacks/jobs' && verb === 'POST') return { name: 'agent-callback', limit: 300, windowMs: 60_000 };
  if (/^\/mock\/[^/]+\/jobs$/.test(pathname) && verb === 'POST') return { name: 'built-in-direct', limit: 20, windowMs: 60_000 };
  if (isUnsafeMethod(verb)) return { name: 'write', limit: 240, windowMs: 60_000 };
  if (pathname === '/api/snapshot') return { name: 'snapshot', limit: 240, windowMs: 60_000 };
  return null;
}
function enforceRateLimit(req, res, pathname) {
  const spec = rateLimitSpecForPath(pathname, req.method);
  if (!spec) return false;
  const now = Date.now();
  const key = `${spec.name}:${rateLimitClientKey(req)}`;
  const current = rateLimitBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + spec.windowMs });
    return false;
  }
  current.count += 1;
  if (rateLimitBuckets.size > 2000) {
    for (const [bucketKey, bucket] of rateLimitBuckets) {
      if (bucket.resetAt <= now) rateLimitBuckets.delete(bucketKey);
    }
  }
  if (current.count <= spec.limit) return false;
  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  json(res, 429, { error: 'Rate limit exceeded', retry_after: retryAfter }, { 'Retry-After': String(retryAfter) });
  return true;
}
async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Request failed (${response.status})`);
  return data;
}

const OPEN_CHAT_INTENT_NAMES = new Set([
  'natural_business_growth',
  'natural_idea_discovery',
  'natural_marketing_launch',
  'natural_entity_exploration',
  'natural_stuck_start'
]);

const OPEN_CHAT_INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['ask_clarifying_question', 'prepare_order', 'use_previous_brief'] },
    intent: { type: 'string', enum: [...OPEN_CHAT_INTENT_NAMES] },
    intent_label: { type: 'string' },
    summary: { type: 'string' },
    narrowing_question: { type: 'string' },
    order_brief: { type: 'string' },
    options: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['id', 'label', 'description']
      }
    },
    confidence: { type: 'number' }
  },
  required: ['action', 'intent', 'intent_label', 'summary', 'narrowing_question', 'order_brief', 'options', 'confidence']
};

const DELIVERY_CLASSIFIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content_type: { type: 'string', enum: ['article_draft', 'social_post_pack', 'email_pack', 'code_handoff', 'report_bundle', 'other'] },
    title: { type: 'string' },
    suggested_slug: { type: 'string' },
    confidence: { type: 'number' },
    reason: { type: 'string' }
  },
  required: ['content_type', 'title', 'suggested_slug', 'confidence', 'reason']
};

function openChatIntentEnvValue(source, key, fallback = '') {
  return String(source?.[key] ?? fallback).trim();
}

function openChatIntentNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function openChatIntentLanguage(prompt = '', requested = '') {
  const explicit = String(requested || '').trim();
  if (/^(Japanese|English)$/i.test(explicit)) return explicit.toLowerCase() === 'japanese' ? 'Japanese' : 'English';
  return /[\u3040-\u30ff]/.test(String(prompt || '')) ? 'Japanese' : 'English';
}

function openChatPlatformOpenAiFallbackEnabled(source = process.env) {
  return ['1', 'true', 'yes', 'on', 'webui'].includes(
    openChatIntentEnvValue(source, 'OPEN_CHAT_ALLOW_PLATFORM_OPENAI_FALLBACK').toLowerCase()
  );
}

function openChatIntentLlmConfig(source = process.env, options = {}) {
  const apiKey = openChatIntentEnvValue(source, 'OPEN_CHAT_OPENAI_API_KEY')
    || ((options.allowOpenAiApiKeyFallback || options.allowPlatformOpenAiApiKeyFallback) ? openChatIntentEnvValue(source, 'OPENAI_API_KEY') : '');
  const configured = openChatIntentEnvValue(source, 'OPEN_CHAT_INTENT_LLM').toLowerCase();
  let provider = configured || (apiKey ? 'openai' : 'off');
  if (['0', 'false', 'none', 'disabled'].includes(provider)) provider = 'off';
  if (!['openai', 'off'].includes(provider)) provider = 'off';
  return {
    enabled: provider !== 'off',
    provider,
    apiKey,
    openAiBaseUrl: (openChatIntentEnvValue(source, 'OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    openAiModel: openChatIntentEnvValue(source, 'OPEN_CHAT_INTENT_MODEL')
      || openChatIntentEnvValue(source, 'OPEN_CHAT_INTENT_OPENAI_MODEL')
      || 'gpt-5.4-nano',
    timeoutMs: Math.max(1500, openChatIntentNumber(openChatIntentEnvValue(source, 'OPEN_CHAT_INTENT_TIMEOUT_MS'), 12000))
  };
}

function openChatIntentAllowedEmails(source = process.env) {
  const configured = openChatIntentEnvValue(source, 'OPEN_CHAT_INTENT_ALLOWED_EMAILS') || 'yasuikunihiro@gmail.com';
  return new Set(configured
    .split(/[\s,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
}

function currentOpenChatIntentEmails(current = null) {
  return [
    current?.login,
    current?.user?.login,
    current?.user?.email,
    current?.googleIdentity?.login,
    current?.googleIdentity?.email,
    current?.account?.login,
    current?.account?.profile?.email,
    current?.account?.billing?.billingEmail,
    current?.account?.payout?.payoutEmail
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
}

function authorizeOpenChatIntentLlm(req, source = process.env) {
  const current = currentUserContext(req);
  const allowed = openChatIntentAllowedEmails(source);
  const matched = currentOpenChatIntentEmails(current).some((email) => allowed.has(email));
  const sourceOrigin = requestSourceOrigin(req);
  const trustedBrowserRequest = Boolean(sourceOrigin && trustedOrigins(req).has(sourceOrigin));
  const platformFallback = (Boolean(current?.user) || trustedBrowserRequest) && openChatPlatformOpenAiFallbackEnabled(source);
  const config = openChatIntentLlmConfig(source, {
    allowOpenAiApiKeyFallback: matched,
    allowPlatformOpenAiApiKeyFallback: platformFallback
  });
  if (!config.enabled || !config.apiKey) {
    return { ok: true, config, current, allowOpenAiApiKeyFallback: matched, allowPlatformOpenAiApiKeyFallback: platformFallback };
  }
  if (matched || platformFallback) {
    return { ok: true, config, current, allowOpenAiApiKeyFallback: matched, allowPlatformOpenAiApiKeyFallback: platformFallback };
  }
  return {
    ok: false,
    statusCode: 403,
    error: 'Open Chat intent LLM is restricted to logged-in platform Web UI users or the configured operator account.',
    source: config.provider
  };
}

function parseIntentJson(content = '') {
  const text = String(content || '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function sanitizeOpenChatIntentText(value = '', max = 180, userLanguage = 'English') {
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  if (userLanguage === 'English' && /[\u3040-\u30ff\u3400-\u9fff]/.test(text)) return '';
  return text;
}

function sanitizeOpenChatOrderBrief(value = '', max = 5000) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().slice(0, max);
}

function normalizeOpenChatIntentResult(raw = {}, fallbackIntent = '', source = 'openai', userLanguage = 'English') {
  const fallback = OPEN_CHAT_INTENT_NAMES.has(String(fallbackIntent || '').trim())
    ? String(fallbackIntent || '').trim()
    : 'natural_stuck_start';
  const rawIntent = String(raw.intent || '').trim();
  const intent = OPEN_CHAT_INTENT_NAMES.has(rawIntent) ? rawIntent : fallback;
  const action = ['ask_clarifying_question', 'prepare_order', 'use_previous_brief'].includes(String(raw.action || '').trim())
    ? String(raw.action || '').trim()
    : 'ask_clarifying_question';
  const safeOptions = Array.isArray(raw.options) ? raw.options.slice(0, 5).map((option, index) => ({
    id: String(index),
    label: sanitizeOpenChatIntentText(option?.label || '', 90, userLanguage),
    description: sanitizeOpenChatIntentText(option?.description || '', 180, userLanguage)
  })).filter((option) => option.label) : [];
  return {
    ok: true,
    source,
    action,
    intent,
    intent_label: sanitizeOpenChatIntentText(raw.intent_label || raw.intentLabel || '', 120, userLanguage),
    summary: sanitizeOpenChatIntentText(raw.summary || '', 260, userLanguage),
    narrowing_question: sanitizeOpenChatIntentText(raw.narrowing_question || raw.narrowingQuestion || '', 180, userLanguage),
    order_brief: sanitizeOpenChatOrderBrief(raw.order_brief || raw.orderBrief || ''),
    options: safeOptions,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence || 0.5)))
  };
}

function extractOpenAiIntentText(payload = {}) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const chunks = [];
  for (const output of Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      if (typeof content?.text === 'string' && content.text.trim()) chunks.push(content.text.trim());
      if (typeof content?.output_text === 'string' && content.output_text.trim()) chunks.push(content.output_text.trim());
    }
  }
  return chunks.join('\n').trim();
}

function appSettingsMap(state = {}) {
  const output = { ...APP_SETTING_DEFAULTS };
  for (const item of Array.isArray(state?.appSettings) ? state.appSettings : []) {
    const key = String(item?.key || '').trim();
    if (!key || !(key in output)) continue;
    output[key] = String(item?.value ?? output[key]);
  }
  return output;
}

function orderUiLabelsFromAppSettings(settings = {}) {
  return {
    sendOrder: String(settings?.work_order_send_label || WORK_ORDER_UI_LABELS.sendOrder).trim() || WORK_ORDER_UI_LABELS.sendOrder,
    addConstraints: String(settings?.work_order_add_constraints_label || WORK_ORDER_UI_LABELS.addConstraints).trim() || WORK_ORDER_UI_LABELS.addConstraints,
    prepareOrder: String(settings?.work_order_prepare_label || WORK_ORDER_UI_LABELS.prepareOrder).trim() || WORK_ORDER_UI_LABELS.prepareOrder,
    sendChat: String(settings?.work_chat_send_label || WORK_ORDER_UI_LABELS.sendChat).trim() || WORK_ORDER_UI_LABELS.sendChat,
    answerFirst: String(settings?.work_order_answer_first_label || WORK_ORDER_UI_LABELS.answerFirst).trim() || WORK_ORDER_UI_LABELS.answerFirst,
    revise: String(settings?.work_order_revise_label || WORK_ORDER_UI_LABELS.revise).trim() || WORK_ORDER_UI_LABELS.revise,
    cancel: String(settings?.work_order_cancel_label || WORK_ORDER_UI_LABELS.cancel).trim() || WORK_ORDER_UI_LABELS.cancel
  };
}

function sanitizeAppSettingPatch(body = {}) {
  const key = String(body?.key || '').trim();
  if (!key || !(key in APP_SETTING_DEFAULTS)) return { error: 'Unknown app setting key.' };
  const value = String(body?.value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!value) return { error: 'Setting value is required.' };
  if (value.length > 500) return { error: 'Setting value is too long (max 500 characters).' };
  return {
    key,
    value,
    source: 'admin',
    updatedAt: nowIso()
  };
}

function openChatIntentSystemPrompt(userLanguage = 'English', uiLabels = WORK_ORDER_UI_LABELS) {
  return [
    'You classify rough user goals for CAIt, an AI agent marketplace/work-order chat.',
    'Return JSON only. Do not execute the task and do not create an order.',
    'Map intent to one of: natural_business_growth, natural_idea_discovery, natural_marketing_launch, natural_entity_exploration, natural_stuck_start.',
    'Use natural_entity_exploration for a bare topic/entity/brand/person/product with no action yet, for example "rolex".',
    'Normalize common typos, kana/romaji variants, and product/tool-name variants before choosing the intent: CAIt/ケイト/毛糸, AI agent/えーじぇんと, GitHub/ぎっとはぶ, Stripe/すとらいぶ, deposit/deposite.',
    'Use prepared_brief and conversation_context before judging the latest message. If the user refers to previous/that/same/さっき/前の, resolve it from prepared_brief or conversation_context.',
    'Bias toward execution only after the target, outcome, and enough context are known. The unit cost is low, but do not create vague work orders that hide missing business context.',
    'For growth/marketing/acquisition/team-leader requests such as "集客して", "売上を増やしたい", "grow users", or "marketing help", ask a clarifying question unless product/business, target customer, desired outcome, and major constraints are available from conversation_context or prepared_brief.',
    'If the latest message is imperative/action-oriented ("do it", "please handle", "調べて", "作って", "発注したい"), set action to prepare_order unless safety or missing target/business context makes execution unreliable.',
    'If enough context exists to hand work to an agent, set action to prepare_order and return a polished CAIt order brief in order_brief.',
    'If the user wants to proceed with the previous prepared brief, set action to use_previous_brief and return a polished version of prepared_brief in order_brief.',
    'Set action to ask_clarifying_question when the target/outcome is absent, or when a Team Leader/growth order lacks product, audience, outcome, or constraints.',
    'A valid order_brief uses this exact shape: Task, Goal, Work split, Inputs, Constraints, Deliver, Output language, Acceptance. Keep it concise and executable.',
    `The user language is ${userLanguage}. All JSON string values must be written in ${userLanguage}.`,
    'Do not use Chinese unless the user language is Chinese.',
    `Options must be short choices. For prepare_order/use_previous_brief, options should be "${uiLabels.sendOrder}" and "${uiLabels.addConstraints}".`
  ].join('\n');
}

function deliveryClassifierSystemPrompt(userLanguage = 'English') {
  return [
    'You classify whether a completed AI-agent delivery is a publishable article draft for CAIt.',
    'Return JSON only.',
    'Use content_type="article_draft" only when the content is a long-form article/post/page draft that a user would plausibly publish to a site, blog, docs, or landing page.',
    'Use content_type="social_post_pack" for a deliverable primarily made of social posts, threads, launch copy, captions, or ready-to-post community text.',
    'Use content_type="email_pack" for a deliverable primarily made of email drafts, subject lines, lifecycle emails, launch emails, or consent-aware email copy intended for a sender such as Gmail.',
    'Use content_type="code_handoff" for an implementation brief, patch plan, bugfix handoff, PR-ready coding spec, or technical change request that should route into terminal/GitHub execution.',
    'Use content_type="report_bundle" for a research memo, strategy memo, audit, analysis report, checklist, or decision document that is useful as a report but not directly publishable to a public site.',
    'Use content_type="other" only when none of the above fit.',
    'Treat markdown, HTML, and plain text similarly. Headings and sections help, but do not mark short outlines as article_draft.',
    'If you classify article_draft, infer a concise publishable title and a URL-safe suggested_slug. For all other content types, suggested_slug may be blank.',
    `All JSON string values must be written in ${userLanguage}.`
  ].join('\n');
}

function normalizeDeliveryClassificationResult(raw = {}, source = 'openai', userLanguage = 'English') {
  const allowedContentTypes = new Set(['article_draft', 'social_post_pack', 'email_pack', 'code_handoff', 'report_bundle', 'other']);
  const rawContentType = String(raw.content_type || raw.contentType || '').trim();
  const contentType = allowedContentTypes.has(rawContentType) ? rawContentType : 'other';
  return {
    ok: true,
    source,
    content_type: contentType,
    title: sanitizeOpenChatIntentText(raw.title || '', 160, userLanguage),
    suggested_slug: String(raw.suggested_slug || raw.suggestedSlug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence || 0.5))),
    reason: sanitizeOpenChatIntentText(raw.reason || '', 240, userLanguage),
    action_contract: deliveryActionContractForType(contentType)
  };
}

async function prepareDeliveryExecutionRequest(req) {
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return { error: body.__error, statusCode: 400 };
  const type = String(body.content_type || body.contentType || '').trim();
  if (!type) return { error: 'content_type required', statusCode: 400 };
  const state = await storage.getState();
  const current = currentOrderRequesterContext(state, req);
  if (!current.user && current.apiKeyStatus === 'invalid') return { error: 'Invalid API key', statusCode: 401 };
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (jobId) {
    const job = Array.isArray(state.jobs) ? state.jobs.find((item) => String(item?.id || '') === jobId) : null;
    if (!job || !canViewJobFromRequest(state, req, job, current)) {
      return { error: 'Job not found or access denied', statusCode: 404 };
    }
  }
  const account = current?.login ? accountSettingsForLogin(state, current.login, current.user, current.authProvider) : null;
  const connectors = account?.connectors || {};
  const executorPreferences = account?.executorPreferences || {};
  const xPrefs = executorPreferences.x || {};
  const googlePrefs = executorPreferences.google || {};
  const githubPrefs = executorPreferences.github || {};
  const draftDefaults = deliveryDraftDefaultsForType(type, {
    preferredChannel: xPrefs.channel,
    preferredActionMode: xPrefs.actionMode,
    xConnected: Boolean(connectors?.x?.connected),
    suggestedPostText: String(body.content || '').trim().split(/\n/).map((line) => line.trim()).find(Boolean) || '',
    defaultScheduledAt: '',
    isPlatformAdmin: Boolean(current?.isPlatformAdmin),
    defaultEmailTarget: current?.isPlatformAdmin ? 'cait_resend' : 'gmail',
    defaultEmailSubject: String(body.title || '').trim() || 'Email draft',
    defaultEmailBody: String(body.content || '').trim(),
    githubConnected: Boolean(current?.githubLinked || connectors?.github?.connected),
    defaultCodeTarget: (current?.githubLinked || connectors?.github?.connected) ? 'github_repo' : 'local_terminal',
    preferredRepoFullName: String(githubPrefs.repoFullName || '').trim()
  });
  draftDefaults.googleSearchConsoleSite = String(googlePrefs.searchConsoleSite || '').trim();
  draftDefaults.googleGa4Property = String(googlePrefs.ga4Property || '').trim();
  draftDefaults.googleDriveFileId = String(googlePrefs.driveFileId || '').trim();
  draftDefaults.googleCalendarId = String(googlePrefs.calendarId || '').trim();
  draftDefaults.googleGmailLabelId = String(googlePrefs.gmailLabelId || '').trim();
  const prepared = prepareDeliveryExecutionContractPayload(type, draftDefaults, {
    authorityReadyToResume: false,
    reportNeedsGoogleLoad: false
  });
  return {
    ok: true,
    content_type: type,
    draft_defaults: draftDefaults,
    ...prepared
  };
}

async function prepareDeliveryPublishRequest(req) {
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return { error: body.__error, statusCode: 400 };
  const state = await storage.getState();
  const current = currentOrderRequesterContext(state, req);
  if (!current.user && current.apiKeyStatus === 'invalid') return { error: 'Invalid API key', statusCode: 401 };
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (jobId) {
    const job = Array.isArray(state.jobs) ? state.jobs.find((item) => String(item?.id || '') === jobId) : null;
    if (!job || !canViewJobFromRequest(state, req, job, current)) {
      return { error: 'Job not found or access denied', statusCode: 404 };
    }
  }
  const account = current?.login ? accountSettingsForLogin(state, current.login, current.user, current.authProvider) : null;
  const connectors = account?.connectors || {};
  const githubReady = Boolean(current?.githubLinked || connectors?.github?.connected);
  const draftDefaults = {
    target: githubReady ? 'github_repo' : 'local_terminal',
    pathPrefix: String(body.path_prefix || body.pathPrefix || '/blog').trim() || '/blog',
    slug: String(body.suggested_slug || body.suggestedSlug || '').trim(),
    publishMode: 'draft_pr'
  };
  const prepared = prepareDeliveryPublishContractPayload(draftDefaults, {
    githubReady,
    article: {
      suggestedSlug: draftDefaults.slug
    }
  });
  return {
    ok: true,
    draft_defaults: draftDefaults,
    github_ready: githubReady,
    ...prepared
  };
}

async function prepareDeliveryPublishOrderRequest(req) {
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return { error: body.__error, statusCode: 400 };
  const state = await storage.getState();
  const current = currentOrderRequesterContext(state, req);
  if (!current.user && current.apiKeyStatus === 'invalid') return { error: 'Invalid API key', statusCode: 401 };
  if (!current.user && current.apiKeyStatus !== 'valid') return { error: 'Login or CAIt API key required', statusCode: 401 };
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) return { error: 'job_id required', statusCode: 400 };
  const job = Array.isArray(state.jobs) ? state.jobs.find((item) => String(item?.id || '') === jobId) : null;
  if (!job || !canViewJobFromRequest(state, req, job, current)) {
    return { error: 'Job not found or access denied', statusCode: 404 };
  }
  const articleTitle = String(body.title || '').trim();
  const articleContent = String(body.content || '').trim();
  if (!articleContent) return { error: 'content required', statusCode: 400 };
  const draft = body.draft && typeof body.draft === 'object' ? body.draft : {};
  const target = String(draft.target || 'github_repo').trim() || 'github_repo';
  const pathPrefix = String(draft.pathPrefix || '/blog').trim() || '/blog';
  const slug = String(draft.slug || '').trim();
  const publishMode = String(draft.publishMode || 'draft_pr').trim() || 'draft_pr';
  const normalizedPrefix = `/${pathPrefix.replace(/^\/+|\/+$/g, '')}`.replace(/\/{2,}/g, '/');
  const normalizedSlug = slug.replace(/^\/+|\/+$/g, '');
  const urlPath = normalizedSlug ? `${normalizedPrefix}/${normalizedSlug}`.replace(/\/{2,}/g, '/') : normalizedPrefix;
  const taskType = target === 'github_repo' || target === 'local_terminal' ? 'code' : (job.taskType || 'writing');
  const prompt = [
    `Publish the article draft from previous order ${job.id}.`,
    '',
    `Article title: ${articleTitle}`,
    `Requested URL path: ${urlPath}`,
    `Publish target: ${target}`,
    `Publish mode: ${publishMode}`,
    '',
    deliveryPublishTargetInstruction(target),
    'Use the previous delivery as the source article. Do not restart discovery or rewrite the article unless missing publishing metadata blocks the task.',
    'If authority or repository details are missing, ask only for the minimum missing publish detail.'
  ].filter(Boolean).join('\n');
  return {
    ok: true,
    followup_to_job_id: job.id,
    task_type: taskType,
    order_strategy: target === 'github_repo' || target === 'local_terminal' ? 'single' : 'auto',
    prompt,
    path_preview: urlPath
  };
}

function deliveryExecutorActionPayload(body = {}) {
  const actionKind = String(body.action_kind || body.actionKind || '').trim();
  const draft = body.draft && typeof body.draft === 'object' ? body.draft : {};
  if (actionKind === 'x_post') return { kind: 'x_post', text: String(draft.postText || '').trim() };
  if (actionKind === 'instagram_post') {
    return {
      kind: 'instagram_post',
      caption: String(draft.postText || '').trim(),
      accessToken: String(draft.instagramAccessToken || '').trim(),
      instagramUserId: String(draft.instagramUserId || '').trim(),
      mediaUrl: String(draft.instagramMediaUrl || '').trim()
    };
  }
  if (actionKind === 'gmail_send') {
    return {
      kind: 'gmail_send',
      to: String(draft.recipientEmail || '').trim(),
      subject: String(draft.emailSubject || '').trim(),
      text: String(draft.emailBody || '').trim()
    };
  }
  if (actionKind === 'resend_send') {
    return {
      kind: 'resend_send',
      to: String(draft.recipientEmail || '').trim(),
      from: String(draft.senderEmail || '').trim(),
      replyTo: String(draft.replyToEmail || '').trim(),
      subject: String(draft.emailSubject || '').trim(),
      text: String(draft.emailBody || '').trim()
    };
  }
  return null;
}

function hasDeliveryExecutionConfirmation(body = {}) {
  return body?.confirm_execute === true || body?.confirmExecute === true;
}

function hasDeliveryScheduleConfirmation(body = {}) {
  return body?.confirm_schedule === true || body?.confirmSchedule === true;
}

function buildReportNextOrderBody(job = null, deliverable = null, draft = {}) {
  const nextStep = String(draft.nextStep || 'action_plan').trim();
  const sourceLines = [];
  if (String(draft.googleSearchConsoleSite || '').trim()) sourceLines.push(`Use Search Console site: ${String(draft.googleSearchConsoleSite || '').trim()}`);
  if (String(draft.googleGa4Property || '').trim()) sourceLines.push(`Use GA4 property: ${String(draft.googleGa4Property || '').trim()}`);
  if (String(draft.googleDriveFileId || '').trim()) sourceLines.push(`Use Google Drive file: ${String(draft.googleDriveFileId || '').trim()}`);
  if (String(draft.googleCalendarId || '').trim()) sourceLines.push(`Use Google Calendar: ${String(draft.googleCalendarId || '').trim()}`);
  if (String(draft.googleGmailLabelId || '').trim()) sourceLines.push(`Use Gmail label: ${String(draft.googleGmailLabelId || '').trim()}`);
  const taskType = nextStep === 'publish_followup'
    ? 'writing'
    : (nextStep === 'execution_order' ? (job?.taskType || 'research') : 'research');
  return {
    parent_agent_id: String(job?.parentAgentId || 'cloudcode-main'),
    order_strategy: nextStep !== 'execution_order' ? 'auto' : 'single',
    task_type: taskType,
    prompt: [
      `Continue from the report delivered in previous order ${job?.id || ''}.`,
      '',
      `Detected delivery: ${String(deliverable?.title || '')}`,
      `Next step: ${nextStep}`,
      ...sourceLines,
      nextStep === 'publish_followup'
        ? 'Convert the report into a publishable follow-up order and ask only for the minimum publishing metadata.'
        : nextStep === 'execution_order'
          ? 'Convert the report into the next executable work order directly.'
          : 'Turn the report into a concise action plan with the next best recommended step.',
      'If another clarification is required, ask only one blocking question.'
    ].filter(Boolean).join('\n'),
    budget_cap: Number(job?.budgetCap || 300) || 300,
    deadline_sec: Number(job?.deadlineSec || 120) || 120,
    followup_to_job_id: String(job?.id || ''),
    async_dispatch: true,
    input: {}
  };
}

function normalizeDeliveryExecuteResponse(result = {}, actionKind = '') {
  const kind = String(actionKind || '').trim();
  if (kind === 'github_pr') {
    return {
      ok: true,
      action_kind: kind,
      outcome_kind: 'github_pr',
      message: 'GitHub PR handoff created.',
      entity: {
        repo: result.repo?.fullName || '',
        branch: result.branch || '',
        pull_request_url: result.pull_request?.html_url || result.pull_request?.htmlUrl || '',
        pull_request_number: result.pull_request?.number || null,
        files: Array.isArray(result.files) ? result.files : []
      },
      raw: result
    };
  }
  if (kind === 'report_next') {
    return {
      ok: true,
      action_kind: kind,
      outcome_kind: 'job',
      message: 'Follow-up order started.',
      entity: {
        job_id: result.job_id || '',
        status: result.status || '',
        workflow_parent_id: result.workflow_parent_id || null,
        matched_agent_id: result.matched_agent_id || null
      },
      raw: result
    };
  }
  return {
    ok: true,
    action_kind: kind,
    outcome_kind: 'connector_action',
    message: result.status === 'sent' ? 'Connector send completed.' : 'Connector action completed.',
    entity: {
      connector_action: result.connector_action || kind,
      connector_action_id: result.connector_action_id || '',
      url: result.url || '',
      to: result.to || '',
      subject: result.subject || '',
      thread_id: result.thread_id || ''
    },
    raw: result
  };
}

function normalizeDeliveryScheduleResponse(result = {}, actionKind = '') {
  return {
    ok: true,
    action_kind: String(actionKind || '').trim(),
    outcome_kind: 'scheduled',
    message: 'Scheduled action created.',
    entity: {
      recurring_order_id: result.recurring_order?.id || '',
      next_run_at: result.recurring_order?.nextRunAt || '',
      status: result.recurring_order?.status || '',
      task_type: result.recurring_order?.taskType || ''
    },
    raw: result
  };
}

function normalizeDeliveryExecuteFailureResponse(result = {}, actionKind = '') {
  const payload = result && typeof result === 'object' ? result : {};
  const message = String(payload.error || 'Execution failed').trim();
  const missingConnectors = Array.isArray(payload.missingConnectors || payload.missing_connectors) ? (payload.missingConnectors || payload.missing_connectors) : [];
  const missingConnectorCapabilities = Array.isArray(payload.missingConnectorCapabilities || payload.missing_connector_capabilities)
    ? (payload.missingConnectorCapabilities || payload.missing_connector_capabilities)
    : [];
  const statusCode = Number(payload.statusCode || 0) || 400;
  const errorKind = payload.code === 'connector_required' || payload.needs_connector || missingConnectors.length || missingConnectorCapabilities.length
    ? 'authority_required'
    : (statusCode >= 500 ? 'server_error' : 'validation_error');
  return {
    ok: false,
    action_kind: String(actionKind || payload.action_kind || '').trim(),
    outcome_kind: 'error',
    error_kind: errorKind,
    code: String(payload.code || '').trim(),
    required: String(payload.required || '').trim(),
    message,
    entity: {
      missing_connectors: missingConnectors,
      missing_connector_capabilities: missingConnectorCapabilities,
      use: String(payload.use || '').trim(),
      next_step: String(payload.next_step || '').trim(),
      required: String(payload.required || '').trim(),
      action: String(payload.action || '').trim(),
      path: String(payload.path || '').trim(),
      source: String(payload.source || '').trim(),
      status_code: statusCode
    },
    raw: payload
  };
}

function normalizeDeliveryScheduleFailureResponse(result = {}, actionKind = '') {
  const payload = result && typeof result === 'object' ? result : {};
  const statusCode = Number(payload.statusCode || 0) || 400;
  return {
    ok: false,
    action_kind: String(actionKind || payload.action_kind || '').trim(),
    outcome_kind: 'error',
    error_kind: statusCode >= 500 ? 'server_error' : 'validation_error',
    code: String(payload.code || '').trim(),
    required: String(payload.required || '').trim(),
    message: String(payload.error || 'Scheduling failed').trim(),
    entity: {
      use: String(payload.use || '').trim(),
      next_step: String(payload.next_step || '').trim(),
      required: String(payload.required || '').trim(),
      status_code: statusCode
    },
    raw: payload
  };
}

async function executeGithubExecutorPullRequest(current, body, req = null) {
  if (!current.user && current.apiKeyStatus === 'invalid') return { error: 'Invalid API key', statusCode: 401 };
  if (!current.user && current.apiKeyStatus !== 'valid') return { error: 'Login or CAIt API key required', statusCode: 401 };
  if (!sessionHasGithubApp(current.session) && current.apiKeyStatus !== 'valid') {
    return {
      error: 'GitHub App login required to create executor PRs.',
      use: '/auth/github',
      statusCode: 403
    };
  }
  if (!body.owner || !body.repo) return { error: 'owner and repo required', statusCode: 400 };
  if (!String(body.content || '').trim()) return { error: 'content required', statusCode: 400 };
  if (current.apiKeyStatus === 'valid' && body.confirm_repo_write !== true) {
    return {
      error: 'Repository write confirmation required for CAIT_API_KEY executor PR creation.',
      required: 'Set confirm_repo_write=true after showing the target repository, branch, files, and PR action to the user.',
      repo: `${body.owner}/${body.repo}`,
      use: '/?tab=work',
      statusCode: 409
    };
  }
  try {
    const repoAccess = await githubAppRepoTokenForRequester(current, body.owner, body.repo, body.installation_id || '');
    if (repoAccess.error) return { error: repoAccess.error, use: repoAccess.use, next_step: repoAccess.next_step, statusCode: repoAccess.statusCode || 403 };
    const { selectedRepo, installationToken } = repoAccess;
    const repoMetaResult = await fetchGithubRepoMeta(body.owner, body.repo, installationToken);
    if (!repoMetaResult.ok) return { error: repoMetaResult.error, statusCode: repoMetaResult.status === 404 ? 404 : 400 };
    const repoMeta = repoMetaResult.repo;
    const plan = githubExecutorPlanFromRequest(body, repoMeta);
    const baseSha = await fetchGithubBranchSha(installationToken, body.owner, body.repo, repoMeta.default_branch);
    if (!baseSha.ok || !baseSha.sha) return { error: baseSha.error || `Could not resolve ${repoMeta.default_branch}`, statusCode: 400 };
    const branchCreated = await createGithubBranch(installationToken, body.owner, body.repo, plan.branchName, baseSha.sha);
    if (!branchCreated.ok) {
      return { ...githubPermissionError(branchCreated, 'Could not create executor branch'), statusCode: branchCreated.status === 422 ? 409 : 400 };
    }
    const existing = await fetchGithubTextFile(installationToken, body.owner, body.repo, plan.filePath, repoMeta.default_branch);
    if (existing.ok && existing.text && !existing.text.includes(GITHUB_EXECUTOR_MARKER) && !existing.text.includes(GITHUB_ADAPTER_MARKER)) {
      return {
        error: `Refusing to overwrite existing non-AIagent2 file at ${plan.filePath}.`,
        path: plan.filePath,
        branch: plan.branchName,
        statusCode: 409
      };
    }
    const write = await upsertGithubTextFile(installationToken, body.owner, body.repo, {
      path: plan.filePath,
      branch: plan.branchName,
      content: plan.fileContent,
      sha: existing.ok ? existing.sha : '',
      message: existing.ok ? `Update ${PRODUCT_SHORT_NAME} executor handoff: ${plan.filePath}` : `Add ${PRODUCT_SHORT_NAME} executor handoff: ${plan.filePath}`
    });
    if (!write.ok) return { ...githubPermissionError(write, `Could not write ${plan.filePath}`), statusCode: write.status === 422 ? 409 : 400 };
    const pull = await createGithubPullRequest(installationToken, body.owner, body.repo, {
      title: plan.prTitle,
      body: plan.prBody,
      head: plan.branchName,
      base: repoMeta.default_branch
    });
    if (!pull.ok) return { ...githubPermissionError(pull, 'Could not create executor pull request'), statusCode: pull.status === 422 ? 409 : 400 };
    await touchEvent('UPDATED', `Executor PR created for ${repoMeta.full_name}: ${pull.pullRequest.htmlUrl}`, {
      repo: repoMeta.full_name,
      branch: plan.branchName,
      pr: pull.pullRequest.htmlUrl,
      kind: plan.kind
    });
    if (current.apiKey?.id && req) await recordOrderApiKeyUsage(current, req);
    return {
      ok: true,
      auth_provider: 'github-app',
      access_mode: current.apiKeyStatus === 'valid' ? 'account-stored-installation' : 'installation-selected',
      repo: { fullName: repoMeta.full_name, private: repoMeta.private },
      installation_id: selectedRepo.installationId,
      executor_kind: plan.kind,
      branch: plan.branchName,
      base_branch: repoMeta.default_branch,
      files: [{ path: plan.filePath, commit_sha: write.commitSha }],
      pull_request: pull.pullRequest,
      next_step: 'Review the PR handoff file in GitHub, then continue implementation in the repository workflow.',
      statusCode: 201
    };
  } catch (error) {
    return { ...githubPermissionError(error), statusCode: 500 };
  }
}

async function executeDeliveryActionRequest(req) {
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return { error: body.__error, statusCode: 400 };
  const state = await storage.getState();
  const current = currentAgentRequesterContext(state, req);
  if (!current?.user && current.apiKeyStatus === 'invalid') return { error: 'Invalid API key', statusCode: 401 };
  if (!current?.user && current.apiKeyStatus !== 'valid') return { error: 'Login or CAIt API key required', statusCode: 401 };
  const writeAccess = requireOrderWriteAccess(req, current);
  if (writeAccess.error) return { error: writeAccess.error, statusCode: writeAccess.statusCode || 400 };
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (jobId) {
    const job = Array.isArray(state.jobs) ? state.jobs.find((item) => String(item?.id || '') === jobId) : null;
    if (!job || !canViewJobFromRequest(state, req, job, current)) return { error: 'Job not found or access denied', statusCode: 404 };
  }
  const actionKind = String(body.action_kind || body.actionKind || '').trim();
  if (!actionKind) return { error: 'action_kind required', statusCode: 400 };
  if (!isDeliveryExecutionActionSupported(actionKind)) {
    return { error: 'Unsupported delivery execute action.', statusCode: 400, action_kind: actionKind };
  }
  const executionConfirmationRequirement = deliveryExecutionConfirmationRequirement(actionKind);
  if (executionConfirmationRequirement && !hasDeliveryExecutionConfirmation(body)) {
    return {
      error: 'Explicit confirmation required before executing this action.',
      required: executionConfirmationRequirement,
      action_kind: actionKind,
      statusCode: 428
    };
  }
  const actionPayload = deliveryExecutorActionPayload(body);
  if (actionPayload) {
    const result = await executeScheduledExactConnectorAction({
      id: jobId || randomUUID(),
      input: { _broker: { exactConnectorAction: actionPayload } }
    }, current);
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return result?.ok
      ? { ...normalizeDeliveryExecuteResponse(result, actionKind), statusCode: 200 }
      : { ...(result || { error: 'Execution failed' }), statusCode: result?.statusCode || 400 };
  }
  if (actionKind === 'github_pr') {
    const draft = body.draft && typeof body.draft === 'object' ? body.draft : {};
    const deliverable = body.deliverable && typeof body.deliverable === 'object' ? body.deliverable : {};
    const repoFullName = String(draft.repoFullName || '').trim();
    if (!repoFullName.includes('/')) return { error: 'Select the GitHub repository first.', statusCode: 400, action_kind: actionKind };
    const [owner, repo] = repoFullName.split('/');
    const result = await executeGithubExecutorPullRequest(current, {
      owner,
      repo,
      installation_id: body.installation_id || body.installationId || '',
      confirm_repo_write: true,
      kind: 'code_handoff',
      source_job_id: jobId,
      source_delivery_title: String(deliverable.title || ''),
      source_file_name: String(deliverable.fileName || ''),
      title: String(deliverable.title || 'Code handoff'),
      content: String(deliverable.content || ''),
      execution_mode: String(draft.executionMode || 'draft_pr')
    }, req);
    return result?.ok
      ? { ...normalizeDeliveryExecuteResponse(result, actionKind), statusCode: result.statusCode || 200 }
      : result;
  }
  if (actionKind === 'report_next') {
    const orderCurrent = currentOrderRequesterContext(state, req);
    const access = requireOrderWriteAccess(req, orderCurrent);
    if (access.error) return { error: access.error, statusCode: access.statusCode || 400, action_kind: actionKind };
    const job = Array.isArray(state.jobs) ? state.jobs.find((item) => String(item?.id || '') === jobId) : null;
    if (!job) return { error: 'Job not found', statusCode: 404, action_kind: actionKind };
    const draft = body.draft && typeof body.draft === 'object' ? body.draft : {};
    const deliverable = body.deliverable && typeof body.deliverable === 'object' ? body.deliverable : {};
    if (String(draft.nextStep || '').trim() === 'action_plan') {
      return { error: 'Action plan mode prepares the next step but does not auto-run it.', statusCode: 400, action_kind: actionKind };
    }
    const nextBody = buildReportNextOrderBody(job, deliverable, draft);
    const promptInjection = promptInjectionGuardForPrompt(nextBody.prompt);
    const touchUsage = async () => {
      if (orderCurrent.apiKey?.id) await recordOrderApiKeyUsage(orderCurrent, req);
    };
    if (promptInjection.blocked) {
      await touchUsage();
      return { ...promptPolicyBlockPayload(promptInjection), statusCode: 400, action_kind: actionKind };
    }
    const requestedStrategy = normalizeOrderStrategy(nextBody.order_strategy || nextBody.orderStrategy || nextBody.execution_mode || nextBody.executionMode);
    const taskType = inferTaskType(nextBody.task_type, nextBody.prompt);
    const resolved = resolveOrderStrategy(state.agents, nextBody, taskType, requestedStrategy);
    const guestPrepared = await prepareGuestTrialOrderContext(req, orderCurrent, nextBody, resolved);
    if (guestPrepared.error) return guestPrepared;
    const preparedCurrent = guestPrepared.current;
    const preparedBody = guestPrepared.body;
    const result = resolved.strategy === 'multi'
      ? await handleCreateWorkflowJob(req, preparedBody, preparedCurrent, { touchUsage, workflowPlan: resolved.plan })
      : await performSingleJobCreate(req, preparedBody, preparedCurrent, { touchUsage });
    if (result?.error) return result;
    return {
      ...normalizeDeliveryExecuteResponse({
        ...result,
        order_strategy_requested: requestedStrategy,
        order_strategy_resolved: resolved.strategy,
        routing_reason: resolved.reason,
        routing_planned_task_types: resolved.plan?.plannedTasks || undefined
      }, actionKind),
      statusCode: result.statusCode || 201
    };
  }
  return {
    error: `Delivery action "${actionKind}" is configured but has no execution handler.`,
    code: 'delivery_action_handler_missing',
    statusCode: 500,
    action_kind: actionKind
  };
}

async function scheduleDeliveryActionRequest(req) {
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return { error: body.__error, statusCode: 400 };
  const state = await storage.getState();
  const current = currentOrderRequesterContext(state, req);
  const access = requireOrderWriteAccess(req, current);
  if (access.error) return { error: access.error, statusCode: access.statusCode || 400 };
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (jobId) {
    const job = Array.isArray(state.jobs) ? state.jobs.find((item) => String(item?.id || '') === jobId) : null;
    if (!job || !canViewJobFromRequest(state, req, job, current)) return { error: 'Job not found or access denied', statusCode: 404 };
  }
  const actionKind = String(body.action_kind || body.actionKind || '').trim();
  if (!actionKind || !isDeliveryScheduleActionSupported(actionKind)) {
    return { error: 'Unsupported delivery schedule action.', statusCode: 400, action_kind: actionKind };
  }
  const action = deliveryExecutorActionPayload(body);
  if (!action || String(action.kind || '').trim() !== actionKind) {
    return {
      error: `Delivery action "${actionKind}" is configured but has no schedule handler.`,
      code: 'delivery_action_handler_missing',
      statusCode: 500,
      action_kind: actionKind
    };
  }
  const scheduleConfirmationRequirement = deliveryScheduleConfirmationRequirement(actionKind);
  if (scheduleConfirmationRequirement && !hasDeliveryScheduleConfirmation(body)) {
    return {
      error: 'Explicit confirmation required before scheduling this action.',
      required: scheduleConfirmationRequirement,
      action_kind: actionKind,
      statusCode: 428
    };
  }
  const scheduledFor = String(body.scheduled_for || body.scheduledFor || '').trim();
  if (!Number.isFinite(Date.parse(scheduledFor))) return { error: 'Choose a valid future schedule time first.', statusCode: 400, action_kind: String(action.kind || '') };
  if (Date.parse(scheduledFor) <= Date.now() + 60_000) return { error: 'Choose a schedule time at least one minute in the future.', statusCode: 400, action_kind: String(action.kind || '') };
  const deliverable = body.deliverable && typeof body.deliverable === 'object' ? body.deliverable : {};
  const taskType = String(body.task_type || body.taskType || (action.kind === 'x_post' ? 'x_post' : action.kind === 'instagram_post' ? 'instagram' : 'email_ops')).trim();
  const recurringBody = {
    parent_agent_id: String(body.parent_agent_id || body.parentAgentId || 'cloudcode-main'),
    task_type: taskType,
    order_strategy: 'single',
    prompt: String(body.prompt || `${deliverable.title || 'Scheduled action'}\nScheduled for ${scheduledFor}`),
    next_run_at: scheduledFor,
    max_runs: 1,
    schedule: {
      interval: 'daily',
      time: '09:00',
      timezone: String(body.timezone || 'Asia/Tokyo')
    },
    input: {
      _broker: {
        exactConnectorAction: {
          ...action,
          scheduledFor,
          previewText: String(body.preview_text || body.previewText || '')
        }
      }
    }
  };
  const promptInjection = promptInjectionGuardForPrompt(recurringBody.prompt || '');
  if (promptInjection.blocked) {
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return promptPolicyBlockPayload(promptInjection);
  }
  let result = null;
  await storage.mutate(async (draft) => {
    result = createRecurringOrderInState(draft, recurringBody, current);
  });
  if (result?.error) return result;
  await touchEvent('RECURRING', `scheduled work ${result.recurringOrder.id.slice(0, 12)} created`, {
    recurringOrderId: result.recurringOrder.id,
    ownerLogin: current.login,
    interval: result.recurringOrder.schedule?.interval || 'daily',
    nextRunAt: result.recurringOrder.nextRunAt || null
  });
  if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
  return { ...normalizeDeliveryScheduleResponse({ recurring_order: result.recurringOrder }, action.kind), statusCode: 201 };
}

async function classifyDeliveryArtifactWithOpenAi(body = {}, source = process.env, options = {}) {
  const config = openChatIntentLlmConfig(source, options);
  if (!config.apiKey) return { ok: false, available: false, source: 'openai', error: 'OpenAI API key is not configured' };
  const content = sanitizeOpenChatOrderBrief(redactOpenChatContextSecrets(body.content || ''), 12000);
  if (!content) return { ok: false, error: 'content required' };
  const title = sanitizeOpenChatIntentText(redactOpenChatContextSecrets(body.title || ''), 140, 'English');
  const format = sanitizeOpenChatIntentText(body.format || '', 40, 'English');
  const fileName = sanitizeOpenChatIntentText(body.file_name || body.fileName || '', 140, 'English');
  const taskType = sanitizeOpenChatIntentText(body.task_type || body.taskType || '', 60, 'English');
  const userLanguage = openChatIntentLanguage(`${title}\n${content}`, body.user_language || body.userLanguage);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.openAiBaseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.openAiModel,
        store: false,
        input: [
          { role: 'system', content: deliveryClassifierSystemPrompt(userLanguage) },
          { role: 'user', content: JSON.stringify({ title, format, file_name: fileName, task_type: taskType, content }) }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'cait_delivery_classifier',
            strict: true,
            schema: DELIVERY_CLASSIFIER_SCHEMA
          }
        },
        max_output_tokens: 500
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, available: false, source: 'openai', error: payload?.error?.message || payload.error || `OpenAI request failed (${response.status})` };
    }
    return normalizeDeliveryClassificationResult(parseIntentJson(extractOpenAiIntentText(payload)), 'openai', userLanguage);
  } catch (error) {
    return { ok: false, available: false, source: 'openai', error: error?.name === 'AbortError' ? 'OpenAI delivery classification timed out' : String(error?.message || error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function classifyOpenChatIntentWithOpenAi(body = {}, source = process.env, options = {}) {
  const config = openChatIntentLlmConfig(source, options);
  if (!config.apiKey) return { ok: false, available: false, source: 'openai', error: 'OpenAI API key is not configured' };
  const prompt = String(body.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!prompt) return { ok: false, error: 'prompt required' };
  const fallbackIntent = String(body.fallback_intent || body.fallbackIntent || '').trim();
  const userLanguage = openChatIntentLanguage(prompt, body.user_language || body.userLanguage);
  const preparedBrief = sanitizeOpenChatOrderBrief(body.prepared_brief || body.preparedBrief || '', 5000);
  const uiLabels = {
    sendOrder: String(options?.uiLabels?.sendOrder || WORK_ORDER_UI_LABELS.sendOrder),
    addConstraints: String(options?.uiLabels?.addConstraints || WORK_ORDER_UI_LABELS.addConstraints)
  };
  const conversationContext = Array.isArray(body.conversation_context || body.conversationContext)
    ? (body.conversation_context || body.conversationContext).slice(-12).map((item) => ({
      role: String(item?.role || '').slice(0, 20),
      content: String(item?.content || '').replace(/\s+/g, ' ').trim().slice(0, 900),
      created_at: String(item?.created_at || '').slice(0, 80)
    })).filter((item) => item.content)
    : [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.openAiBaseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.openAiModel,
        store: false,
        input: [
          { role: 'system', content: openChatIntentSystemPrompt(userLanguage, uiLabels) },
          { role: 'user', content: JSON.stringify({
            prompt,
            fallback_intent: fallbackIntent,
            user_language: userLanguage,
            prepared_brief: preparedBrief,
            conversation_context: conversationContext,
            desired_output: body.desired_output || body.desiredOutput || ''
          }) }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'cait_preorder_intent',
            strict: true,
            schema: OPEN_CHAT_INTENT_SCHEMA
          }
        },
        max_output_tokens: 1200
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, available: false, source: 'openai', error: payload?.error?.message || payload.error || `OpenAI request failed (${response.status})` };
    }
    return normalizeOpenChatIntentResult(parseIntentJson(extractOpenAiIntentText(payload)), fallbackIntent, 'openai', userLanguage);
  } catch (error) {
    return { ok: false, available: false, source: 'openai', error: error?.name === 'AbortError' ? 'OpenAI intent classification timed out' : String(error?.message || error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function classifyOpenChatIntent(body = {}, source = process.env, options = {}) {
  const config = openChatIntentLlmConfig(source, options);
  if (!config.enabled) return { ok: false, available: false, source: 'none', error: 'Open Chat intent LLM disabled' };
  if (config.provider === 'openai') return classifyOpenChatIntentWithOpenAi(body, source, options);
  return { ok: false, available: false, source: config.provider, error: 'Unsupported Open Chat intent LLM provider' };
}
function currentStripeConfig(req) {
  return stripeConfigFromEnv(process.env, { baseUrl: baseUrl(req) });
}
function stripeStateForClient(req, account = null) {
  const config = currentStripeConfig(req);
  const providerAutoEnabled = !['0', 'false', 'off', 'disabled'].includes(String(process.env.PROVIDER_MONTHLY_BILLING_AUTO_ENABLED ?? '1').trim().toLowerCase());
  const providerMonthlyMaxAttempts = Math.max(1, Number(process.env.PROVIDER_MONTHLY_BILLING_MAX_ATTEMPTS || process.env.PROVIDER_MONTHLY_BILLING_MAX_RETRIES || 3) || 3);
  return {
    ...stripePublicConfig(config),
    accountStripe: account?.stripe || null,
    billingProfile: billingProfileForAccount(account, '', billingPeriodId()),
    providerMonthlyAutoEnabled: providerAutoEnabled,
    providerMonthlyMaxAttempts
  };
}
function stripeActionErrorPayload(error = {}, fallback = 'Stripe action failed.') {
  const message = String(error?.message || fallback).trim() || fallback;
  const details = error?.details && typeof error.details === 'object' ? error.details : {};
  const stripeCode = String(details?.error?.code || error?.code || '').trim();
  const lower = `${message} ${stripeCode}`.toLowerCase();
  let code = stripeCode || 'stripe_action_failed';
  let action = '';
  if (/not configured/.test(lower)) {
    code = 'stripe_not_configured';
    action = 'Set Stripe environment variables on the platform, then retry.';
  } else if (/invalid email|email address/.test(lower)) {
    code = 'stripe_invalid_email';
    action = 'Open SETTINGS, update the billing/provider email, save, then retry.';
  } else if (/connect.*not enabled|signed up for connect/.test(lower)) {
    code = 'connect_not_enabled';
    action = 'Complete Stripe Connect activation on the platform account, then retry OPEN CONNECT.';
  } else if (/restricted|prohibited|not allowed|unsupported business|risk/.test(lower)) {
    code = 'stripe_restricted_business';
    action = 'Confirm the platform business category and remove Stripe-prohibited use cases before retrying.';
  } else if (/api key|authentication/.test(lower)) {
    code = 'stripe_authentication_failed';
    action = 'Check that the Stripe secret key exists and matches the Stripe account mode.';
  }
  return {
    error: message,
    code,
    action: action || undefined,
    stripe_status: Number(error?.statusCode || 0) || undefined,
    statusCode: Number(error?.statusCode || 0) || 500
  };
}
async function ensureStripeCustomerForCurrent(current, req) {
  const config = currentStripeConfig(req);
  if (!stripeConfigured(config)) return { error: 'Stripe is not configured', statusCode: 503, config };
  const state = await storage.getState();
  const account = accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  let result = null;
  if (account?.stripe?.customerId) return { config, account, customerId: account.stripe.customerId };
  const created = await ensureStripeCustomer(config, account);
  await storage.mutate(async (draft) => {
    result = upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
      stripe: {
        ...(account.stripe || {}),
        customerId: created.customerId,
        customerStatus: 'ready',
        lastSyncAt: nowIso(),
        mode: 'configured'
      }
    });
  });
  return { config, account: result, customerId: created.customerId };
}
async function attemptStripeAutoTopup(current, req, neededNow) {
  const config = currentStripeConfig(req);
  if (!stripeConfigured(config)) return { ok: false, code: 'stripe_not_configured', error: 'Stripe is not configured' };
  const state = await storage.getState();
  const account = accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  const ledgerChargeAmount = suggestAutoTopupChargeAmount(account, neededNow, billingPeriodId());
  if (ledgerChargeAmount <= 0) return { ok: false, code: 'auto_topup_not_needed', error: 'Auto top-up is not needed' };
  const customerId = account?.stripe?.customerId;
  const paymentMethodId = account?.stripe?.defaultPaymentMethodId;
  if (!customerId || !paymentMethodId) {
    return { ok: false, code: 'payment_method_missing', error: 'Use ADD DEPOSIT or OPEN PLAN CHECKOUT first so Stripe can save a payment method for auto top-up.' };
  }
  const intent = await createOffSessionTopupPaymentIntent(config, {
    account,
    customerId,
    paymentMethodId,
    amount: ledgerAmountToDisplayCurrency(ledgerChargeAmount),
    currency: BILLING_DISPLAY_CURRENCY,
    ledgerAmount: ledgerChargeAmount
  });
  if (intent.status !== 'succeeded') {
    return { ok: false, code: 'auto_topup_not_captured', error: `Auto top-up did not complete (${intent.status})`, intent };
  }
  let updated = null;
  await storage.mutate(async (draft) => {
    const draftAccount = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
    const topupHistory = recordStripeTopupInAccount(draftAccount, {
      kind: 'auto_topup_charge',
      paymentIntentId: intent.id,
      amount: ledgerChargeAmount,
      currency: BILLING_DISPLAY_CURRENCY,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    updated = upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
      billing: {
        ...(draftAccount.billing || {}),
        depositBalance: Number(draftAccount.billing?.depositBalance || 0) + ledgerChargeAmount
      },
      stripe: {
        ...(draftAccount.stripe || {}),
        customerId,
        customerStatus: 'ready',
        lastTopupAmount: ledgerChargeAmount,
        lastTopupCurrency: BILLING_DISPLAY_CURRENCY,
        lastTopupAt: nowIso(),
        topupHistory,
        lastSyncAt: nowIso(),
        mode: 'configured'
      }
    });
  });
  await touchEvent('STRIPE', `${current.login} auto top-up succeeded ${ledgerChargeAmount}`);
  return { ok: true, amount: ledgerChargeAmount, intent, account: updated };
}
async function applyStripeWebhookEvent(event) {
  const object = event?.data?.object || {};
  let metadata = object?.metadata || {};
  let login = String(metadata.aiagent2_account_login || '').trim().toLowerCase();
  let inferredKind = String(metadata.aiagent2_kind || '').trim().toLowerCase();
  let paymentIntent = null;
  if (event.type === 'charge.refunded' && object.payment_intent) {
    try {
      const config = stripeConfigFromEnv(process.env, { baseUrl: process.env.BASE_URL || '' });
      paymentIntent = await retrievePaymentIntent(config, object.payment_intent);
      const paymentIntentMetadata = paymentIntent?.metadata || {};
      metadata = { ...paymentIntentMetadata, ...metadata };
      if (!login) login = String(paymentIntentMetadata.aiagent2_account_login || '').trim().toLowerCase();
      if (!inferredKind) inferredKind = String(paymentIntentMetadata.aiagent2_kind || '').trim().toLowerCase();
    } catch {}
  }
  if (!login && object.customer) {
    const state = await storage.getState();
    const matched = (state.accounts || []).find((item) => String(item?.stripe?.customerId || '').trim() === String(object.customer || '').trim());
    if (matched?.login) login = String(matched.login || '').trim().toLowerCase();
  }
  if (!login) return { ok: true, ignored: true };
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (metadata.aiagent2_kind === 'deposit_topup') {
      if (event.type === 'checkout.session.completed' && String(object.payment_status || '').toLowerCase() !== 'paid') {
        return { ok: true, ignored: true, pending: true };
      }
      const amount = Number(metadata.aiagent2_ledger_amount || 0) > 0
        ? Number(metadata.aiagent2_ledger_amount || 0)
        : amountFromMinorUnits(object.amount_total || 0, metadata.aiagent2_currency || BILLING_DISPLAY_CURRENCY);
      let updated = null;
      let duplicate = false;
      await storage.mutate(async (draft) => {
        const account = accountSettingsForLogin(draft, login);
        const processed = Array.isArray(account.stripe?.processedTopupCheckoutSessionIds)
          ? account.stripe.processedTopupCheckoutSessionIds.map((item) => String(item || ''))
          : [];
        if (processed.includes(String(object.id || ''))) {
          duplicate = true;
          updated = account;
          return;
        }
        const topupHistory = recordStripeTopupInAccount(account, {
          kind: 'deposit_topup',
          checkoutSessionId: object.id,
          paymentIntentId: String(object.payment_intent || ''),
          amount,
          currency: metadata.aiagent2_currency || account.billing?.currency || BILLING_DISPLAY_CURRENCY,
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
        const stripePatch = {
          ...(account.stripe || {}),
          customerId: object.customer || account.stripe?.customerId || null,
          customerStatus: object.customer ? 'ready' : account.stripe?.customerStatus || 'not_started',
          lastTopupCheckoutSessionId: object.id,
          pendingTopupCheckoutSessionId: String(account.stripe?.pendingTopupCheckoutSessionId || '') === String(object.id || '') ? null : account.stripe?.pendingTopupCheckoutSessionId || null,
          processedTopupCheckoutSessionIds: [...processed.filter(Boolean), String(object.id || '')].slice(-20),
          lastTopupAmount: amount,
          lastTopupCurrency: metadata.aiagent2_currency || account.billing?.currency || BILLING_DISPLAY_CURRENCY,
          lastTopupAt: nowIso(),
          topupHistory,
          lastSyncAt: nowIso(),
          mode: 'configured'
        };
        updated = upsertAccountSettingsInState(draft, login, null, 'github-app', {
          billing: {
            ...(account.billing || {}),
            depositBalance: Number(account.billing?.depositBalance || 0) + amount
          },
          stripe: stripePatch
        });
      });
      if (duplicate) return { ok: true, ignored: true, duplicate: true };
      if (object.payment_intent && updated?.stripe?.customerId) {
        try {
          const config = stripeConfigFromEnv(process.env, { baseUrl: process.env.BASE_URL || '' });
          const paymentIntent = await retrievePaymentIntent(config, object.payment_intent);
          if (paymentIntent?.payment_method) {
            await updateCustomerDefaultPaymentMethod(config, updated.stripe.customerId, paymentIntent.payment_method);
            await storage.mutate(async (draft) => {
              const account = accountSettingsForLogin(draft, login);
              upsertAccountSettingsInState(draft, login, null, 'github-app', {
                billing: {
                  ...(account.billing || {}),
                  invoiceEnabled: true,
                  invoiceApproved: true
                },
                stripe: {
                  ...(account.stripe || {}),
                  defaultPaymentMethodId: paymentIntent.payment_method,
                  defaultPaymentMethodStatus: 'ready',
                  customerId: updated.stripe.customerId,
                  customerStatus: 'ready',
                  lastSyncAt: nowIso()
                }
              });
            });
          }
        } catch {}
      }
      await touchEvent('STRIPE', `${login} deposit top-up completed ${amount}`);
      return { ok: true };
    }
    if (metadata.aiagent2_kind === 'payment_method_setup' && object.setup_intent) {
      const config = stripeConfigFromEnv(process.env, { baseUrl: process.env.BASE_URL || '' });
      const setupIntent = await retrieveSetupIntent(config, object.setup_intent);
      const paymentMethodId = setupIntent?.payment_method || '';
      if (object.customer && paymentMethodId) {
        await updateCustomerDefaultPaymentMethod(config, object.customer, paymentMethodId);
        await storage.mutate(async (draft) => {
          const account = accountSettingsForLogin(draft, login);
          upsertAccountSettingsInState(draft, login, null, 'github-app', {
            billing: {
              ...(account.billing || {}),
              mode: 'monthly_invoice',
              invoiceEnabled: true,
              invoiceApproved: true
            },
            stripe: {
              ...(account.stripe || {}),
              customerId: object.customer,
              customerStatus: 'ready',
              defaultPaymentMethodId: paymentMethodId,
              defaultPaymentMethodStatus: 'ready',
              setupCheckoutStatus: 'completed',
              setupCheckoutSessionId: object.id,
              lastSyncAt: nowIso(),
              mode: 'configured'
            }
          });
        });
        await touchEvent('STRIPE', `${login} saved payment method`);
      }
      return { ok: true };
    }
    if (metadata.aiagent2_kind === 'subscription_checkout') {
      const config = stripeConfigFromEnv(process.env, { baseUrl: process.env.BASE_URL || '' });
      const subscription = object.subscription ? await retrieveSubscription(config, object.subscription) : null;
      const priceId = subscription?.items?.data?.[0]?.price?.id || '';
      const plan = resolveSubscriptionPlanFromPriceId(config, priceId) || metadata.aiagent2_plan || 'none';
      const currentPeriodEnd = subscription?.current_period_end ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null;
      let refill = { granted: false, amount: 0, billingPatch: null, stripePatch: null };
      await storage.mutate(async (draft) => {
        const account = accountSettingsForLogin(draft, login);
        if ((subscription?.status === 'active' || subscription?.status === 'trialing') && currentPeriodEnd) {
          refill = applySubscriptionRefillToAccount(account, {
            plan,
            periodEnd: currentPeriodEnd,
            at: nowIso()
          });
        }
        upsertAccountSettingsInState(draft, login, null, 'github-app', {
          billing: refill.granted ? {
            ...(account.billing || {}),
            ...(refill.billingPatch || {}),
            subscriptionPlan: plan || account.billing?.subscriptionPlan || 'none',
            subscriptionIncludedCredits: refill.amount > 0 ? refill.amount : account.billing?.subscriptionIncludedCredits || 0
          } : undefined,
          stripe: {
            ...(account.stripe || {}),
            ...(refill.stripePatch || {}),
            customerId: object.customer || account.stripe?.customerId || null,
            customerStatus: object.customer ? 'ready' : account.stripe?.customerStatus || 'not_started',
            subscriptionId: object.subscription || account.stripe?.subscriptionId || null,
            subscriptionStatus: subscription?.status || (object.subscription ? 'active' : 'pending'),
            subscriptionPriceId: priceId || account.stripe?.subscriptionPriceId || null,
            subscriptionPlan: plan || account.stripe?.subscriptionPlan || 'none',
            subscriptionCurrentPeriodEnd: currentPeriodEnd || account.stripe?.subscriptionCurrentPeriodEnd || null,
            lastSyncAt: nowIso(),
            mode: 'configured'
          }
        });
      });
      await touchEvent('STRIPE', refill.granted ? `${login} subscription checkout completed + refill ${refill.amount}` : `${login} subscription checkout completed`);
      return { ok: true };
    }
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created' || event.type === 'customer.subscription.deleted') {
    const config = stripeConfigFromEnv(process.env, { baseUrl: process.env.BASE_URL || '' });
    const priceId = object.items?.data?.[0]?.price?.id || '';
    const inferredPlan = resolveSubscriptionPlanFromPriceId(config, priceId);
    const activePlan = inferredPlan !== 'none'
      ? inferredPlan
      : String(object.metadata?.aiagent2_plan || '').trim().toLowerCase() || String(object.plan?.nickname || '').trim().toLowerCase() || 'none';
    const currentPeriodEnd = object.current_period_end ? new Date(Number(object.current_period_end) * 1000).toISOString() : null;
    let refill = { granted: false, amount: 0, billingPatch: null, stripePatch: null, plan: activePlan, periodEnd: currentPeriodEnd };
    await storage.mutate(async (draft) => {
      const account = accountSettingsForLogin(draft, login);
      if ((object.status === 'active' || object.status === 'trialing') && currentPeriodEnd) {
        refill = applySubscriptionRefillToAccount(account, {
          plan: activePlan,
          periodEnd: currentPeriodEnd,
          at: nowIso()
        });
      }
      upsertAccountSettingsInState(draft, login, null, 'github-app', {
        billing: refill.granted ? {
          ...(account.billing || {}),
          ...(refill.billingPatch || {}),
          subscriptionPlan: activePlan !== 'none' ? activePlan : account.billing?.subscriptionPlan || 'none',
          subscriptionIncludedCredits: refill.amount > 0 ? refill.amount : account.billing?.subscriptionIncludedCredits || 0
        } : {
          ...(account.billing || {}),
          subscriptionPlan: activePlan !== 'none' ? activePlan : account.billing?.subscriptionPlan || 'none'
        },
        stripe: {
          ...(account.stripe || {}),
          ...(refill.stripePatch || {}),
          customerId: object.customer || account.stripe?.customerId || null,
          subscriptionId: object.id || account.stripe?.subscriptionId || null,
          subscriptionStatus: object.status || (event.type.endsWith('deleted') ? 'canceled' : account.stripe?.subscriptionStatus || 'not_started'),
          subscriptionPriceId: priceId || account.stripe?.subscriptionPriceId || null,
          subscriptionPlan: activePlan !== 'none' ? activePlan : account.stripe?.subscriptionPlan || 'none',
          subscriptionCurrentPeriodEnd: currentPeriodEnd || account.stripe?.subscriptionCurrentPeriodEnd || null,
          lastSyncAt: nowIso(),
          mode: 'configured'
        }
      });
    });
    if (refill.granted) await touchEvent('STRIPE', `${login} subscription refill added ${refill.amount}`);
    return { ok: true };
  }
  if (event.type === 'account.updated') {
    const accountId = object.id;
    let matchedLogin = '';
    const state = await storage.getState();
    for (const item of state.accounts || []) {
      if (item?.stripe?.connectedAccountId === accountId) {
        matchedLogin = item.login;
        break;
      }
    }
    if (matchedLogin) {
      await storage.mutate(async (draft) => {
        const account = accountSettingsForLogin(draft, matchedLogin);
        upsertAccountSettingsInState(draft, matchedLogin, null, 'github-app', {
          stripe: {
            ...(account.stripe || {}),
            connectedAccountId: accountId,
            connectedAccountStatus: object.payouts_enabled ? 'ready' : 'pending',
            connectOnboardingStatus: object.details_submitted ? 'completed' : 'pending',
            chargesEnabled: Boolean(object.charges_enabled),
            payoutsEnabled: Boolean(object.payouts_enabled),
            lastSyncAt: nowIso(),
            mode: 'configured'
          }
        });
      });
      return { ok: true };
    }
  }
  if (event.type === 'charge.refunded') {
    const refundKind = inferredKind || String(metadata.aiagent2_kind || '').trim().toLowerCase();
    if (!['deposit_topup', 'auto_topup_charge'].includes(refundKind)) return { ok: true, ignored: true };
    const originalLedgerAmount = Number(metadata.aiagent2_ledger_amount || 0) > 0
      ? Number(metadata.aiagent2_ledger_amount || 0)
      : amountFromMinorUnits(object.amount || 0, metadata.aiagent2_currency || paymentIntent?.currency || BILLING_DISPLAY_CURRENCY);
    const refundedAmount = Number(object.amount || 0) > 0
      ? +(originalLedgerAmount * (Number(object.amount_refunded || 0) / Number(object.amount || 1))).toFixed(1)
      : amountFromMinorUnits(object.amount_refunded || 0, metadata.aiagent2_currency || paymentIntent?.currency || BILLING_DISPLAY_CURRENCY);
    if (!(refundedAmount > 0)) return { ok: true, ignored: true };
    let outcome = { delta: 0, deficit: 0, blocked: false, availableDeposit: 0, requiredDeposit: 0 };
    await storage.mutate(async (draft) => {
      const account = accountSettingsForLogin(draft, login);
      const applied = applyStripeRefundToAccount(account, {
        kind: refundKind,
        paymentIntentId: String(object.payment_intent || paymentIntent?.id || ''),
        chargeId: String(object.id || ''),
        amount: originalLedgerAmount,
        amountRefunded: refundedAmount,
        currency: metadata.aiagent2_currency || paymentIntent?.currency || BILLING_DISPLAY_CURRENCY,
        updatedAt: nowIso()
      });
      outcome = applied;
      if (applied.blocked || !(applied.delta > 0)) return;
      upsertAccountSettingsInState(draft, login, null, 'github-app', {
        billing: applied.billingPatch,
        stripe: {
          ...applied.stripePatch,
          customerId: String(object.customer || account.stripe?.customerId || ''),
          customerStatus: object.customer ? 'ready' : account.stripe?.customerStatus || 'not_started',
          lastSyncAt: nowIso(),
          mode: 'configured'
        }
      });
    });
    if (outcome.blocked) {
      await touchEvent(
        'STRIPE',
        `${login} refund blocked insufficient deposit ${outcome.availableDeposit}/${outcome.requiredDeposit}`
      );
      return { ok: true, blocked: true };
    }
    if (outcome.delta > 0) {
      await touchEvent(
        'STRIPE',
        `${login} refund recorded ${outcome.delta}`
      );
    }
    return { ok: true };
  }
  return { ok: true, ignored: true };
}
function githubHeaders(token = '') {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'aiagent2' };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}
function parseGithubScopesHeader(value) {
  return [...new Set(String(value || '').split(',').map(part => part.trim()).filter(Boolean))];
}
async function fetchGithubUserProfile(token) {
  const response = await fetch('https://api.github.com/user', { headers: githubHeaders(token) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Request failed (${response.status})`);
  return { user: data, scopes: parseGithubScopesHeader(response.headers.get('x-oauth-scopes')) };
}
async function fetchGoogleUserProfile(token) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Request failed (${response.status})`);
  return data;
}

function googleConnectorTokenExpired(connector = null, skewMs = 120_000) {
  const expiresAt = String(connector?.tokenExpiresAt || '').trim();
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp <= (Date.now() + skewMs);
}

async function googleAccessTokenForConnector(login = '', user = null, authProvider = '', connector = null) {
  if (!connector?.connected || !connector?.accessTokenEnc) {
    const error = new Error('Google connection required before CAIt can read analytics sources.');
    error.statusCode = 409;
    error.code = 'connector_required';
    throw error;
  }
  if (!googleConnectorTokenExpired(connector)) {
    return {
      accessToken: await decryptConnectorSecret(process.env, connector.accessTokenEnc),
      connector,
      refreshed: false
    };
  }
  if (!connector.refreshTokenEnc) {
    const error = new Error('Google connection needs to be refreshed before CAIt can read analytics sources.');
    error.statusCode = 409;
    error.code = 'connector_reauth_required';
    throw error;
  }
  const refreshToken = await decryptConnectorSecret(process.env, connector.refreshTokenEnc);
  const token = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });
  const mergedToken = {
    ...token,
    refresh_token: refreshToken,
    scope: token.scope || connector.scopes || googleOAuthScope()
  };
  let updatedConnector = connector;
  await storage.mutate(async (draft) => {
    const latest = accountSettingsForLogin(draft, login, user, authProvider);
    updatedConnector = await googleConnectorFromOAuthToken(process.env, {
      providerUserId: connector.providerUserId,
      email: connector.email,
      name: connector.name,
      profileUrl: connector.profileUrl,
      avatarUrl: connector.avatarUrl
    }, mergedToken, latest?.connectors?.google || connector);
    upsertAccountSettingsInState(draft, login, user, authProvider, {
      connectors: {
        ...(latest?.connectors || {}),
        google: updatedConnector
      }
    });
  });
  return {
    accessToken: await decryptConnectorSecret(process.env, updatedConnector.accessTokenEnc),
    connector: updatedConnector,
    refreshed: true
  };
}

async function fetchGoogleAuthorizedJson(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json'
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error_description || data?.error || `Google API request failed (${response.status})`);
    error.statusCode = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function encodeBase64UrlUtf8(value = '') {
  return Buffer.from(String(value || ''), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function validateEmailAddress(value = '') {
  const text = String(value || '').trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text);
}

function resendApiKey() {
  return String(process.env.RESEND_API_KEY || '').trim();
}

function resendConfigured() {
  return Boolean(resendApiKey());
}

function resendFromEmail() {
  const configured = String(process.env.RESEND_FROM_EMAIL || process.env.WELCOME_EMAIL_FROM || '').trim();
  if (validateEmailAddress(configured)) return configured;
  return 'hello@aiagent-marketplace.net';
}

function resendReplyToEmail() {
  const configured = String(process.env.RESEND_REPLY_TO_EMAIL || '').trim();
  return validateEmailAddress(configured) ? configured : resendFromEmail();
}

function buildPlainTextEmailRaw({ to = '', subject = '', text = '' } = {}) {
  const safeTo = String(to || '').trim();
  const safeSubject = String(subject || '').replace(/[\r\n]+/g, ' ').trim();
  const safeText = String(text || '').replace(/\r\n/g, '\n');
  return [
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    safeText
  ].join('\r\n');
}

async function sendGoogleGmailMessage(accessToken, payload = {}) {
  const raw = encodeBase64UrlUtf8(buildPlainTextEmailRaw(payload));
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ raw })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error_description || data?.error || `Gmail send failed (${response.status})`);
    error.statusCode = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

async function sendResendEmail(payload = {}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${resendApiKey()}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      from: payload.from,
      to: [payload.to],
      reply_to: payload.replyTo || undefined,
      subject: payload.subject,
      text: payload.text,
      html: payload.html
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Resend send failed (${response.status})`);
    error.statusCode = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}
async function fetchAllGithubRepos(token) {
  const headers = githubHeaders(token);
  const collected = [];
  for (let page = 1; page <= 5; page += 1) {
    const url = `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member`;
    const repos = await fetchJson(url, { headers });
    if (!Array.isArray(repos) || !repos.length) break;
    collected.push(...repos);
    if (repos.length < 100) break;
  }
  const seen = new Set();
  return collected.filter(repo => {
    if (!repo?.full_name || seen.has(repo.full_name)) return false;
    seen.add(repo.full_name);
    return true;
  });
}
async function fetchGithubPublicRepos(userLogin, token = '') {
  const headers = githubHeaders(token);
  const collected = [];
  if (token) {
    try {
      for (let page = 1; page <= 5; page += 1) {
        const url = `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&visibility=public&affiliation=owner,collaborator,organization_member`;
        const repos = await fetchJson(url, { headers });
        if (!Array.isArray(repos) || !repos.length) break;
        collected.push(...repos);
        if (repos.length < 100) break;
      }
    } catch {}
  }
  if (!collected.length && userLogin) {
    for (let page = 1; page <= 5; page += 1) {
      const url = `https://api.github.com/users/${encodeURIComponent(userLogin)}/repos?per_page=100&page=${page}&sort=updated&type=owner`;
      const repos = await fetchJson(url, { headers: githubHeaders() });
      if (!Array.isArray(repos) || !repos.length) break;
      collected.push(...repos);
      if (repos.length < 100) break;
    }
  }
  const seen = new Set();
  return collected.filter(repo => {
    if (!repo?.full_name || repo.private || seen.has(repo.full_name)) return false;
    seen.add(repo.full_name);
    return true;
  });
}
async function fetchGithubRepoMeta(owner, repo, token = '') {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: githubHeaders(token) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, error: payload?.message || `GitHub API returned ${response.status}` };
  }
  return { ok: true, repo: payload };
}
function normalizePem(raw) {
  const pem = String(raw || '').replace(/\\n/g, '\n').trim();
  if (!pem) return '';
  if (pem.includes('BEGIN RSA PRIVATE KEY')) {
    try {
      return createPrivateKey(pem).export({ format: 'pem', type: 'pkcs8' }).toString().trim();
    } catch {
      return pem;
    }
  }
  return pem;
}
function githubAppId() {
  return String(process.env.GITHUB_APP_ID || '').trim();
}
function githubAppClientId() {
  return String(process.env.GITHUB_APP_CLIENT_ID || '').trim();
}
function githubAppClientSecret() {
  return String(process.env.GITHUB_APP_CLIENT_SECRET || '').trim();
}
function githubAppPrivateKey() {
  return normalizePem(process.env.GITHUB_APP_PRIVATE_KEY || '');
}
function githubAppSlug() {
  return String(process.env.GITHUB_APP_SLUG || '').trim();
}
function githubAppConfigured() {
  return Boolean(githubAppId() && githubAppClientId() && githubAppClientSecret() && githubAppPrivateKey());
}
function githubAppSetup() {
  return {
    name: String(process.env.GITHUB_APP_NAME || 'aiagent2-marketplace').trim() || 'aiagent2-marketplace',
    description: 'Installable GitHub App for CAIt manifest import and adapter PR creation.',
    permissions: {
      contents: 'write',
      pull_requests: 'write',
      metadata: 'read'
    },
    events: []
  };
}
function githubAppRegistrationBaseUrl() {
  const owner = String(process.env.GITHUB_APP_OWNER || '').trim();
  return owner
    ? `https://github.com/organizations/${encodeURIComponent(owner)}/settings/apps/new`
    : 'https://github.com/settings/apps/new';
}
function githubAppRegistrationUrl(req) {
  const root = baseUrl(req);
  const setup = githubAppSetup();
  const params = new URLSearchParams();
  params.set('name', setup.name);
  params.set('description', setup.description);
  params.set('url', root);
  params.append('callback_urls[]', `${root}/auth/github-app/callback`);
  params.set('request_oauth_on_install', 'true');
  params.set('public', 'false');
  params.set('webhook_active', 'false');
  params.set('contents', 'write');
  params.set('pull_requests', 'write');
  params.set('metadata', 'read');
  return `${githubAppRegistrationBaseUrl()}?${params.toString()}`;
}
async function githubAppJwt() {
  const pem = githubAppPrivateKey();
  if (!pem) throw new Error('GitHub App private key is not configured');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: githubAppId() })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(pem, 'base64url')}`;
}
async function githubAppFetchJson(url, options = {}) {
  const jwt = await githubAppJwt();
  return fetchJson(url, {
    ...options,
    headers: {
      ...githubHeaders(),
      authorization: `Bearer ${jwt}`,
      ...(options.headers || {})
    }
  });
}
async function githubAppMetadata() {
  return githubAppFetchJson('https://api.github.com/app');
}
async function githubAppInstallSlug() {
  const configuredSlug = githubAppSlug();
  if (configuredSlug) return configuredSlug;
  const metadata = await githubAppMetadata();
  return String(metadata.slug || '').trim();
}
async function githubAppInstallationToken(installationId) {
  const response = await githubAppFetchJson(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  return response?.token || '';
}
async function githubAppUserTokenFromCode(code, redirectUri) {
  return fetchJson('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: githubAppClientId(),
      client_secret: githubAppClientSecret(),
      code,
      redirect_uri: redirectUri
    })
  });
}
async function githubAppUserInstallations(userToken) {
  const response = await fetchJson('https://api.github.com/user/installations', { headers: githubHeaders(userToken) });
  return Array.isArray(response?.installations) ? response.installations : [];
}
async function githubAppUserInstallationRepos(userToken, installationId) {
  const response = await fetchJson(`https://api.github.com/user/installations/${installationId}/repositories`, { headers: githubHeaders(userToken) });
  return Array.isArray(response?.repositories) ? response.repositories : [];
}
function githubPrivateRepoImportEnabled() {
  return String(process.env.GITHUB_ALLOW_PRIVATE_REPO_IMPORT || '').trim() === '1';
}
function githubOAuthScope() {
  const configured = String(process.env.GITHUB_OAUTH_SCOPE || '').trim();
  if (configured) return configured;
  return githubPrivateRepoImportEnabled() ? 'read:user repo' : 'read:user';
}
function githubGrantedScopes(session) {
  return Array.isArray(session?.githubScopes) ? session.githubScopes : [];
}
function githubSessionCanReadPrivateRepos(session) {
  return githubPrivateRepoImportEnabled() && githubGrantedScopes(session).includes('repo');
}
function githubAuthProvider(session) {
  return String(session?.authProvider || '').trim() || 'guest';
}
function sessionAuthProvider(session) {
  const explicit = String(session?.authProvider || '').trim();
  if (explicit) return explicit;
  if (sessionHasGoogleOauth(session)) return 'google-oauth';
  if (sessionHasGithubApp(session)) return 'github-app';
  if (sessionHasGithubOauth(session)) return 'github-oauth';
  return 'guest';
}
function sessionHasGithubOauth(session) {
  return Boolean(session?.githubAccessToken && (session?.githubIdentity?.login || session?.githubIdentity?.providerUserId));
}
function sessionHasGithubApp(session) {
  return Boolean(session?.githubAppUserAccessToken && (session?.githubIdentity?.login || session?.githubIdentity?.providerUserId));
}
function sessionHasGoogleOauth(session) {
  return Boolean(session?.googleAccessToken && (session?.googleIdentity?.email || session?.googleIdentity?.providerUserId));
}
function githubAppReposFromSession(session) {
  return Array.isArray(session?.githubApp?.repos) ? session.githubApp.repos : [];
}
function githubAppInstallationsFromSession(session) {
  return Array.isArray(session?.githubApp?.installations) ? session.githubApp.installations : [];
}
function githubUserRecord(user) {
  return {
    id: user.id,
    providerUserId: String(user?.id || '').trim(),
    login: String(user?.login || '').trim().toLowerCase(),
    name: user.name,
    avatarUrl: user.avatar_url,
    profileUrl: user.html_url,
    email: String(user?.email || '').trim().toLowerCase()
  };
}
function googleUserRecord(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  const providerUserId = String(user?.sub || '').trim();
  return {
    id: providerUserId,
    providerUserId,
    login: email || defaultLoginForAuthUser({ email, providerUserId }, 'google-oauth'),
    name: String(user?.name || email || 'Google user').trim(),
    avatarUrl: String(user?.picture || '').trim(),
    profileUrl: '',
    email
  };
}
function xConnectorForAccount(account = null) {
  return account?.connectors?.x && typeof account.connectors.x === 'object' ? account.connectors.x : null;
}
function githubConnectorForAccount(account = null) {
  return account?.connectors?.github && typeof account.connectors.github === 'object' ? account.connectors.github : null;
}
function googleConnectorForAccount(account = null) {
  return account?.connectors?.google && typeof account.connectors.google === 'object' ? account.connectors.google : null;
}
function accountHasGithubConnector(account = null) {
  const connector = githubConnectorForAccount(account);
  return Boolean(connector?.connected && connector?.accessTokenEnc && (connector?.login || connector?.providerUserId));
}
function accountHasGoogleConnector(account = null) {
  const connector = googleConnectorForAccount(account);
  return Boolean(connector?.connected && connector?.accessTokenEnc && (connector?.email || connector?.providerUserId));
}
function accountHasXConnector(account = null) {
  const connector = xConnectorForAccount(account);
  return Boolean(connector?.connected && connector?.accessTokenEnc && connector?.username);
}
function linkedProvidersFromAccount(account = null) {
  const providers = [];
  const emailIdentity = accountIdentityForProvider(account, 'email');
  const googleIdentity = accountIdentityForProvider(account, 'google');
  const githubIdentity = accountIdentityForProvider(account, 'github');
  if (emailIdentity?.provider) providers.push(emailIdentity.provider);
  if (googleIdentity?.provider) providers.push(googleIdentity.provider);
  else if (accountHasGoogleConnector(account)) providers.push('google-oauth');
  if (githubIdentity?.provider) providers.push(githubIdentity.provider);
  else if (accountHasGithubConnector(account)) providers.push('github-oauth');
  if (accountHasXConnector(account)) providers.push('x-oauth');
  return providers;
}
function mergeLinkedSession(baseSession = {}, patch = {}) {
  return {
    ...baseSession,
    ...patch,
    authProvider: patch.authProvider || baseSession.authProvider || 'guest',
    user: patch.user || baseSession.user || null,
    accountLogin: patch.accountLogin || baseSession.accountLogin || '',
    githubIdentity: patch.githubIdentity || baseSession.githubIdentity || null,
    githubAccessToken: patch.githubAccessToken || baseSession.githubAccessToken || '',
    githubScopes: patch.githubScopes || baseSession.githubScopes || [],
    githubAppUserAccessToken: patch.githubAppUserAccessToken || baseSession.githubAppUserAccessToken || '',
    githubApp: patch.githubApp || baseSession.githubApp || null,
    googleIdentity: patch.googleIdentity || baseSession.googleIdentity || null,
    googleAccessToken: patch.googleAccessToken || baseSession.googleAccessToken || '',
    linkedProviders: [...new Set([
      ...(Array.isArray(baseSession.linkedProviders) ? baseSession.linkedProviders : []),
      ...(Array.isArray(patch.linkedProviders) ? patch.linkedProviders : [])
    ])]
  };
}

function hasOAuthBaseSession(session = null) {
  return Boolean(session?.accountLogin || session?.user?.login);
}

function normalizeLocalRedirectPath(req, value = '', fallback = '/') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const parsed = new URL(raw, baseUrl(req));
    const expectedOrigin = new URL(baseUrl(req)).origin;
    if (parsed.origin !== expectedOrigin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
}

function normalizeOAuthLoginSource(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function normalizeOAuthVisitorId(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '')
    .slice(0, 80);
}

function oauthStartContext(req, url = new URL(req.url, baseUrl(req))) {
  const explicitMode = String(url.searchParams.get('mode') || '').toLowerCase();
  const existingSession = getSession(req);
  const action = explicitMode === 'link' ? 'link' : 'login';
  return {
    existingSession,
    action,
    returnTo: normalizeLocalRedirectPath(req, url.searchParams.get('return_to') || '', '/'),
    loginSource: normalizeOAuthLoginSource(url.searchParams.get('login_source') || ''),
    visitorId: normalizeOAuthVisitorId(url.searchParams.get('visitor_id') || '')
  };
}

function shouldLinkOAuthCallback(oauthState = null, existingSession = null) {
  return oauthState?.action === 'link';
}

function authSuccessRedirectPath(req, oauthState = null) {
  return normalizeLocalRedirectPath(req, oauthState?.returnTo || '', '/');
}

function authFailureRedirectPath(req, code = 'auth_failed', oauthState = null) {
  const safeCode = String(code || 'auth_failed').trim() || 'auth_failed';
  if (oauthState?.action === 'login' && oauthState?.loginSource) {
    const loginUrl = new URL('/login.html', baseUrl(req));
    loginUrl.searchParams.set('auth_error', safeCode);
    loginUrl.searchParams.set('source', oauthState.loginSource);
    if (oauthState.returnTo) loginUrl.searchParams.set('next', authSuccessRedirectPath(req, oauthState));
    if (oauthState.visitorId) loginUrl.searchParams.set('visitor_id', oauthState.visitorId);
    return `${loginUrl.pathname}${loginUrl.search}`;
  }
  return `/?auth_error=${encodeURIComponent(safeCode)}`;
}

function emailAuthSecret() {
  return String(process.env.EMAIL_AUTH_SECRET || sessionSecret || '').trim() || generatedSessionSecret;
}

function decodeEmailAuthPayload(raw = '') {
  const [payloadPart = ''] = String(raw || '').split('.');
  if (!payloadPart) return null;
  try {
    return JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function createEmailAuthToken(payload = {}) {
  const data = {
    kind: 'email-auth',
    email: String(payload.email || '').trim().toLowerCase(),
    returnTo: String(payload.returnTo || '/?tab=work').trim() || '/?tab=work',
    loginSource: String(payload.loginSource || 'login_page').trim().toLowerCase() || 'login_page',
    visitorId: String(payload.visitorId || '').trim(),
    exp: Date.now() + EMAIL_AUTH_MAX_AGE_SEC * 1000
  };
  const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const signature = createHmac('sha256', emailAuthSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function parseEmailAuthToken(raw = '') {
  const token = String(raw || '').trim();
  const [payloadPart = '', signaturePart = ''] = token.split('.');
  if (!payloadPart || !signaturePart) return null;
  const expected = createHmac('sha256', emailAuthSecret()).update(payloadPart).digest('base64url');
  if (!secretEquals(signaturePart, expected)) return null;
  const payload = decodeEmailAuthPayload(token);
  if (!payload || payload.kind !== 'email-auth') return null;
  if (Number(payload.exp || 0) < Date.now()) return null;
  const email = String(payload.email || '').trim().toLowerCase();
  if (!validateEmailAddress(email)) return null;
  return {
    email,
    returnTo: String(payload.returnTo || '/?tab=work').trim() || '/?tab=work',
    loginSource: String(payload.loginSource || 'login_page').trim().toLowerCase() || 'login_page',
    visitorId: String(payload.visitorId || '').trim()
  };
}

function emailAuthLinkContent(email = '', link = '') {
  const safeEmail = String(email || '').trim().toLowerCase();
  const safeLink = String(link || '').trim();
  const subject = 'Your CAIt sign-in link';
  const text = [
    `Hi ${safeEmail || 'there'},`,
    '',
    'Use this link to sign in to CAIt or create your account:',
    safeLink,
    '',
    'The link expires in 20 minutes.',
    'If you did not request this email, you can ignore it.'
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <p>Hi ${safeEmail || 'there'},</p>
      <p>Use this link to sign in to CAIt or create your account:</p>
      <p><a href="${safeLink}">Open CAIt sign-in link</a></p>
      <p>This link expires in 20 minutes.</p>
      <p>If you did not request this email, you can ignore it.</p>
    </div>
  `.trim();
  return { subject, text, html, template: 'email_auth_link_v1' };
}

async function sendEmailAuthLink(email = '', link = '', meta = {}) {
  const recipientEmail = String(email || '').trim().toLowerCase();
  const content = emailAuthLinkContent(recipientEmail, link);
  const baseDelivery = {
    id: randomUUID(),
    accountLogin: recipientEmail,
    recipientEmail,
    senderEmail: resendFromEmail(),
    subject: content.subject,
    template: content.template,
    provider: 'resend',
    status: 'queued',
    providerMessageId: '',
    payload: {
      authProvider: 'email',
      from: resendFromEmail(),
      replyTo: resendReplyToEmail(),
      to: recipientEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
      returnTo: String(meta.returnTo || '').trim(),
      loginSource: String(meta.loginSource || '').trim(),
      visitorId: String(meta.visitorId || '').trim()
    },
    response: {},
    errorText: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (!validateEmailAddress(recipientEmail)) {
    const skipped = { ...baseDelivery, status: 'skipped', errorText: 'Valid recipient email is required' };
    await appendEmailDelivery(skipped);
    return skipped;
  }
  if (!resendConfigured()) {
    const skipped = { ...baseDelivery, status: 'skipped', errorText: 'RESEND_API_KEY not configured' };
    await appendEmailDelivery(skipped);
    return skipped;
  }
  try {
    const sent = await sendResendEmail({
      from: resendFromEmail(),
      replyTo: resendReplyToEmail(),
      to: recipientEmail,
      subject: content.subject,
      text: content.text,
      html: content.html
    });
    const delivery = {
      ...baseDelivery,
      status: 'sent',
      providerMessageId: String(sent?.id || ''),
      response: sent,
      updatedAt: nowIso()
    };
    await appendEmailDelivery(delivery);
    await touchEvent('EMAIL', `${recipientEmail} email sign-in link sent`, {
      login: recipientEmail,
      to: recipientEmail,
      template: content.template,
      provider: 'resend',
      providerMessageId: delivery.providerMessageId
    });
    return delivery;
  } catch (error) {
    const failed = {
      ...baseDelivery,
      status: 'failed',
      response: error?.payload || {},
      errorText: String(error?.message || error || 'email auth link send failed').slice(0, 500),
      updatedAt: nowIso()
    };
    await appendEmailDelivery(failed);
    await touchEvent('FAILED', `${recipientEmail} email sign-in link failed`, {
      login: recipientEmail,
      to: recipientEmail,
      template: content.template,
      provider: 'resend',
      error: failed.errorText
    });
    return failed;
  }
}

function mapGithubAppInstallation(installation = {}) {
  return {
    id: installation.id,
    accountLogin: installation.account?.login || '',
    targetType: installation.target_type || '',
    repositorySelection: installation.repository_selection || '',
    htmlUrl: installation.html_url || ''
  };
}
function mapGithubAppRepo(repo = {}, installation = {}) {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    homepage: repo.homepage || '',
    private: Boolean(repo.private),
    defaultBranch: repo.default_branch,
    htmlUrl: repo.html_url,
    owner: repo.owner?.login,
    installationId: installation.id,
    installationAccountLogin: installation.account?.login || '',
    installationTargetType: installation.target_type || ''
  };
}
async function buildGithubAppSession(req, code, requestedInstallationId = '') {
  const callback = `${baseUrl(req)}/auth/github-app/callback`;
  const token = await githubAppUserTokenFromCode(code, callback);
  const { user } = await fetchGithubUserProfile(token.access_token);
  const githubIdentity = githubUserRecord(user);
  const installations = await githubAppUserInstallations(token.access_token);
  const filteredInstallations = requestedInstallationId
    ? installations.filter(installation => String(installation.id) === String(requestedInstallationId))
    : installations;
  if (requestedInstallationId && !filteredInstallations.length) throw new Error('GitHub App installation is not accessible to this user');
  const repos = [];
  for (const installation of filteredInstallations) {
    const installationRepos = await githubAppUserInstallationRepos(token.access_token, installation.id);
    for (const repo of installationRepos) repos.push(mapGithubAppRepo(repo, installation));
  }
  const dedupedRepos = [];
  const seenRepos = new Set();
  for (const repo of repos) {
    const key = `${repo.installationId}:${repo.fullName}`;
    if (seenRepos.has(key)) continue;
    seenRepos.add(key);
    dedupedRepos.push(repo);
  }
  return {
    authProvider: 'github-app',
    sessionVersion: SESSION_VERSION,
    user: githubIdentity,
    githubIdentity,
    githubAppUserAccessToken: token.access_token,
    githubApp: {
      installations: filteredInstallations.map(mapGithubAppInstallation),
      repos: dedupedRepos
    },
    linkedProviders: ['github-app'],
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE_SEC * 1000
  };
}


function githubAppConnectUrl(req, state) {
  const callback = `${baseUrl(req)}/auth/github-app/callback`;
  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', githubAppClientId());
  githubUrl.searchParams.set('redirect_uri', callback);
  githubUrl.searchParams.set('state', state);
  return githubUrl.toString();
}
function githubAppRepoFromSession(session, owner, repo, installationId = '') {
  const target = `${owner}/${repo}`.toLowerCase();
  return githubAppReposFromSession(session).find(item => {
    if (installationId && String(item.installationId) !== String(installationId)) return false;
    return String(item.fullName || '').toLowerCase() === target;
  }) || null;
}
function githubAppAccessFromSession(session = null) {
  return {
    installations: githubAppInstallationsFromSession(session),
    repos: githubAppReposFromSession(session),
    updatedAt: nowIso()
  };
}
function githubAppRepoFromAccount(account = null, owner, repo, installationId = '') {
  const target = `${owner}/${repo}`.toLowerCase();
  const repos = Array.isArray(account?.githubAppAccess?.repos) ? account.githubAppAccess.repos : [];
  return repos.find((item) => {
    if (installationId && String(item.installationId) !== String(installationId)) return false;
    return String(item.fullName || '').toLowerCase() === target;
  }) || null;
}
function githubAppRepoForRequester(current = null, owner, repo, installationId = '') {
  if (current?.session && sessionHasGithubApp(current.session)) {
    return githubAppRepoFromSession(current.session, owner, repo, installationId);
  }
  return githubAppRepoFromAccount(current?.account || null, owner, repo, installationId);
}
async function githubAppRepoTokenForRequester(current = null, owner, repo, installationId = '') {
  const selectedRepo = githubAppRepoForRequester(current, owner, repo, installationId);
  if (!selectedRepo) {
    return {
      error: 'Selected repository is not authorized by this account GitHub App access',
      statusCode: 403,
      use: '/?tab=agents',
      next_step: 'Open AGENTS, connect GitHub, load/select the repo, then retry with CAIT_API_KEY.'
    };
  }
  return {
    selectedRepo,
    installationToken: await githubAppInstallationToken(selectedRepo.installationId)
  };
}
async function persistGithubAppAccess(login, session = null) {
  const safeLogin = String(login || '').trim().toLowerCase();
  if (!safeLogin || !sessionHasGithubApp(session)) return null;
  let account = null;
  await storage.mutate(async (draft) => {
    account = upsertAccountSettingsInState(draft, safeLogin, null, 'github-app', {
      githubAppAccess: githubAppAccessFromSession(session)
    });
  });
  return account;
}
function githubAppWritePermissionHint() {
  return {
    required_permissions: {
      contents: 'read and write',
      pull_requests: 'read and write',
      metadata: 'read only'
    },
    action: 'Update the CAIt GitHub App permissions, accept the permission change on the installation, then retry adapter PR creation.'
  };
}
function githubPermissionError(error, fallback = 'GitHub App write access failed') {
  const message = String(error?.message || error?.error || fallback).trim() || fallback;
  const lower = message.toLowerCase();
  const needsPermissionHint = lower.includes('resource not accessible')
    || lower.includes('must have')
    || lower.includes('forbidden')
    || lower.includes('pull request')
    || lower.includes('contents')
    || lower.includes('refusing to allow');
  return {
    error: message,
    ...(needsPermissionHint ? githubAppWritePermissionHint() : {})
  };
}

const GITHUB_EXECUTOR_MARKER = 'Generated by AIagent2 executor';

function normalizeGithubExecutorPath(value = '') {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  if (!normalized || normalized.includes('..')) return '';
  return normalized;
}

function sanitizeGithubExecutorSlug(value = '', fallback = 'delivery') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

function githubExecutorPlanFromRequest(body = {}, repoMeta = {}) {
  const kind = String(body.kind || 'executor').trim().toLowerCase() || 'executor';
  const sourceJobId = String(body.source_job_id || '').trim();
  const rawTitle = String(body.title || body.source_delivery_title || `${kind} handoff`).trim() || `${kind} handoff`;
  const titleSlug = sanitizeGithubExecutorSlug(rawTitle, kind);
  const shortJobId = sanitizeGithubExecutorSlug(sourceJobId, 'job').slice(0, 12);
  const branchName = `cait/${sanitizeGithubExecutorSlug(kind, 'executor')}-${titleSlug}-${shortJobId}`.slice(0, 120);
  const requestedPath = normalizeGithubExecutorPath(body.repo_path || '');
  const filePath = requestedPath || (kind === 'article_publish'
    ? `.cait/publish/${titleSlug}.md`
    : `.cait/handoffs/${titleSlug}-${shortJobId}.md`);
  const prTitlePrefix = kind === 'article_publish' ? 'CAIt publish' : 'CAIt handoff';
  const prTitle = `${prTitlePrefix}: ${rawTitle}`.slice(0, 240);
  const summaryLines = [
    `${GITHUB_EXECUTOR_MARKER}`,
    '',
    `Kind: ${kind}`,
    sourceJobId ? `Source order: ${sourceJobId}` : '',
    body.source_delivery_title ? `Source delivery: ${String(body.source_delivery_title).trim()}` : '',
    body.source_file_name ? `Source file: ${String(body.source_file_name).trim()}` : '',
    body.execution_mode ? `Execution mode: ${String(body.execution_mode).trim()}` : '',
    '',
    '## Delivered content',
    '',
    String(body.content || '').trim()
  ].filter(Boolean);
  const prBody = [
    `Generated by ${PRODUCT_SHORT_NAME} executor for \`${repoMeta.full_name || `${body.owner}/${body.repo}`}\`.`,
    '',
    `- Kind: ${kind}`,
    sourceJobId ? `- Source order: ${sourceJobId}` : '',
    body.source_delivery_title ? `- Source delivery: ${String(body.source_delivery_title).trim()}` : '',
    `- File added: \`${filePath}\``,
    '',
    'This PR adds the executor handoff file so the repository workflow can continue in GitHub.'
  ].filter(Boolean).join('\n');
  return {
    kind,
    branchName,
    filePath,
    fileContent: summaryLines.join('\n'),
    prTitle,
    prBody
  };
}

async function handleGithubCreateExecutorPr(req, res) {
  const state = await storage.getState();
  const current = currentAgentRequesterContext(state, req);
  if (!current.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
  if (!current.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
  if (!sessionHasGithubApp(current.session) && current.apiKeyStatus !== 'valid') {
    return json(res, 403, {
      error: 'GitHub App login required to create executor PRs.',
      use: '/auth/github'
    });
  }
  const body = await parseBody(req).catch(err => ({ __error: err.message }));
  if (body.__error) return json(res, 400, { error: body.__error });
  if (!body.owner || !body.repo) return json(res, 400, { error: 'owner and repo required' });
  if (!String(body.content || '').trim()) return json(res, 400, { error: 'content required' });
  if (current.apiKeyStatus === 'valid' && body.confirm_repo_write !== true) {
    return json(res, 409, {
      error: 'Repository write confirmation required for CAIT_API_KEY executor PR creation.',
      required: 'Set confirm_repo_write=true after showing the target repository, branch, files, and PR action to the user.',
      repo: `${body.owner}/${body.repo}`,
      use: '/?tab=work'
    });
  }
  try {
    const repoAccess = await githubAppRepoTokenForRequester(current, body.owner, body.repo, body.installation_id || '');
    if (repoAccess.error) return json(res, repoAccess.statusCode || 403, { error: repoAccess.error, use: repoAccess.use, next_step: repoAccess.next_step });
    const { selectedRepo, installationToken } = repoAccess;
    const repoMetaResult = await fetchGithubRepoMeta(body.owner, body.repo, installationToken);
    if (!repoMetaResult.ok) return json(res, repoMetaResult.status === 404 ? 404 : 400, { error: repoMetaResult.error });
    const repoMeta = repoMetaResult.repo;
    const plan = githubExecutorPlanFromRequest(body, repoMeta);
    const baseSha = await fetchGithubBranchSha(installationToken, body.owner, body.repo, repoMeta.default_branch);
    if (!baseSha.ok || !baseSha.sha) {
      return json(res, 400, { error: baseSha.error || `Could not resolve ${repoMeta.default_branch}` });
    }
    const branchCreated = await createGithubBranch(installationToken, body.owner, body.repo, plan.branchName, baseSha.sha);
    if (!branchCreated.ok) {
      return json(res, branchCreated.status === 422 ? 409 : 400, githubPermissionError(branchCreated, 'Could not create executor branch'));
    }
    const existing = await fetchGithubTextFile(installationToken, body.owner, body.repo, plan.filePath, repoMeta.default_branch);
    if (existing.ok && existing.text && !existing.text.includes(GITHUB_EXECUTOR_MARKER) && !existing.text.includes(GITHUB_ADAPTER_MARKER)) {
      return json(res, 409, {
        error: `Refusing to overwrite existing non-AIagent2 file at ${plan.filePath}.`,
        path: plan.filePath,
        branch: plan.branchName
      });
    }
    const write = await upsertGithubTextFile(installationToken, body.owner, body.repo, {
      path: plan.filePath,
      branch: plan.branchName,
      content: plan.fileContent,
      sha: existing.ok ? existing.sha : '',
      message: existing.ok ? `Update ${PRODUCT_SHORT_NAME} executor handoff: ${plan.filePath}` : `Add ${PRODUCT_SHORT_NAME} executor handoff: ${plan.filePath}`
    });
    if (!write.ok) {
      return json(res, write.status === 422 ? 409 : 400, githubPermissionError(write, `Could not write ${plan.filePath}`));
    }
    const pull = await createGithubPullRequest(installationToken, body.owner, body.repo, {
      title: plan.prTitle,
      body: plan.prBody,
      head: plan.branchName,
      base: repoMeta.default_branch
    });
    if (!pull.ok) {
      return json(res, pull.status === 422 ? 409 : 400, githubPermissionError(pull, 'Could not create executor pull request'));
    }
    await touchEvent('UPDATED', `Executor PR created for ${repoMeta.full_name}: ${pull.pullRequest.htmlUrl}`, {
      repo: repoMeta.full_name,
      branch: plan.branchName,
      pr: pull.pullRequest.htmlUrl,
      kind: plan.kind
    });
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 201, {
      ok: true,
      auth_provider: 'github-app',
      access_mode: current.apiKeyStatus === 'valid' ? 'account-stored-installation' : 'installation-selected',
      repo: { fullName: repoMeta.full_name, private: repoMeta.private },
      installation_id: selectedRepo.installationId,
      executor_kind: plan.kind,
      branch: plan.branchName,
      base_branch: repoMeta.default_branch,
      files: [{ path: plan.filePath, commit_sha: write.commitSha }],
      pull_request: pull.pullRequest,
      next_step: 'Review the PR handoff file in GitHub, then continue implementation in the repository workflow.'
    });
  } catch (error) {
    return json(res, 500, githubPermissionError(error));
  }
}
function githubAppRecommendedSettings(req) {
  const root = baseUrl(req);
  return {
    name: githubAppSetup().name,
    homepage_url: root,
    callback_url: `${root}/auth/github-app/callback`,
    registration_url: githubAppRegistrationUrl(req),
    request_oauth_on_install: true,
    webhook_active: false,
    permissions: githubAppSetup().permissions,
    events: githubAppSetup().events,
    notes: [
      'Install only on the repositories you want CAIt to import from.',
      'Keep the app private unless you intentionally want multi-tenant distribution.',
      'Use GitHub App credentials instead of broad OAuth repo scopes.',
      'Adapter PR creation requires Contents and Pull requests permissions to be set to read and write.',
      'Because request_oauth_on_install is enabled, GitHub will send installs back to the callback URL after authorization.'
    ]
  };
}
async function handleGithubCreateAdapterPr(req, res) {
  const state = await storage.getState();
  const current = currentAgentRequesterContext(state, req);
  if (!current.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
  if (!current.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
  if (!sessionHasGithubApp(current.session) && current.apiKeyStatus !== 'valid') {
    return json(res, 403, {
      error: 'GitHub App login required to create adapter PRs.',
      use: '/auth/github'
    });
  }
  const body = await parseBody(req).catch(err => ({ __error: err.message }));
  if (body.__error) return json(res, 400, { error: body.__error });
  if (!body.owner || !body.repo) return json(res, 400, { error: 'owner and repo required' });
  if (current.apiKeyStatus === 'valid' && body.confirm_adapter_pr !== true && body.confirm_repo_write !== true) {
    return json(res, 409, {
      error: 'Repository write confirmation required for CAIT_API_KEY adapter PR creation.',
      required: 'Set confirm_adapter_pr=true after showing the target repository, branch, files, and PR action to the user.',
      repo: `${body.owner}/${body.repo}`,
      use: '/?tab=agents'
    });
  }
  try {
    const repoAccess = await githubAppRepoTokenForRequester(current, body.owner, body.repo, body.installation_id || '');
    if (repoAccess.error) return json(res, repoAccess.statusCode || 403, { error: repoAccess.error, use: repoAccess.use, next_step: repoAccess.next_step });
    const { selectedRepo, installationToken } = repoAccess;
    const repoMetaResult = await fetchGithubRepoMeta(body.owner, body.repo, installationToken);
    if (!repoMetaResult.ok) return json(res, repoMetaResult.status === 404 ? 404 : 400, { error: repoMetaResult.error });
    const repoMeta = repoMetaResult.repo;
    const treeLoad = await fetchGithubRepoTree(installationToken, body.owner, body.repo, repoMeta.default_branch);
    const signalLoad = await loadGithubManifestDraftSignals(
      installationToken,
      body.owner,
      body.repo,
      repoMeta.default_branch,
      treeLoad.ok ? treeLoad.paths : []
    );
    const planFiles = { ...(signalLoad.files || {}) };
    const brokerPath = treeLoad.ok ? findKnownBrokerPath(treeLoad.paths) : '';
    if (brokerPath && !planFiles[brokerPath]) {
      const brokerFile = await fetchGithubTextFile(installationToken, body.owner, body.repo, brokerPath, repoMeta.default_branch);
      if (brokerFile.ok && brokerFile.text) planFiles[brokerPath] = brokerFile.text;
    }
    const plan = buildGithubAdapterPlan({
      repoMeta,
      files: planFiles,
      repoTreePaths: treeLoad.ok ? treeLoad.paths : [],
      ownerLogin: current.githubIdentity?.login || current.user?.login || current.login || ''
    });
    if (!plan.supported) {
      return json(res, 422, {
        error: plan.reason,
        runtime_hints: plan.runtimeHints,
        draft_manifest: plan.draftManifest,
        warnings: plan.analysis?.warnings || [],
        supported_frameworks: ['nextjs', 'cloudflare_worker_adapter', 'hono', 'express', 'fastapi']
      });
    }

    const baseSha = await fetchGithubBranchSha(installationToken, body.owner, body.repo, repoMeta.default_branch);
    if (!baseSha.ok || !baseSha.sha) {
      return json(res, 400, { error: baseSha.error || `Could not resolve ${repoMeta.default_branch}` });
    }
    const branchCreated = await createGithubBranch(installationToken, body.owner, body.repo, plan.branchName, baseSha.sha);
    if (!branchCreated.ok) {
      return json(res, branchCreated.status === 422 ? 409 : 400, githubPermissionError(branchCreated, 'Could not create adapter branch'));
    }

    const committedFiles = [];
    for (const file of plan.filesToWrite) {
      const existing = await fetchGithubTextFile(installationToken, body.owner, body.repo, file.path, repoMeta.default_branch);
      if (existing.ok && existing.text && !existing.text.includes(GITHUB_ADAPTER_MARKER)) {
        return json(res, 409, {
          error: `Refusing to overwrite existing non-AIagent2 file at ${file.path}.`,
          path: file.path,
          branch: plan.branchName
        });
      }
      const write = await upsertGithubTextFile(installationToken, body.owner, body.repo, {
        path: file.path,
        branch: plan.branchName,
        content: file.content,
        sha: existing.ok ? existing.sha : '',
        message: existing.ok ? `Update AIagent2 hosted adapter: ${file.path}` : `Add AIagent2 hosted adapter: ${file.path}`
      });
      if (!write.ok) {
        return json(res, write.status === 422 ? 409 : 400, githubPermissionError(write, `Could not write ${file.path}`));
      }
      committedFiles.push({ path: file.path, commit_sha: write.commitSha });
    }

    const pull = await createGithubPullRequest(installationToken, body.owner, body.repo, {
      title: plan.prTitle,
      body: plan.prBody,
      head: plan.branchName,
      base: repoMeta.default_branch
    });
    if (!pull.ok) {
      return json(res, pull.status === 422 ? 409 : 400, githubPermissionError(pull, 'Could not create pull request'));
    }

    await touchEvent('REGISTERED', `Adapter PR created for ${repoMeta.full_name}: ${pull.pullRequest.htmlUrl}`, {
      repo: repoMeta.full_name,
      branch: plan.branchName,
      pr: pull.pullRequest.htmlUrl
    });
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);

    return json(res, 201, {
      ok: true,
      auth_provider: 'github-app',
      access_mode: current.apiKeyStatus === 'valid' ? 'account-stored-installation' : 'installation-selected',
      repo: { fullName: repoMeta.full_name, private: repoMeta.private },
      installation_id: selectedRepo.installationId,
      framework: plan.framework,
      runtime_hints: plan.runtimeHints,
      branch: plan.branchName,
      base_branch: repoMeta.default_branch,
      files: committedFiles,
      pull_request: pull.pullRequest,
      required_env: plan.requiredEnv,
      optional_env: plan.optionalEnv || [],
      draft_manifest: plan.draftManifest,
      deployment_base_url: plan.deploymentBaseUrl || null,
      suggested_manifest_url: plan.suggestedManifestUrl || null,
      suggested_healthcheck_url: plan.suggestedHealthUrl || null,
      suggested_job_url: plan.suggestedJobUrl || null,
      manifest_route: plan.routes.manifestPath,
      health_route: plan.routes.healthPath,
      job_route: plan.routes.jobPath,
      signal_attempts: signalLoad.attempts,
      tree_truncated: Boolean(treeLoad.truncated),
      tree_warning: treeLoad.ok ? null : treeLoad.error,
      next_step: adapterNextStepText(plan)
    });
  } catch (error) {
    return json(res, 500, githubPermissionError(error));
  }
}
function serveStatic(res, path) {
  const file = join(process.cwd(), 'public', path === '/' ? 'index.html' : path.slice(1));
  if (!existsSync(file)) return false;
  const noCache = new Set([
    '/index.html',
    '/login.html',
    '/styles.css',
    '/client.js',
    '/login.js',
    '/analytics-loader.js',
    '/delivery-action-contract.js',
    '/work-action-registry.js',
    '/work-intent-resolver.js'
  ]);
  const normalizedPath = path === '/' ? '/index.html' : path;
  res.writeHead(200, securityHeaders({
    'Content-Type': mime[extname(file)] || 'text/plain; charset=utf-8',
    ...(noCache.has(normalizedPath) ? { 'Cache-Control': 'no-cache, max-age=0, must-revalidate' } : {})
  }));
  res.end(readFileSync(file));
  return true;
}
function broadcast(event) {
  const packet = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) res.write(packet);
}
async function touchEvent(type, message, meta = {}) {
  const event = makeEvent(type, message, meta);
  if (typeof storage.appendEvent === 'function') {
    await storage.appendEvent(event);
  } else {
    await storage.mutate(async (state) => {
      state.events.push(event);
      if (state.events.length > 2000) state.events = state.events.slice(-2000);
    });
  }
  broadcast(event);
  return event;
}

function authAnalyticsProviderName(authProvider = 'guest') {
  const value = String(authProvider || '').trim().toLowerCase();
  if (value.includes('email')) return 'email';
  if (value.includes('google')) return 'google';
  if (value.includes('github')) return 'github';
  return '';
}

async function trackAuthConversionEvent(eventName, context = {}, meta = {}) {
  const payload = createConversionEventPayload({
    event: eventName,
    meta
  }, {
    loggedIn: Boolean(context?.loggedIn),
    authProvider: context?.authProvider || 'guest',
    login: context?.login || ''
  });
  if (payload?.error) return null;
  return touchEvent('TRACK', payload.message, payload.meta);
}

async function trackAuthLoginCompletion(authProvider, account = null, meta = {}) {
  const provider = authAnalyticsProviderName(authProvider);
  if (!provider) return null;
  return trackAuthConversionEvent(`${provider}_login_completed`, {
    loggedIn: true,
    authProvider,
    login: account?.login || ''
  }, meta);
}

async function trackAuthLoginFailure(authProvider, meta = {}) {
  const provider = authAnalyticsProviderName(authProvider);
  if (!provider) return null;
  return trackAuthConversionEvent(`${provider}_login_failed`, {
    loggedIn: false,
    authProvider,
    login: meta?.login || ''
  }, meta);
}
async function appendEmailDelivery(delivery) {
  if (typeof storage.appendEmailDelivery === 'function') {
    await storage.appendEmailDelivery(delivery);
    return delivery;
  }
  await storage.mutate(async (state) => {
    if (!Array.isArray(state.emailDeliveries)) state.emailDeliveries = [];
    state.emailDeliveries.unshift(delivery);
    if (state.emailDeliveries.length > 1000) state.emailDeliveries = state.emailDeliveries.slice(0, 1000);
  });
  return delivery;
}
async function appendBillingAudit(job, billing, meta = {}) {
  if (!job || !billing) return null;
  const funding = meta.funding || billing?.funding || job?.billingSettlement || null;
  const audit = {
    id: randomUUID(),
    kind: 'billing_audit',
    ts: nowIso(),
    jobId: job.id,
    agentId: job.assignedAgentId || meta.agentId || null,
    status: job.status,
    policyVersion: billing.policyVersion || 'billing-policy/v3-provider-markup-platform-margin',
    source: meta.source || 'unknown',
    billable: {
      totalCostBasis: billing.totalCostBasis,
      apiCost: billing.apiCost,
      costBasis: billing.costBasis,
      rates: billing.rates
    },
    settlement: {
      creatorFee: billing.creatorFee,
      marketplaceFee: billing.marketplaceFee,
      baseFee: billing.baseFee,
      premiumFee: billing.premiumFee,
      platformFee: billing.platformFee,
      agentPayout: billing.agentPayout,
      platformRevenue: billing.platformRevenue,
      total: billing.total
    }
  };
  if (funding) {
    audit.funding = {
      mode: funding.mode || null,
      welcomeCreditsApplied: funding.welcomeCreditsApplied || 0,
      creditsApplied: funding.creditsApplied || 0,
      depositApplied: funding.depositApplied || 0,
      invoiceApplied: funding.invoiceApplied || 0,
      autoTopupAdded: funding.autoTopupAdded || 0,
      settledAt: funding.settledAt || null
    };
  }
  await touchEvent('BILLING_AUDIT', `audit ${job.id.slice(0, 6)} total=${billing.total}`, audit);
  return audit;
}

function billingModeForRequester(current, account = null) {
  if (canViewAdminDashboard(current)) return 'test';
  const profile = billingProfileForAccount(account, current?.apiKey?.mode || '', billingPeriodId());
  return profile.mode || 'deposit';
}

function billingApiKeyModeForRequester(current) {
  return canViewAdminDashboard(current) ? 'test' : (current?.apiKey?.mode || '');
}

function billingLogLine(job, billing) {
  return isBillableJob(job)
    ? `billed total=${billing.total}`
    : `test mode total=${billing.total} (excluded from monthly settlement)`;
}

function settleAgentEarnings(job, agent, billing) {
  if (!job || !agent || !billing || !isBillableJob(job)) return false;
  agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
  return true;
}

async function recordBillingOutcome(job, billing, source) {
  if (!job || !billing) return;
  let settlement = null;
  await storage.mutate(async (draft) => {
    const draftJob = draft.jobs.find((item) => item.id === job.id);
    if (!draftJob) return;
    settlement = settleBillingForJobInState(draft, draftJob, billing);
  });
  if (settlement) {
    job.billingSettlement = settlement;
    job.actualBilling = {
      ...(job.actualBilling && typeof job.actualBilling === 'object' ? job.actualBilling : {}),
      ...(billing && typeof billing === 'object' ? billing : {}),
      funding: settlement
    };
  }
  if (isBillableJob(job)) {
    await touchEvent('BILLED', `api=${billing.apiCost} total=${billing.total}`);
    await appendBillingAudit(job, job.actualBilling || billing, { source, funding: settlement });
    return;
  }
  await touchEvent('BILLED_TEST', `test mode api=${billing.apiCost} total=${billing.total}`, {
    jobId: job.id,
    source,
    billingMode: billingModeFromJob(job)
  });
}

function providerMarkupRateFromInput(body = {}) {
  return Number(
    body.provider_markup_rate
    ?? body.providerMarkupRate
    ?? body.token_markup_rate
    ?? body.tokenMarkupRate
    ?? body.creator_fee_rate
    ?? body.creatorFeeRate
    ?? body.premium_rate
    ?? body.premiumRate
    ?? 0.1
  );
}

function pricingModelFromInput(body = {}) {
  const raw = String(body.pricing_model ?? body.pricingModel ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!raw) return 'usage_based';
  if (['usage', 'usage_pricing', 'metered'].includes(raw)) return 'usage_based';
  if (['fixed', 'fixed_run', 'per_run', 'fixed_price'].includes(raw)) return 'fixed_per_run';
  if (['subscription', 'monthly', 'monthly_subscription'].includes(raw)) return 'subscription_required';
  if (['subscription_plus_usage', 'subscription_plus_overage', 'hybrid_subscription'].includes(raw)) return 'hybrid';
  return ['usage_based', 'fixed_per_run', 'subscription_required', 'hybrid'].includes(raw) ? raw : 'usage_based';
}

function nonNegativeUsdFromInput(...values) {
  for (const value of values) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount >= 0) return +amount.toFixed(2);
  }
  return 0;
}

function overageModeFromInput(body = {}) {
  const raw = String(body.overage_mode ?? body.overageMode ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!raw) return pricingModelFromInput(body) === 'hybrid' ? 'usage_based' : 'included';
  if (['included', 'none', 'plan_included'].includes(raw)) return 'included';
  if (['usage', 'usage_pricing', 'metered'].includes(raw)) return 'usage_based';
  if (['fixed', 'fixed_run', 'per_run', 'fixed_price'].includes(raw)) return 'fixed_per_run';
  return ['included', 'usage_based', 'fixed_per_run'].includes(raw) ? raw : 'included';
}
function platformMarginRateFromInput(_body = {}) {
  return 0.1;
}
function creatorFeeRateFromInput(body = {}) {
  return providerMarkupRateFromInput(body);
}
function marketplaceFeeRateFromInput(body = {}) {
  return platformMarginRateFromInput(body);
}
function isBuiltInAgent(agent = {}) {
  return Boolean(
    agent?.metadata?.builtIn
    || agent?.manifestSource === 'built-in'
    || String(agent?.manifestUrl || '').startsWith('built-in://')
    || agent?.owner === 'aiagent2'
  );
}
function agentManifestKind(agent = {}) {
  const manifest = agent?.metadata?.manifest && typeof agent.metadata.manifest === 'object' ? agent.metadata.manifest : {};
  const raw = String(manifest.kind || agent?.metadata?.kind || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['group', 'agent_group', 'suite', 'agent_suite', 'agent_bundle', 'agent_pack'].includes(raw)) return 'agent_group';
  if (['composite', 'composite_agent', 'composite_agent_product', 'multi_agent', 'multi_agent_product'].includes(raw)) return 'composite_agent';
  return 'agent';
}

function isAgentGroupRecord(agent = {}) {
  return agentManifestKind(agent) === 'agent_group';
}

function pickAgent(agents, taskType, budgetCap, requestedAgentId = '', options = {}) {
  const excluded = new Set(Array.isArray(options.excludeAgentIds) ? options.excludeAgentIds : []);
  const requireEndpoint = options.requireEndpoint === true;
  const verified = agents.filter(a => a.online && isAgentVerified(a) && !isAgentGroupRecord(a) && !excluded.has(a.id) && (!requireEndpoint || resolveAgentJobEndpoint(a)));
  const scoreAgent = (agent) => +(computeScore(agent, taskType, budgetCap) + agentPatternFitScore(agent, {
    body: options.body || {},
    scheduled: options.scheduled === true,
    recurring: options.recurring === true
  })).toFixed(3);
  if (requestedAgentId) {
    const requested = verified.find(a => a.id === requestedAgentId);
    if (!requested) return { error: 'Requested agent is unavailable or not verified' };
    if (!requested.taskTypes.includes(taskType)) return { error: 'Requested agent does not support this task type' };
    return { agent: requested, score: scoreAgent(requested), selectionMode: 'manual' };
  }
  const ranked = verified
    .filter(a => a.taskTypes.includes(taskType))
    .map(agent => ({
      agent,
      score: scoreAgent(agent),
      selectionMode: 'auto',
      readyForAuto: Boolean(resolveAgentJobEndpoint(agent))
    }))
    .sort((a, b) => (
      (Number(b.readyForAuto) - Number(a.readyForAuto))
      || (b.score - a.score)
      || (Number(isBuiltInAgent(a.agent)) - Number(isBuiltInAgent(b.agent)))
      || String(a.agent.name || a.agent.id || '').localeCompare(String(b.agent.name || b.agent.id || ''))
    ));
  return ranked[0] || null;
}
function normalizeOrderStrategy(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'single') return 'single';
  if (normalized === 'multi' || normalized === 'multi_agent' || normalized === 'goal') return 'multi';
  return 'auto';
}
function planWorkflowSelections(agents, taskType, prompt, budgetCap, options = {}) {
  const largeTeam = isLargeAgentTeamIntent(taskType, prompt);
  const plannedTasks = inferTaskSequence(taskType, prompt, {
    maxTasks: largeTeam ? 9 : 3,
    expand: options.expand !== false
  });
  const selections = [];
  const usedAgentIds = new Set();
  for (const plannedTask of plannedTasks) {
    const picked = pickAgent(agents, plannedTask, budgetCap, '', {
      excludeAgentIds: [...usedAgentIds],
      requireEndpoint: true,
      body: { prompt, task_type: plannedTask },
      scheduled: options.scheduled === true,
      recurring: options.recurring === true
    });
    if (!picked?.agent) continue;
    usedAgentIds.add(picked.agent.id);
    selections.push({
      taskType: plannedTask,
      agent: picked.agent,
      score: picked.score,
      selectionMode: picked.selectionMode
    });
  }
  return { plannedTasks, selections };
}
const AUTO_WORKFLOW_SUPPORT_TASKS = new Set(['research', 'summary', 'debug', 'automation']);
function isAutoWorkflowSpecialtyTask(taskType = '') {
  const task = String(taskType || '').trim().toLowerCase();
  return Boolean(task && !AUTO_WORKFLOW_SUPPORT_TASKS.has(task));
}
function resolveOrderStrategy(agents, body = {}, taskType = '', strategy = 'auto') {
  const resolvedTaskType = inferTaskType(taskType, body.prompt);
  const repoBackedCodeIntent = ['code', 'debug', 'ops', 'automation'].includes(String(resolvedTaskType || '').trim().toLowerCase())
    && /(github|git hub|repo|repository|pull request|\bpr\b|branch|commit|diff|issue|bug|debug|fix|修正|直して|デバッグ|リポジトリ|プルリク|ブランチ|コミット|差分)/i.test(String(body.prompt || ''));
  if (strategy === 'single') {
    return { strategy: 'single', reason: 'Single-agent routing was selected.' };
  }
  if (strategy === 'multi') {
    const plan = planWorkflowSelections(agents, taskType, body.prompt, body.budget_cap || 0);
    return {
      strategy: 'multi',
      plan,
      reason: 'Multi-agent routing was explicitly selected.'
    };
  }
  if (String(body.agent_id || '').trim()) {
    return { strategy: 'single', reason: 'A target agent was pinned, so the order stays single-agent.' };
  }
  if (repoBackedCodeIntent) {
    const plan = planWorkflowSelections(agents, taskType, body.prompt, body.budget_cap || 0, { expand: false });
    return {
      strategy: 'single',
      plan,
      reason: 'CAIt kept repo-backed coding as single-agent unless multi-agent routing is explicitly selected.'
    };
  }
  const plan = planWorkflowSelections(agents, taskType, body.prompt, body.budget_cap || 0, { expand: false });
  const plannedSpecialties = new Set(plan.plannedTasks.filter(isAutoWorkflowSpecialtyTask));
  const selectedSpecialties = new Set(plan.selections
    .filter((selection) => isAutoWorkflowSpecialtyTask(selection.taskType))
    .map((selection) => selection.taskType));
  if (plannedSpecialties.size >= 2 && selectedSpecialties.size >= 2 && plan.selections.length >= 2) {
    return {
      strategy: 'multi',
      plan,
      reason: isFreeWebGrowthIntent(taskType, body.prompt)
        ? `CAIt detected a Free Web Growth Team plan: ${[...selectedSpecialties].join(', ')}.`
        : isAgentTeamLaunchIntent(taskType, body.prompt)
        ? `CAIt detected an Agent Team launch plan: ${[...selectedSpecialties].join(', ')}.`
        : `CAIt detected multiple specialties: ${[...selectedSpecialties].join(', ')}.`
    };
  }
  return {
    strategy: 'single',
    plan,
    reason: 'CAIt kept this as single-agent because the request did not require multiple ready specialties.'
  };
}
function buildWorkflowEstimate(selections = []) {
  const summary = selections.reduce((acc, item) => {
    const estimate = estimateRunWindow(item.agent, item.taskType);
    acc.durationMinSec += Number(estimate.durationMinSec || 0);
    acc.durationMaxSec += Number(estimate.durationMaxSec || 0);
    acc.totalMin += Number(estimate.estimateMin?.total || 0);
    acc.totalMax += Number(estimate.estimateMax?.total || 0);
    return acc;
  }, { durationMinSec: 0, durationMaxSec: 0, totalMin: 0, totalMax: 0 });
  return {
    durationMinSec: summary.durationMinSec,
    durationMaxSec: summary.durationMaxSec,
    totalMin: +summary.totalMin.toFixed(1),
    totalMax: +summary.totalMax.toFixed(1)
  };
}
function buildWorkflowParentJob(body, input, plan, taskType, options = {}) {
  const estimate = buildWorkflowEstimate(plan.selections);
  const promptOptimization = options.promptOptimization || null;
  const executionPrompt = promptOptimization?.optimized ? promptOptimization.prompt : body.prompt;
  const originalPrompt = promptOptimization?.optimized ? promptOptimization.originalPrompt : body.prompt;
  const agentTeamName = plan.plannedTasks.includes('cmo_leader')
    ? 'CMO Growth Team'
    : 'Agent Team';
  return {
    id: randomUUID(),
    jobKind: 'workflow',
    parentAgentId: body.parent_agent_id,
    taskType: plan.plannedTasks[0] || taskType,
    prompt: executionPrompt,
    ...(promptOptimization?.optimized ? { originalPrompt, promptOptimization } : {}),
    input,
    budgetCap: body.budget_cap || null,
    deadlineSec: body.deadline_sec || null,
    priority: body.priority || 'normal',
    status: 'queued',
    assignedAgentId: null,
    score: null,
    createdAt: nowIso(),
    callbackToken: null,
    selectionMode: 'multi',
    billingEstimate: {
      total: estimate.totalMax,
      totalMin: estimate.totalMin,
      totalMax: estimate.totalMax
    },
    estimateWindow: estimate,
    workflow: {
      strategy: 'multi_agent',
      teamName: agentTeamName,
      objective: originalPrompt,
      plannedTasks: plan.plannedTasks,
      childJobIds: [],
      childRuns: plan.selections.map((item) => ({
        taskType: item.taskType,
        agentId: item.agent.id,
        agentName: item.agent.name,
        status: 'planned',
        score: item.score
      }))
    },
    logs: [
      `created by ${body.parent_agent_id}`,
      ...(promptOptimization?.optimized ? [`prompt optimized mode=${promptOptimization.mode} originalChars=${promptOptimization.originalChars} optimizedChars=${promptOptimization.optimizedChars} outputLanguage=${promptOptimization.outputLanguageCode}`] : []),
      `${agentTeamName} planned for ${plan.plannedTasks.join(', ')}`,
      `planned agents=${plan.selections.map((item) => `${item.agent.name}:${item.taskType}`).join(', ')}`
    ]
  };
}

function workflowTaskName(job = {}) {
  return String(job.workflowTask || job.taskType || '').trim().toLowerCase();
}

function workflowChildPlanIndex(parent = {}, child = {}) {
  const task = workflowTaskName(child);
  const plannedTasks = Array.isArray(parent.workflow?.plannedTasks)
    ? parent.workflow.plannedTasks.map((item) => String(item || '').trim().toLowerCase())
    : [];
  const taskIndex = plannedTasks.indexOf(task);
  if (taskIndex >= 0) return taskIndex;
  const plannedRuns = Array.isArray(parent.workflow?.childRuns) ? parent.workflow.childRuns : [];
  const runIndex = plannedRuns.findIndex((run) => {
    const runTask = String(run?.taskType || run?.task_type || '').trim().toLowerCase();
    const runAgentId = String(run?.agentId || run?.agent_id || '').trim();
    return runTask === task && (!runAgentId || runAgentId === child.assignedAgentId);
  });
  return runIndex >= 0 ? runIndex : Number.MAX_SAFE_INTEGER;
}

function sortWorkflowChildren(parent = {}, children = []) {
  return [...children].sort((a, b) => {
    const leftIndex = workflowChildPlanIndex(parent, a);
    const rightIndex = workflowChildPlanIndex(parent, b);
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    const created = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    if (created) return created;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function workflowChildSnapshot(children = []) {
  return children.map((job) => ({
    id: job.id,
    taskType: job.workflowTask || job.taskType,
    agentId: job.assignedAgentId || null,
    agentName: job.workflowAgentName || null,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt || null,
    failedAt: job.failedAt || null,
    failureReason: job.failureReason || null
  }));
}
async function reconcileWorkflowParent(parentJobId) {
  if (!parentJobId) return null;
  return storage.mutate(async (state) => {
    const parent = state.jobs.find((item) => item.id === parentJobId);
    if (!parent || parent.jobKind !== 'workflow') return null;
    const children = sortWorkflowChildren(
      parent,
      state.jobs.filter((item) => item.workflowParentId === parentJobId)
    );
    const expectedTotal = Math.max(
      children.length,
      Array.isArray(parent.workflow?.childRuns) ? parent.workflow.childRuns.length : 0
    );
    const terminal = new Set(['completed', 'failed', 'timed_out']);
    const active = new Set(['queued', 'claimed', 'running', 'dispatched']);
    const childRuns = workflowChildSnapshot(children);
    const completed = children.filter((item) => item.status === 'completed');
    const failed = children.filter((item) => item.status === 'failed' || item.status === 'timed_out');
    const queued = children.filter((item) => item.status === 'queued');
    const running = children.filter((item) => item.status === 'claimed' || item.status === 'running' || item.status === 'dispatched');
    parent.workflow = {
      ...(parent.workflow || {}),
      childJobIds: children.map((item) => item.id),
      childRuns,
      statusCounts: {
        total: expectedTotal,
        completed: completed.length,
        failed: failed.length,
        queued: queued.length,
        running: running.length
      }
    };
    parent.output = buildAgentTeamDeliveryOutput(parent, children);
    if (!children.length) {
      parent.status = 'failed';
      parent.completedAt = null;
      parent.failedAt = nowIso();
      parent.failureReason = 'No agent runs created for Agent Team objective';
      return cloneJob(parent);
    }
    if (children.length < expectedTotal) {
      parent.status = children.some((item) => active.has(item.status)) ? 'running' : 'queued';
      parent.completedAt = null;
      parent.failedAt = null;
      parent.failureReason = null;
      return cloneJob(parent);
    }
    if (children.every((item) => item.status === 'completed')) {
      parent.status = 'completed';
      parent.completedAt = completed.map((item) => item.completedAt).filter(Boolean).sort().at(-1) || nowIso();
      parent.failedAt = null;
      parent.failureReason = null;
      return cloneJob(parent);
    }
    if (children.some((item) => active.has(item.status))) {
      parent.status = running.length ? 'running' : 'queued';
      parent.completedAt = null;
      parent.failedAt = null;
      parent.failureReason = null;
      return cloneJob(parent);
    }
    if (children.every((item) => terminal.has(item.status))) {
      parent.status = 'failed';
      parent.completedAt = null;
      parent.failedAt = failed.map((item) => item.failedAt || item.timedOutAt || item.completedAt).filter(Boolean).sort().at(-1) || nowIso();
      parent.failureReason = `${failed.length} agent runs failed in Agent Team objective`;
      return cloneJob(parent);
    }
    parent.status = 'queued';
    return cloneJob(parent);
  });
}
function statsOf(state) {
  const completed = state.jobs.filter(j => j.actualBilling);
  const grossVolume = completed.reduce((n, j) => n + (j.actualBilling?.total || 0), 0);
  const api = completed.reduce((n, j) => n + (j.actualBilling?.apiCost || 0), 0);
  const rev = completed.reduce((n, j) => n + (j.actualBilling?.platformRevenue || 0), 0);
  const retryableRuns = state.jobs.filter(j => j.dispatch?.retryable === true).length;
  const timedOutRuns = state.jobs.filter(j => j.status === 'timed_out').length;
  const terminalRuns = state.jobs.filter(j => ['completed', 'failed', 'timed_out'].includes(j.status)).length;
  const nextRetryAt = state.jobs
    .map(j => j.dispatch?.nextRetryAt || null)
    .filter(Boolean)
    .sort()[0] || null;
  return {
    activeJobs: state.jobs.filter(j => ['queued', 'claimed', 'running', 'dispatched'].includes(j.status)).length,
    onlineAgents: state.agents.filter(a => a.online).length,
    grossVolume: +grossVolume.toFixed(1),
    todayCost: +api.toFixed(1),
    platformRevenue: +rev.toFixed(1),
    failedJobs: state.jobs.filter(j => j.status === 'failed').length,
    retryableRuns,
    timedOutRuns,
    terminalRuns,
    nextRetryAt,
    totalJobs: state.jobs.length
  };
}
function publicAgent(agent) {
  const metadata = agent?.metadata && typeof agent.metadata === 'object' ? agent.metadata : {};
  if (
    metadata.hidden_from_catalog
    || metadata.not_routable
    || metadata.deleted_at
    || metadata.deletedAt
    || String(agent?.verificationStatus || '').toLowerCase() === 'deprecated'
  ) return null;
  const { token, ...rest } = agent;
  const cloned = structuredClone(rest);
  if (cloned.metadata?.manifest) cloned.metadata.manifest = sanitizeManifestForPublic(cloned.metadata.manifest);
  return cloned;
}
function cloneJob(job) {
  return job ? structuredClone(job) : null;
}
function createAgentFromInput(body = {}) {
  const taskTypes = normalizeTaskTypes(body.task_types || body.taskTypes || 'summary');
  const verificationStatus = body.verification_status || body.verificationStatus || 'legacy_unverified';
  const verificationCheckedAt = body.verification_checked_at || body.verificationCheckedAt || null;
  const verificationError = body.verification_error || body.verificationError || null;
  const verificationDetails = body.verification_details || body.verificationDetails || null;
  const agentReviewStatus = body.agent_review_status || body.agentReviewStatus || 'pending';
  const agentReview = body.agent_review || body.agentReview || null;
  return {
    id: buildAgentId(body.name || 'agent'),
    name: String(body.name || 'custom_agent').toUpperCase(),
    description: body.description || 'Custom registered agent.',
    taskTypes: taskTypes.length ? taskTypes : ['summary'],
    providerMarkupRate: providerMarkupRateFromInput(body),
    pricingModel: pricingModelFromInput(body),
    fixedRunPriceUsd: nonNegativeUsdFromInput(body.fixed_run_price_usd, body.fixedRunPriceUsd, body.run_price_usd, body.runPriceUsd),
    subscriptionMonthlyPriceUsd: nonNegativeUsdFromInput(body.subscription_monthly_price_usd, body.subscriptionMonthlyPriceUsd, body.monthly_price_usd, body.monthlyPriceUsd),
    overageMode: overageModeFromInput(body),
    overageFixedRunPriceUsd: nonNegativeUsdFromInput(body.overage_fixed_run_price_usd, body.overageFixedRunPriceUsd),
    tokenMarkupRate: providerMarkupRateFromInput(body),
    platformMarginRate: platformMarginRateFromInput(body),
    creatorFeeRate: providerMarkupRateFromInput(body),
    marketplaceFeeRate: platformMarginRateFromInput(body),
    premiumRate: providerMarkupRateFromInput(body),
    basicRate: platformMarginRateFromInput(body),
    successRate: Number(body.success_rate ?? body.successRate ?? 0.9),
    avgLatencySec: Number(body.avg_latency_sec ?? body.avgLatencySec ?? 20),
    online: true,
    token: `secret_${randomUUID().slice(0, 8)}`,
    earnings: 0,
    owner: body.owner || 'samurai',
    manifestUrl: body.manifest_url || body.manifestUrl || null,
    manifestSource: body.manifest_source || body.manifestSource || null,
    metadata: body.metadata || {},
    verificationStatus,
    verificationCheckedAt,
    verificationError,
    verificationDetails,
    agentReviewStatus,
    agentReview,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}
function createAgentFromManifest(manifest, ownerInfo = { owner: 'samurai', metadata: {} }, options = {}) {
  return createAgentFromInput({
    name: manifest.name,
    description: manifest.description || `Imported from manifest ${options.manifestUrl || ''}`.trim(),
    task_types: manifest.taskTypes,
    provider_markup_rate: manifest.providerMarkupRate,
    pricing_model: manifest.pricingModel,
    fixed_run_price_usd: manifest.fixedRunPriceUsd,
    subscription_monthly_price_usd: manifest.subscriptionMonthlyPriceUsd,
    overage_mode: manifest.overageMode,
    overage_fixed_run_price_usd: manifest.overageFixedRunPriceUsd,
    token_markup_rate: manifest.tokenMarkupRate,
    platform_margin_rate: manifest.platformMarginRate,
    creator_fee_rate: manifest.creatorFeeRate,
    marketplace_fee_rate: manifest.marketplaceFeeRate,
    success_rate: manifest.successRate,
    avg_latency_sec: manifest.avgLatencySec,
    owner: manifest.owner || ownerInfo.owner,
    manifest_url: options.manifestUrl || manifest.sourceUrl || null,
    manifest_source: options.manifestSource || 'manifest',
    verification_status: options.verificationStatus || 'manifest_loaded',
    metadata: {
      ...ownerInfo.metadata,
      ...(manifest.metadata || {}),
      agentRole: manifest.agentRole || 'worker',
      importMode: options.importMode || 'manifest',
      manifest: {
        ...manifest.raw,
        schema_version: manifest.schemaVersion,
        kind: manifest.kind,
        agent_role: manifest.agentRole || 'worker',
        task_types: manifest.taskTypes,
        execution_pattern: manifest.executionPattern,
        input_types: manifest.inputTypes,
        output_types: manifest.outputTypes,
        clarification: manifest.clarification,
        schedule_support: manifest.scheduleSupport,
        required_connectors: manifest.requiredConnectors,
        risk_level: manifest.riskLevel,
        confirmation_required_for: manifest.confirmationRequiredFor,
        capabilities: manifest.capabilities,
        healthcheckUrl: manifest.healthcheckUrl || '',
        jobEndpoint: manifest.jobEndpoint || manifest.raw?.jobEndpoint || manifest.raw?.job_endpoint || manifest.raw?.endpoints?.jobs || manifest.raw?.metadata?.job_endpoint || manifest.raw?.metadata?.jobEndpoint || '',
        verification: manifest.verification || {},
        composition: manifest.composition || {},
        requirements: manifest.requirements || manifest.raw?.requirements || manifest.raw?.required_context || manifest.raw?.requiredContext || [],
        usage_contract: manifest.usageContract || manifest.raw?.usage_contract || manifest.raw?.usageContract || {},
        sourceUrl: options.manifestUrl || manifest.sourceUrl || null,
        endpoints: manifest.raw?.endpoints && typeof manifest.raw.endpoints === 'object' ? manifest.raw.endpoints : {},
        pricing: {
          provider_markup_rate: manifest.providerMarkupRate,
          token_markup_rate: manifest.tokenMarkupRate,
          platform_margin_rate: manifest.platformMarginRate,
          creator_fee_rate: manifest.creatorFeeRate,
          marketplace_fee_rate: manifest.marketplaceFeeRate
        }
      }
    }
  });
}

function applyVerificationToAgentRecord(agent, verification) {
  agent.verificationStatus = verification.status;
  agent.verificationCheckedAt = verification.checkedAt;
  agent.verificationError = verification.ok ? null : verification.reason;
  agent.verificationDetails = {
    category: verification.category || (verification.ok ? 'verified' : 'unknown'),
    code: verification.code || (verification.ok ? 'verified' : 'verification_failed'),
    reason: verification.reason || null,
    healthcheckUrl: verification.healthcheckUrl || null,
    challengeUrl: verification.challengeUrl || verification.details?.challengeUrl || null,
    details: verification.details || null
  };
  agent.updatedAt = nowIso();
}

async function maybeAutoVerifyImportedAgent(agent, rewardLogin = '') {
  const manifest = agent?.metadata?.manifest || {};
  const explicitHealthcheckUrl = String(manifest.healthcheckUrl || manifest.healthcheck_url || '').trim();
  if (!explicitHealthcheckUrl) return { attempted: false, agent, verification: null, welcome_credits: null };
  if (!isBuiltInSampleAgent(agent) && !isAgentReviewApproved(agent)) {
    return {
      attempted: false,
      agent: publicAgent(agent),
      verification: {
        ok: false,
        status: 'review_pending',
        checkedAt: nowIso(),
        code: 'agent_review_not_approved',
        category: 'agent_review',
        reason: agentReviewRouteBlockReason(agent)
      },
      welcome_credits: null
    };
  }
  const verification = await verifyAgentByHealthcheck(agent);
  const updated = await storage.mutate(async (state) => {
    const current = state.agents.find((item) => item.id === agent.id);
    if (!current) return null;
    applyVerificationToAgentRecord(current, verification);
    const welcomeCredits = verification.ok && rewardLogin
      ? maybeGrantWelcomeCreditsForVerifiedAgentInState(state, rewardLogin, current.id)
      : null;
    return { agent: publicAgent(current), welcomeCredits };
  });
  if (verification.ok) {
    await touchEvent('VERIFIED', `${agent.name} auto verification succeeded after import`);
    if (updated?.welcomeCredits?.status === 'granted') {
      await touchEvent('CREDIT', `${rewardLogin} earned ${WELCOME_CREDITS_GRANT_AMOUNT} welcome credits for ${agent.name}`);
    } else if (updated?.welcomeCredits?.status === 'rejected') {
      await touchEvent('CREDIT', `${agent.name} welcome credits rejected: ${updated.welcomeCredits.reason}`);
    }
  } else {
    await touchEvent('FAILED', `${agent.name} auto verification failed after import: ${verification.reason}`);
  }
  return { attempted: true, agent: updated?.agent || agent, verification, welcome_credits: updated?.welcomeCredits || null };
}
function normalizeUsageForBilling(rawUsage, fallbackApiCost = 100) {
  if (rawUsage && typeof rawUsage === 'object') {
    return {
      ...rawUsage,
      api_cost: rawUsage.api_cost ?? rawUsage.apiCost,
      total_cost_basis: rawUsage.total_cost_basis ?? rawUsage.totalCostBasis,
      cost_basis: rawUsage.cost_basis ?? rawUsage.costBasis
    };
  }
  return { api_cost: Number(fallbackApiCost || 100) };
}
function approxTokenCount(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return Math.max(0, Math.ceil(String(text || '').length / 4));
}
function usageWithObservedJobTokens(job, usage = {}, report = null) {
  const normalized = normalizeUsageForBilling(usage, 100);
  const observedInputTokens = approxTokenCount({ prompt: job?.prompt || '', input: job?.input || {} });
  const observedOutputTokens = approxTokenCount(report || {});
  const inputTokens = Number(normalized.input_tokens ?? normalized.inputTokens ?? 0) || observedInputTokens;
  const outputTokens = Number(normalized.output_tokens ?? normalized.outputTokens ?? 0) || observedOutputTokens;
  return {
    ...normalized,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: Number(normalized.total_tokens ?? normalized.totalTokens ?? 0) || (inputTokens + outputTokens),
    observed_input_tokens: observedInputTokens,
    observed_output_tokens: observedOutputTokens
  };
}
function isAgentVerified(agent) {
  if (isBuiltInSampleAgent(agent)) return true;
  return agent?.verificationStatus === 'verified' && isAgentReviewApproved(agent);
}
function resolveAgentJobEndpoint(agent) {
  const manifest = agent?.metadata?.manifest || {};
  const rootMetadata = agent?.metadata && typeof agent.metadata === 'object' ? agent.metadata : {};
  const manifestMetadata = manifest.metadata && typeof manifest.metadata === 'object' ? manifest.metadata : {};
  const endpoints = manifest.endpoints && typeof manifest.endpoints === 'object' ? manifest.endpoints : {};
  const metadataEndpoints = rootMetadata.endpoints && typeof rootMetadata.endpoints === 'object' ? rootMetadata.endpoints : {};
  const candidates = [
    manifest.jobEndpoint,
    manifest.job_endpoint,
    manifest.jobsUrl,
    manifest.jobs_url,
    manifestMetadata.job_endpoint,
    manifestMetadata.jobEndpoint,
    endpoints.jobs,
    endpoints.job,
    endpoints.dispatch,
    endpoints.submit,
    rootMetadata.job_endpoint,
    rootMetadata.jobEndpoint,
    metadataEndpoints.jobs,
    metadataEndpoints.job,
    metadataEndpoints.dispatch,
    metadataEndpoints.submit
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
}
function buildDispatchPayload(job, agent) {
  return {
    job_id: job.id,
    task_type: job.taskType,
    prompt: job.prompt,
    input: job.input || {},
    parent_agent_id: job.parentAgentId,
    assigned_agent_id: agent.id,
    budget_cap: job.budgetCap,
    deadline_sec: job.deadlineSec,
    priority: job.priority,
    created_at: job.createdAt,
    callback_url: agent?.metadata?.brokerCallbackUrl || null,
    callback_token: job.callbackToken || null,
    return_targets: ['api']
  };
}
function callbackTokenForJob(job) {
  return sign(`callback:${job.id}:${job.assignedAgentId || 'unassigned'}`);
}
function extractCallbackToken(req, body = {}) {
  const auth = String(req.headers.authorization || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const headerToken = String(req.headers['x-callback-token'] || '').trim();
  if (headerToken) return headerToken;
  return String(body.callback_token || '').trim();
}
const JOB_TRANSITIONS = {
  claim: ['queued', 'dispatched', 'running', 'claimed'],
  callback: ['claimed', 'running', 'dispatched'],
  manualResult: ['queued', 'claimed', 'running', 'dispatched'],
  retry: ['failed', 'timed_out', 'dispatched', 'queued'],
  timeout: ['queued', 'claimed', 'running', 'dispatched'],
  complete: ['queued', 'claimed', 'running', 'dispatched'],
  fail: ['queued', 'claimed', 'running', 'dispatched']
};
function normalizeJobStatus(status) {
  return String(status || '').trim().toLowerCase();
}
function isTerminalJobStatus(status) {
  return ['completed', 'failed', 'timed_out'].includes(normalizeJobStatus(status));
}
function canTransitionJob(job, action) {
  const status = normalizeJobStatus(job?.status);
  const allowed = JOB_TRANSITIONS[action] || [];
  return allowed.includes(status);
}
function transitionErrorCode(job, action) {
  if (isTerminalJobStatus(job?.status)) return 'job_already_terminal';
  if (action === 'callback') return 'invalid_callback_transition';
  return 'invalid_job_transition';
}
function canCallbackMutateJob(job) {
  return canTransitionJob(job, 'callback');
}

function providerAuthorityRequestFromPayload(payload = {}) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const request = body.authority_request
    || body.authorityRequest
    || body.action_required
    || body.actionRequired
    || body.executor_request
    || body.executorRequest
    || (Array.isArray(body.authority_requests) ? body.authority_requests[0] : null)
    || (Array.isArray(body.authorityRequests) ? body.authorityRequests[0] : null)
    || null;
  return request && typeof request === 'object' ? request : null;
}

function normalizeAgentReportPayload(payload = {}, reportCandidate = null) {
  const report = reportCandidate && typeof reportCandidate === 'object'
    ? { ...reportCandidate }
    : { summary: String(reportCandidate || payload?.summary || 'No report provided.') };
  const authorityRequest = providerAuthorityRequestFromPayload(payload);
  if (
    authorityRequest
    && !report.authority_request
    && !report.authorityRequest
    && !report.action_required
    && !report.actionRequired
    && !report.executor_request
    && !report.executorRequest
  ) {
    report.authority_request = authorityRequest;
  }
  return report;
}

function normalizeDispatchResponse(responseBody = {}) {
  const body = responseBody && typeof responseBody === 'object' ? responseBody : {};
  const status = String(body.status || '').trim().toLowerCase();
  const accepted = body.accepted === true || status === 'accepted' || status === 'queued' || status === 'running' || status === 'dispatched';
  const completed = status === 'completed' || Boolean(body.report || body.output || body.summary || (Array.isArray(body.files) && body.files.length));
  return {
    accepted,
    completed,
    status: completed ? 'completed' : (status || (accepted ? 'accepted' : 'unknown')),
    report: normalizeAgentReportPayload(body, body.report || body.output || { summary: body.summary || 'No report provided.' }),
    files: Array.isArray(body.files) ? body.files : [],
    returnTargets: body.return_targets || body.returnTargets || ['api'],
    usage: normalizeUsageForBilling(body.usage, 100),
    externalJobId: body.external_job_id || body.remote_job_id || body.job_id || null,
    raw: body
  };
}
function normalizeCallbackPayload(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const status = String(payload.status || (payload.failure_reason || payload.error ? 'failed' : 'completed')).trim().toLowerCase();
  const normalizedStatus = status === 'failed' ? 'failed' : 'completed';
  return {
    status: normalizedStatus,
    report: normalizeAgentReportPayload(
      payload,
      payload.report || payload.output || { summary: payload.summary || (normalizedStatus === 'failed' ? 'Agent reported failure' : 'No report provided.') }
    ),
    files: Array.isArray(payload.files) ? payload.files : [],
    usage: normalizeUsageForBilling(payload.usage, 100),
    returnTargets: payload.return_targets || payload.returnTargets || ['chat', 'api', 'webhook'],
    externalJobId: payload.external_job_id || payload.remote_job_id || null,
    failureReason: payload.failure_reason || payload.error || null,
    raw: payload
  };
}
function classifyDispatchFailure(statusCode, errorMessage = '') {
  const msg = String(errorMessage || '').toLowerCase();
  if (msg.includes('timed out') || msg.includes('timeout')) return { category: 'dispatch_timeout', retryable: true };
  if (statusCode >= 500) return { category: 'dispatch_http_5xx', retryable: true };
  if (statusCode >= 400) return { category: 'dispatch_http_4xx', retryable: false };
  if (msg.includes('malformed') || msg.includes('json')) return { category: 'dispatch_malformed_response', retryable: false };
  if (msg.includes('endpoint')) return { category: 'dispatch_misconfigured_endpoint', retryable: false };
  return { category: 'dispatch_error', retryable: true };
}
function computeNextRetryAt(attempts, baseTime = Date.now()) {
  const retryDelaySec = Math.min(300, Math.max(5, 5 * (2 ** Math.max(0, attempts - 1))));
  return new Date(baseTime + retryDelaySec * 1000).toISOString();
}
function maxDispatchRetriesForJob(job) {
  const explicit = Number(job?.dispatch?.maxRetries);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return 3;
}
function canRetryDispatch(job) {
  const attempts = Number(job?.dispatch?.attempts || 0);
  return attempts < maxDispatchRetriesForJob(job);
}
function buildDispatchFailureMeta(job, statusCode, errorMessage = '') {
  const classified = classifyDispatchFailure(statusCode, errorMessage);
  const attempts = Number(job?.dispatch?.attempts || 0) + 1;
  const retryable = classified.retryable && canRetryDispatch({ ...job, dispatch: { ...(job?.dispatch || {}), attempts } });
  return {
    category: classified.category,
    retryable,
    attempts,
    nextRetryAt: retryable ? computeNextRetryAt(attempts) : null
  };
}
async function failJob(jobId, reason, extraLogs = [], options = {}) {
  const result = await storage.mutate(async (draft) => {
    const job = draft.jobs.find(j => j.id === jobId);
    if (!job) return null;
    if (isTerminalJobStatus(job.status)) return { ...cloneJob(job), workflowParentId: job.workflowParentId || null };
    const failureStatus = options.failureStatus || (job.status === 'dispatched' ? 'timed_out' : 'failed');
    const failedAt = nowIso();
    job.status = failureStatus;
    if (failureStatus === 'timed_out') job.timedOutAt = failedAt;
    job.failedAt = failedAt;
    job.lastCallbackAt = options.source === 'callback' ? failedAt : (job.lastCallbackAt || null);
    job.failureReason = reason;
    job.failureCategory = options.failureCategory || job.failureCategory || 'agent_failed';
    if (job.billingReservation && !job.billingSettlement?.settledAt && !job.billingReservation?.releasedAt) {
      releaseBillingReservationInState(draft, job);
    }
    job.dispatch = {
      ...(job.dispatch || {}),
      externalJobId: options.externalJobId || job.dispatch?.externalJobId || null,
      completionSource: options.source || job.dispatch?.completionSource || null,
      completionStatus: failureStatus,
      failedAt,
      lastCallbackAt: options.source === 'callback' ? failedAt : (job.dispatch?.lastCallbackAt || null),
      retryable: options.retryable ?? job.dispatch?.retryable ?? false,
      nextRetryAt: options.nextRetryAt ?? job.dispatch?.nextRetryAt ?? null,
      attempts: options.attempts ?? job.dispatch?.attempts ?? 0
    };
    for (const line of extraLogs) job.logs.push(line);
    job.logs.push(reason);
    return { ...cloneJob(job), workflowParentId: job.workflowParentId || null };
  });
  if (result?.workflowParentId) await reconcileWorkflowParent(result.workflowParentId);
  if (!result) return null;
  const { workflowParentId, ...job } = result;
  return job;
}
async function completeJobFromAgentResult(jobId, agentId, payload = {}, meta = {}) {
  const result = await storage.mutate(async (state) => {
    const job = state.jobs.find(j => j.id === jobId);
    if (!job) return { error: 'Job not found', statusCode: 404 };
    if (isTerminalJobStatus(job.status)) {
      return {
        error: `Job is already terminal (${job.status})`,
        statusCode: 409,
        code: 'job_already_terminal',
        job
      };
    }
    if (meta.source === 'callback' && !canTransitionJob(job, 'callback')) {
      return {
        error: `Job status ${job.status} cannot be changed by callback`,
        statusCode: 409,
        code: transitionErrorCode(job, 'callback'),
        job
      };
    }
    if (meta.source === 'manual-result' && !canTransitionJob(job, 'manualResult')) {
      return {
        error: `Job status ${job.status} cannot be changed by manual result`,
        statusCode: 409,
        code: transitionErrorCode(job, 'manualResult'),
        job
      };
    }
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return { error: 'Agent not found', statusCode: 404 };
    if (!isAgentVerified(agent)) return { error: 'Agent is not verified', statusCode: 403 };
    if (job.assignedAgentId && job.assignedAgentId !== agent.id) return { error: 'Invalid assignment', statusCode: 401 };
    const outputReport = normalizeAgentReportPayload(
      payload,
      payload.report || payload.output || { summary: payload.summary || 'No report provided.' }
    );
    const usage = usageWithObservedJobTokens(job, payload?.usage, outputReport);
    const billing = estimateBilling(agent, usage);
    const completionAt = nowIso();
    job.assignedAgentId = agent.id;
    job.startedAt = job.startedAt || completionAt;
    job.lastCallbackAt = meta.source === 'callback' ? completionAt : (job.lastCallbackAt || null);
    job.status = 'completed';
    job.output = {
      report: outputReport,
      files: Array.isArray(payload.files) ? payload.files : [],
      returnTargets: payload.return_targets || payload.returnTargets || ['chat', 'api', 'webhook']
    };
    job.completedAt = completionAt;
    job.usage = usage;
    job.actualBilling = billing;
    job.deliveryQuality = {
      score: deliveryQualityScoreForJob(job),
      version: 'delivery-quality/v1',
      checkedAt: completionAt
    };
    job.dispatch = {
      ...(job.dispatch || {}),
      externalJobId: meta.externalJobId || job.dispatch?.externalJobId || null,
      completionSource: meta.source || job.dispatch?.completionSource || null,
      completionStatus: 'completed',
      completedAt: completionAt,
      lastCallbackAt: meta.source === 'callback' ? completionAt : (job.dispatch?.lastCallbackAt || null)
    };
    job.logs.push(`completed by ${agent.id}`, billingLogLine(job, billing), `delivery quality score=${job.deliveryQuality.score}`);
    if (meta.source) job.logs.push(`completion source=${meta.source}`);
    if (meta.externalJobId) job.logs.push(`external_job_id=${meta.externalJobId}`);
    settleAgentEarnings(job, agent, billing);
    return { ok: true, job, billing, agent, workflowParentId: job.workflowParentId || null };
  });
  if (result?.ok && result.workflowParentId) await reconcileWorkflowParent(result.workflowParentId);
  return result;
}
function billingAuditEvents(events = []) {
  return events
    .filter(event => event.type === 'BILLING_AUDIT' && event.meta?.kind === 'billing_audit')
    .map(event => ({ id: event.id, ...event.meta, message: event.message }));
}
function buildDispatchHeaders(agent) {
  const manifestAuth = agent?.metadata?.manifest?.auth;
  if (!manifestAuth || typeof manifestAuth !== 'object') return {};
  const type = String(manifestAuth.type || 'none').trim().toLowerCase();
  const token = String(manifestAuth.token || '').trim();
  if (!token || type === 'none') return {};
  if (type === 'bearer') {
    const prefix = String(manifestAuth.prefix || 'Bearer').trim() || 'Bearer';
    return { authorization: `${prefix} ${token}` };
  }
  if (type === 'header') {
    const headerName = String(manifestAuth.headerName || manifestAuth.header_name || '').trim();
    if (!headerName) return {};
    const prefix = String(manifestAuth.prefix || '').trim();
    return { [headerName]: prefix ? `${prefix} ${token}` : token };
  }
  return {};
}
async function postJsonWithTimeout(url, payload, timeoutMs = 10000, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = delay(timeoutMs, null, { signal: controller.signal }).then(() => controller.abort()).catch(() => {});
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...extraHeaders },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`Dispatch response was not valid JSON (${response.status})`);
      }
    }
    return { response, body };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Dispatch timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    controller.abort();
    await timer;
  }
}
async function dispatchJobToAssignedAgent(job, agent) {
  const endpoint = resolveAgentJobEndpoint(agent);
  if (!endpoint) {
    return { ok: false, failureReason: 'Assigned verified agent does not expose a job endpoint in manifest metadata' };
  }
  const payload = buildDispatchPayload(job, agent);
  const sampleKind = sampleKindFromAgent(agent);
  if (sampleKind) {
    const body = await runBuiltInAgent(sampleKind, payload, process.env);
    const normalized = normalizeDispatchResponse(body);
    normalized.usage = usageWithObservedJobTokens(job, normalized.usage, normalized.report);
    return { ok: true, endpoint, normalized, statusCode: 200, responseBody: body };
  }
  const dispatchHeaders = buildDispatchHeaders(agent);
  const { response, body } = await postJsonWithTimeout(endpoint, payload, 10000, dispatchHeaders);
  if (!response.ok) {
    const reason = body?.error || body?.message || `Dispatch failed with status ${response.status}`;
    return { ok: false, endpoint, failureReason: reason, statusCode: response.status, responseBody: body };
  }
  const normalized = normalizeDispatchResponse(body);
  normalized.usage = usageWithObservedJobTokens(job, normalized.usage, normalized.report);
  if (!normalized.accepted && !normalized.completed) {
    return { ok: false, endpoint, failureReason: 'Dispatch response was malformed or did not acknowledge the job', statusCode: response.status, responseBody: body };
  }
  return { ok: true, endpoint, normalized, statusCode: response.status, responseBody: body };
}
function makeGithubRawManifestUrl(owner, repo, branch, candidatePath) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${candidatePath}`;
}
async function fetchGithubManifestCandidate(sessionToken, owner, repo, branch, candidatePath) {
  const encodedPath = String(candidatePath).split('/').map(part => encodeURIComponent(part)).join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: githubHeaders(sessionToken) });
  if (response.status === 404) return { ok: false, status: 404, candidatePath };
  if (!response.ok) return { ok: false, status: response.status, candidatePath, error: `GitHub API returned ${response.status}` };
  const payload = await response.json().catch(() => ({}));
  const decoded = payload?.content ? Buffer.from(String(payload.content).replace(/\n/g, ''), 'base64').toString('utf8') : '';
  if (!decoded) return { ok: false, status: 422, candidatePath, error: 'Manifest candidate file is empty' };
  return {
    ok: true,
    candidatePath,
    manifestUrl: makeGithubRawManifestUrl(owner, repo, branch, candidatePath),
    contentType: payload?.type || ''
      ? (candidatePath.endsWith('.json') ? 'application/json' : candidatePath.endsWith('.yaml') ? 'application/yaml' : '')
      : '',
    text: decoded
  };
}
function validateManifestUrlInput(manifestUrl) {
  let parsed;
  try {
    parsed = new URL(String(manifestUrl || ''));
  } catch {
    throw new Error('manifest_url must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('manifest_url must use http or https');
  const allowLocal = process.env.ALLOW_LOCAL_MANIFEST_URLS === '1';
  if (isPrivateNetworkHostname(parsed.hostname) && !allowLocal) throw new Error('Private or local manifest URLs are disabled unless ALLOW_LOCAL_MANIFEST_URLS=1');
  return parsed.toString();
}
async function loadManifestFromUrl(manifestUrl) {
  const safeManifestUrl = validateManifestUrlInput(manifestUrl);
  const response = await fetch(safeManifestUrl, { headers: { accept: 'application/json, application/yaml;q=0.9, text/plain;q=0.8' } });
  if (!response.ok) throw new Error(`Manifest fetch failed (${response.status})`);
  const text = await response.text();
  return parseAndValidateManifest(text, { contentType: response.headers.get('content-type') || '', sourceUrl: safeManifestUrl });
}
async function migrateLegacyAgents() {
  await storage.mutate(async (state) => {
    for (const agent of state.agents) {
      if (!agent.verificationStatus) {
        agent.verificationStatus = 'legacy_unverified';
        agent.verificationCheckedAt = null;
        agent.verificationError = 'Legacy agent requires manifest verification';
        agent.verificationDetails = {
          category: 'legacy_agent',
          code: 'legacy_requires_manifest',
          reason: 'Legacy agent requires manifest verification'
        };
        agent.updatedAt = nowIso();
      }
    }
  });
}
function boolFlag(raw, fallback = false) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}
function hostLooksLocal(host = '') {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(String(host || '').trim());
}
function agentSafetyOptionsForRequest(req) {
  return {
    allowLocalEndpoints: boolFlag(process.env.ALLOW_LOCAL_MANIFEST_URLS, hostLooksLocal(req.headers.host || ''))
  };
}
function agentSafetyErrorResponse(res, safety) {
  return json(res, 400, {
    error: safety?.summary || 'Agent registration blocked by safety review',
    code: 'agent_safety_blocked',
    safety
  });
}
async function runAgentReviewForRequest(agent, req, options = {}) {
  return runAgentAutoReview(agent, {
    env: process.env,
    fetchImpl: fetch,
    safetyOptions: agentSafetyOptionsForRequest(req),
    source: options.source || 'agent-registration',
    safety: options.safety || null
  });
}
function runtimePolicy(req) {
  const isLocal = hostLooksLocal(req.headers.host || '');
  const openWriteApiEnabled = boolFlag(process.env.ALLOW_OPEN_WRITE_API, isLocal);
  const guestRunReadEnabled = boolFlag(process.env.ALLOW_GUEST_RUN_READ_API, openWriteApiEnabled);
  const devApiEnabled = boolFlag(process.env.ALLOW_DEV_API, isLocal);
  const exposeJobSecrets = boolFlag(process.env.EXPOSE_JOB_SECRETS, openWriteApiEnabled || devApiEnabled);
  const configuredStage = String(process.env.RELEASE_STAGE || '').trim();
  return {
    releaseStage: configuredStage || ((openWriteApiEnabled || devApiEnabled) ? 'development' : 'public'),
    openWriteApiEnabled,
    guestRunReadEnabled,
    devApiEnabled,
    exposeJobSecrets
  };
}
function normalizedLoginList(raw = '') {
  return [...new Set(String(raw || '')
    .split(',')
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean))];
}
function feedbackReviewerLogins() {
  return normalizedLoginList(process.env.FEEDBACK_REVIEWER_LOGINS || process.env.ADMIN_LOGINS || '');
}
function agentReviewerLogins() {
  return normalizedLoginList(process.env.AGENT_REVIEWER_LOGINS || process.env.FEEDBACK_REVIEWER_LOGINS || process.env.ADMIN_LOGINS || '');
}
function platformAdminLogins() {
  return normalizedLoginList(process.env.ADMIN_DASHBOARD_LOGINS || 'yasuikunihiro@gmail.com');
}
function identityLoginsForCurrent(current = null) {
  const linkedIdentities = Array.isArray(current?.account?.linkedIdentities) ? current.account.linkedIdentities : [];
  return [...new Set([
    current?.login,
    current?.user?.login,
    current?.user?.email,
    current?.githubIdentity?.login,
    current?.githubIdentity?.email,
    current?.googleIdentity?.login,
    current?.googleIdentity?.email,
    ...linkedIdentities.flatMap((identity) => [identity?.login, identity?.email]),
    ...aliasLoginsForAccount(current?.account || null)
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
}
function requesterOwnsJobForCurrent(job, current = null) {
  const identityLogins = identityLoginsForCurrent(current);
  if (!identityLogins.length) return false;
  const requester = (((job || {}).input || {})._broker || {}).requester || {};
  const requesterLogin = String(requester.login || '').trim().toLowerCase();
  if (requesterLogin && identityLogins.includes(requesterLogin)) return true;
  const requesterAccountId = String(requester.accountId || '').trim().toLowerCase();
  if (requesterAccountId && identityLogins.some((login) => requesterAccountId === `acct:${login}`)) return true;
  return false;
}
function canViewAdminDashboard(current) {
  if (!current?.user) return false;
  const admins = platformAdminLogins();
  return identityLoginsForCurrent(current).some((login) => admins.includes(login));
}
function canUsePlatformResend(current) {
  const admins = platformAdminLogins();
  return identityLoginsForCurrent(current).some((login) => admins.includes(login));
}
function canReviewFeedbackReports(current, req = null) {
  if (!current?.login) return false;
  const reviewers = feedbackReviewerLogins();
  if (canViewAdminDashboard(current)) return true;
  if (!reviewers.length) {
    return req ? runtimePolicy(req).releaseStage !== 'public' : false;
  }
  return reviewers.includes(String(current.login).toLowerCase());
}
function canReviewAgents(current, req = null) {
  if (!current?.login) return false;
  const reviewers = agentReviewerLogins();
  if (canViewAdminDashboard(current)) return true;
  if (!reviewers.length) {
    return req ? runtimePolicy(req).releaseStage !== 'public' : false;
  }
  return reviewers.includes(String(current.login).toLowerCase());
}
function canUseProductionDebugRoute(current, req = null) {
  const policy = runtimePolicy(req);
  return policy.devApiEnabled || policy.releaseStage !== 'public' || canReviewFeedbackReports(current, req);
}
function canUseBuiltInMockJobRoute(req = null) {
  const policy = runtimePolicy(req);
  return policy.devApiEnabled || policy.releaseStage !== 'public';
}

async function fetchGithubRepoTextFile(sessionToken, owner, repo, branch, filePath) {
  const encodedPath = String(filePath).split('/').map(part => encodeURIComponent(part)).join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: githubHeaders(sessionToken) });
  if (response.status === 404) return { ok: false, status: 404, path: filePath };
  if (!response.ok) return { ok: false, status: response.status, path: filePath, error: `GitHub API returned ${response.status}` };
  const payload = await response.json().catch(() => ({}));
  const decoded = payload?.content ? Buffer.from(String(payload.content).replace(/\n/g, ''), 'base64').toString('utf8') : '';
  if (!decoded) return { ok: false, status: 422, path: filePath, error: 'Repository file is empty' };
  return {
    ok: true,
    path: filePath,
    text: decoded,
    htmlUrl: payload?.html_url || `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`
  };
}

async function loadGithubManifestDraftSignals(sessionToken, owner, repo, branch, repoTreePaths = []) {
  const files = {};
  const attempts = [];
  for (const filePath of deriveManifestSignalPaths(repoTreePaths)) {
    const loaded = await fetchGithubRepoTextFile(sessionToken, owner, repo, branch, filePath);
    attempts.push({ path: filePath, status: loaded.ok ? 200 : loaded.status, error: loaded.error || null });
    if (loaded.ok) files[filePath] = loaded.text;
  }
  return { files, attempts };
}
function secretEquals(left = '', right = '') {
  const a = secretEncoder.encode(String(left || ''));
  const b = secretEncoder.encode(String(right || ''));
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}
function extractAgentToken(req) {
  const headerToken = String(req.headers['x-agent-token'] || '').trim();
  if (headerToken) return headerToken;
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) return authHeader.slice(7).trim();
  return '';
}
function authStatus(req) {
  const session = getSession(req);
  const policy = runtimePolicy(req);
  const current = session?.user?.login || session?.accountLogin
    ? currentUserContext(req)
    : { session: null, user: null, login: '', authProvider: 'guest' };
  const loggedIn = Boolean(current?.user);
  const githubLinked = Boolean(current?.githubLinked);
  const googleLinked = Boolean(current?.googleLinked);
  const xLinked = Boolean(current?.xLinked);
  const githubAuthorized = Boolean(current?.githubAuthorized);
  const googleAuthorized = Boolean(current?.googleAuthorized);
  const xAuthorized = Boolean(current?.xAuthorized);
  const identityLogins = identityLoginsForCurrent(current);
  return {
    loggedIn,
    authProvider: current?.authProvider || 'guest',
    emailConfigured: resendConfigured(),
    githubConfigured: Boolean(githubClientId && githubClientSecret),
    googleConfigured: googleConfigured(),
    xConfigured: xOAuthConfigured(process.env),
    xTokenEncryptionConfigured: xTokenEncryptionConfigured(process.env),
    githubAppConfigured: githubAppConfigured(),
    githubRequestedScope: githubOAuthScope(),
    xRequestedScope: xOAuthScopeLabel(),
    githubGrantedScopes: githubGrantedScopes(session),
    privateRepoImportEnabled: githubPrivateRepoImportEnabled(),
    githubAppInstallations: githubAppInstallationsFromSession(session).length,
    githubAppRepoCount: githubAppReposFromSession(session).length,
    githubLinked,
    googleLinked,
    xLinked,
    githubAuthorized,
    googleAuthorized,
    xAuthorized,
    linkedProviders: [
      ...new Set([
        ...(Array.isArray(session?.linkedProviders)
          ? session.linkedProviders
          : [
              ...(googleLinked ? ['google-oauth'] : []),
              ...(sessionHasGithubOauth(session) ? ['github-oauth'] : []),
              ...(sessionHasGithubApp(session) ? ['github-app'] : [])
            ]),
        ...(xLinked ? ['x-oauth'] : [])
      ])
    ],
    canOrder: loggedIn,
    canManagePayments: loggedIn,
    canRegisterAgents: githubLinked,
    canUseGithubAgentFlow: githubAuthorized,
    canManagePayouts: githubLinked,
    releaseStage: policy.releaseStage,
    openWriteApiEnabled: policy.openWriteApiEnabled,
    guestRunReadEnabled: policy.guestRunReadEnabled,
    devApiEnabled: policy.devApiEnabled,
    exposeJobSecrets: policy.exposeJobSecrets,
    isPlatformAdmin: canViewAdminDashboard(current),
    canReviewFeedbackReports: canReviewFeedbackReports(current, req),
    canReviewAgents: canReviewAgents(current, req),
    csrfToken: loggedIn ? csrfTokenForRequest(req, session) : '',
    user: current?.user || null,
    login: current?.login || '',
    accountLogin: current?.login || '',
    githubIdentity: current?.githubIdentity || null,
    googleIdentity: current?.googleIdentity || null,
    identityLogins
  };
}
function currentUserContext(req) {
  const session = getSession(req);
  if (!session?.user?.login && !session?.accountLogin) return { session: null, user: null, login: '', authProvider: 'guest', account: null, githubIdentity: null, googleIdentity: null };
  const state = storage.getState();
  const account = session.accountLogin
    ? accountSettingsForLogin(state, session.accountLogin)
    : sessionHasGithubOauth(session)
      ? accountSettingsForIdentity(state, session.githubIdentity, 'github-oauth')
      : sessionHasGoogleOauth(session)
        ? accountSettingsForIdentity(state, session.googleIdentity, 'google-oauth')
        : accountSettingsForIdentity(state, session.user, sessionAuthProvider(session));
  const githubAuthorized = Boolean(sessionHasGithubOauth(session) || sessionHasGithubApp(session) || accountHasGithubConnector(account));
  const googleAuthorized = Boolean(sessionHasGoogleOauth(session) || accountHasGoogleConnector(account));
  const githubIdentity = accountIdentityForProvider(account, 'github') || session?.githubIdentity || null;
  const googleIdentity = accountIdentityForProvider(account, 'google') || session?.googleIdentity || null;
  const githubLinked = Boolean(githubAuthorized || githubIdentity);
  const googleLinked = Boolean(googleAuthorized || googleIdentity);
  const xLinked = accountHasXConnector(account);
  return {
    session,
    user: accountUserFromSettings(account) || session.user,
    login: account?.login || session.accountLogin || session.user?.login || '',
    authProvider: sessionAuthProvider(session),
    account,
    githubIdentity,
    googleIdentity,
    githubLinked,
    googleLinked,
    xLinked,
    githubAuthorized,
    googleAuthorized,
    xAuthorized: xLinked
  };
}
function accountUserFromSettings(account) {
  if (!account?.login) return null;
  return {
    login: account.login,
    name: account?.profile?.displayName || account.login,
    avatarUrl: account?.profile?.avatarUrl || '',
    profileUrl: account?.profile?.profileUrl || '',
    email: account?.billing?.billingEmail || account?.payout?.payoutEmail || '',
    accountId: account?.id || ''
  };
}

async function claimSignupConversionAttempt(account, user = null, authProvider = 'guest') {
  const safeLogin = String(account?.login || '').trim().toLowerCase();
  if (!safeLogin) return { claimed: false, account: account || null };
  const attemptedAt = nowIso();
  let nextAccount = account || null;
  let claimed = false;
  const seedUser = user ? { ...user, login: safeLogin } : { login: safeLogin };
  await storage.mutate(async (draft) => {
    const latest = accountSettingsForLogin(draft, safeLogin, seedUser, authProvider);
    if (String(latest?.billing?.signupWelcomeEmailAttemptedAt || '').trim()) {
      nextAccount = latest;
      return;
    }
    nextAccount = upsertAccountSettingsInState(draft, safeLogin, seedUser, authProvider, {
      billing: {
        ...(latest?.billing || {}),
        signupWelcomeEmailAttemptedAt: attemptedAt
      }
    });
    claimed = true;
  });
  return { claimed, account: nextAccount };
}

async function persistAccountForIdentity(user, authProvider) {
  let account = null;
  let signupCredits = null;
  await storage.mutate(async (draft) => {
    account = upsertAccountSettingsForIdentityInState(draft, user, authProvider, {});
    signupCredits = maybeGrantWelcomeCreditsForSignupInState(draft, account.login, user, authProvider, 0);
    account = accountSettingsForLogin(draft, account.login, user, authProvider);
  });
  const signupClaim = await claimSignupConversionAttempt(account, user, authProvider);
  if (signupClaim?.account) account = signupClaim.account;
  const accountCreated = Boolean(signupClaim?.claimed);
  if (signupCredits?.status === 'granted') {
    await touchEvent('CREDIT', `${account.login} earned ${signupCredits.amount} signup welcome credits`);
  }
  if (accountCreated) {
    await trackAuthConversionEvent('signup_completed', {
      loggedIn: true,
      authProvider,
      login: account?.login || ''
    }, {
      source: 'auth_callback',
      status: 'created'
    });
  }
  await trackAuthLoginCompletion(authProvider, account, {
    source: 'auth_callback',
    status: accountCreated ? 'created' : 'existing'
  });
  return account;
}
async function linkSessionIdentityToAccount(targetLogin, user, authProvider) {
  let result = null;
  let signupCredits = null;
  await storage.mutate(async (draft) => {
    result = linkIdentityToAccountInState(draft, targetLogin, user, authProvider);
    if (result?.ok) {
      signupCredits = maybeGrantWelcomeCreditsForSignupInState(draft, result.account.login, { ...(user || {}), login: result.account.login }, authProvider, 0);
      result.account = accountSettingsForLogin(draft, result.account.login, user, authProvider);
      return;
    }
    if (result?.reason !== 'identity_already_linked' || !result?.linkedAccount?.login) return;
    const merged = mergeAccountsInState(draft, result.linkedAccount.login, targetLogin);
    result = {
      ok: true,
      merged: true,
      sourceLogin: merged.sourceLogin,
      targetLogin: merged.targetLogin,
      account: upsertAccountSettingsForIdentityInState(draft, { ...(user || {}), login: targetLogin }, authProvider, {})
    };
    if (result?.account?.login) {
      signupCredits = maybeGrantWelcomeCreditsForSignupInState(draft, result.account.login, { ...(user || {}), login: result.account.login }, authProvider, 0);
      result.account = accountSettingsForLogin(draft, result.account.login, user, authProvider);
    }
  });
  if (signupCredits?.status === 'granted') {
    await touchEvent('CREDIT', `${result.account.login} earned ${signupCredits.amount} signup welcome credits`);
  }
  return result;
}
function extractOrderApiKey(req) {
  const headerToken = String(req.headers['x-api-key'] || '').trim();
  if (headerToken) return headerToken;
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) return authHeader.slice(7).trim();
  return '';
}
function resolveOrderApiKeyContext(state, req) {
  const token = extractOrderApiKey(req);
  if (!token) return { session: null, user: null, login: '', authProvider: 'guest', apiKeyStatus: 'missing', apiKey: null };
  const matched = authenticateOrderApiKey(state, token);
  if (!matched) return { session: null, user: null, login: '', authProvider: 'guest', apiKeyStatus: 'invalid', apiKey: null };
  return {
    session: null,
    user: accountUserFromSettings(matched.account),
    login: matched.account.login,
    authProvider: 'api-key',
    account: matched.account,
    apiKeyStatus: 'valid',
    apiKey: matched.apiKey,
    apiKeyKind: 'cait'
  };
}
function currentOrderRequesterContext(state, req) {
  const current = currentUserContext(req);
  if (current?.user) return { ...current, apiKeyStatus: 'session', apiKey: null };
  return resolveOrderApiKeyContext(state, req);
}
function resolveCaitApiKeyAgentContext(state, req) {
  const token = extractOrderApiKey(req);
  if (!token) return { session: null, user: null, login: '', authProvider: 'guest', apiKeyStatus: 'missing', apiKey: null };
  const matched = authenticateOrderApiKey(state, token);
  if (!matched) return { session: null, user: null, login: '', authProvider: 'guest', apiKeyStatus: 'invalid', apiKey: null };
  return {
    session: null,
    user: accountUserFromSettings(matched.account),
    login: matched.account.login,
    authProvider: 'api-key',
    account: matched.account,
    githubLinked: true,
    googleLinked: false,
    apiKeyStatus: 'valid',
    apiKey: matched.apiKey,
    apiKeyKind: 'cait'
  };
}
function currentAgentRequesterContext(state, req) {
  const current = currentUserContext(req);
  if (current?.user) return { ...current, apiKeyStatus: 'session', apiKey: null };
  return resolveCaitApiKeyAgentContext(state, req);
}
function requireOrderWriteAccess(req, current) {
  const policy = runtimePolicy(req);
  if (policy.releaseStage === 'public' && current?.apiKeyStatus === 'valid' && String(current?.apiKey?.mode || '').toLowerCase() === 'test') {
    return { error: 'Test API keys are disabled on the public deployment.', statusCode: 403, current, policy };
  }
  if (policy.openWriteApiEnabled || current?.user) return { current, policy };
  if (current?.apiKeyStatus === 'invalid') return { error: 'Invalid API key', statusCode: 401, current, policy };
  return { error: 'Login or API key required', statusCode: 401, current, policy };
}
function requireAgentWriteAccess(req, current) {
  const policy = runtimePolicy(req);
  if (current?.user && !current?.githubLinked) {
    return { error: 'GitHub connection required for agent registration.', statusCode: 403, current, policy };
  }
  if (policy.openWriteApiEnabled || current?.user || current?.apiKeyStatus === 'valid') return { current, policy };
  if (current?.apiKeyStatus === 'invalid') return { error: 'Invalid API key', statusCode: 401, current, policy };
  return { error: 'Login or CAIt API key required', statusCode: 401, current, policy };
}

function guestTrialCurrentContext(guestTrial = {}) {
  const login = guestTrial.login || guestTrialLoginForVisitorId(guestTrial.visitorId);
  return {
    session: null,
    user: {
      login,
      name: 'Guest Trial',
      email: '',
      accountId: login ? `acct:${login}` : ''
    },
    login,
    authProvider: 'guest-trial',
    apiKeyStatus: 'guest-trial',
    apiKey: null,
    guestTrial
  };
}

function guestTrialVisitorIdFromRequest(req) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const queryValue = String(url.searchParams.get('visitor_id') || url.searchParams.get('visitorId') || '').trim();
    if (queryValue) return queryValue;
  } catch {}
  return String(req.headers['x-aiagent2-visitor-id'] || '').trim();
}

function annotateGuestTrialOrderBody(body = {}, guestTrial = {}) {
  const input = body.input && typeof body.input === 'object' ? body.input : {};
  return {
    ...body,
    budget_cap: Math.min(Number(body.budget_cap || 300), guestTrial.limit || 500),
    guest_trial: {
      enabled: true,
      visitor_id: guestTrial.visitorId,
      visitor_hash: guestTrial.visitorHash,
      credit_limit: guestTrial.limit || 500
    },
    input: {
      ...input,
      _broker: {
        ...((input && input._broker) || {}),
        guestTrial: {
          visitorHash: guestTrial.visitorHash,
          creditLimit: guestTrial.limit || 500,
          signupDebit: true
        }
      }
    }
  };
}

async function prepareGuestTrialOrderContext(req, current, body, resolved) {
  const guestTrial = normalizeGuestTrialRequest(body);
  if (current?.user || current?.apiKeyStatus === 'valid' || !guestTrial.requested) {
    return { current, body, guestTrial: null };
  }
  if (current?.apiKeyStatus === 'invalid') {
    return { error: 'Invalid API key', statusCode: 401 };
  }
  return {
    error: 'Login required. Guest trial ordering is disabled. Sign in to receive 500 welcome credits for the first run.',
    code: 'login_required',
    statusCode: 401
  };
}

async function handleGuestTrialClaim(req) {
  return {
    error: 'Guest trial claim is disabled. First-time sign-in now grants 500 welcome credits directly.',
    code: 'guest_trial_disabled',
    statusCode: 410
  };
}

async function recordOrderApiKeyUsage(current, req) {
  if (!current?.apiKey?.id || !current?.login) return;
  await storage.mutate(async (draft) => {
    touchOrderApiKeyUsageInState(draft, current.login, current.apiKey.id, {
      lastUsedPath: new URL(req.url, 'http://localhost').pathname,
      lastUsedMethod: req.method
    });
  });
}
function requireWriteAccess(req) {
  const current = currentUserContext(req);
  const policy = runtimePolicy(req);
  if (policy.openWriteApiEnabled || current.user) return { current, policy };
  return { error: 'Login required', statusCode: 401, current, policy };
}
function loginsForCurrentAccount(current = null) {
  const aliases = aliasLoginsForAccount(current?.account || null);
  return [...new Set([
    current?.login,
    current?.user?.login,
    current?.githubIdentity?.login,
    current?.googleIdentity?.login,
    ...aliases
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
}
function isAgentOwnedByCurrent(agent, current = null) {
  return loginsForCurrentAccount(current).some((login) => isAgentOwnedByLogin(agent, login));
}
function authorizeAgentOwnerAction(state, req, agentId, current = null) {
  const resolvedCurrent = current || currentUserContext(req);
  const policy = runtimePolicy(req);
  const agent = state.agents.find((item) => item.id === agentId);
  if (!agent) return { error: 'Agent not found', statusCode: 404, current: resolvedCurrent, policy };
  if (policy.openWriteApiEnabled || isAgentOwnedByCurrent(agent, resolvedCurrent)) return { agent, current: resolvedCurrent, policy };
  if (!resolvedCurrent.user && resolvedCurrent.apiKeyStatus === 'invalid') return { error: 'Invalid API key', statusCode: 401, current: resolvedCurrent, policy };
  if (!resolvedCurrent.user && resolvedCurrent.apiKeyStatus !== 'valid') return { error: 'Login or CAIt API key required', statusCode: 401, current: resolvedCurrent, policy };
  return { error: 'Only the agent owner can perform this action', statusCode: 403, current: resolvedCurrent, policy };
}
function authorizeConnectedAgentAction(state, req, agentId) {
  const current = currentUserContext(req);
  const policy = runtimePolicy(req);
  const agent = state.agents.find((item) => item.id === agentId);
  if (!agent) return { error: 'Agent not found', statusCode: 404, current, policy };
  if (policy.openWriteApiEnabled || isAgentOwnedByCurrent(agent, current)) return { agent, current, policy, authMode: policy.openWriteApiEnabled ? 'open-write' : 'owner-session' };
  const token = extractAgentToken(req);
  if (token && agent.token && secretEquals(token, agent.token)) return { agent, current, policy, authMode: 'agent-token' };
  if (!current.user) return { error: 'Login or valid agent token required', statusCode: 401, current, policy };
  return { error: 'Agent owner login or valid agent token required', statusCode: 403, current, policy };
}
function visibleEventsForRequest(state, req, current = null) {
  const policy = runtimePolicy(req);
  const resolvedCurrent = current || currentUserContext(req);
  const activityEvents = state.events.filter((event) => String(event?.type || '').toUpperCase() !== 'TRACK');
  if (policy.exposeJobSecrets || canReviewFeedbackReports(resolvedCurrent, req)) return activityEvents.map((event) => structuredClone(event));
  return activityEvents.map((event) => publicEventView(event));
}
function sanitizeJobForViewer(job, req) {
  const cloned = cloneJob(job);
  if (!cloned) return null;
  if (!runtimePolicy(req).exposeJobSecrets) delete cloned.callbackToken;
  return cloned;
}

function sanitizeExecutorStatePatch(body = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const trim = (value, max = 4000) => String(value || '').trim().slice(0, max);
  const bool = (value) => value === true;
  const stringList = (value, maxItems = 12, maxLen = 160) => (
    Array.isArray(value)
      ? value.map((item) => trim(item, maxLen)).filter(Boolean).slice(0, maxItems)
      : []
  );
  const patch = {};
  const scalarKeys = [
    'channel', 'actionMode', 'postText', 'scheduledAt', 'target', 'recipientEmail', 'senderEmail', 'replyToEmail',
    'emailSubject', 'emailBody', 'executionMode', 'repoFullName', 'nextStep', 'googleSearchConsoleSite',
    'googleGa4Property', 'googleDriveFileId', 'googleCalendarId', 'googleGmailLabelId', 'executionStopReason',
    'instagramUserId', 'instagramMediaUrl', 'publishTarget', 'publishPathPrefix', 'publishSlug', 'publishMode'
  ];
  for (const key of scalarKeys) {
    if (!(key in input)) continue;
    patch[key] = trim(input[key], key === 'emailBody' || key === 'postText' ? 12000 : 320);
  }
  if ('executionStopped' in input) patch.executionStopped = bool(input.executionStopped);
  if ('googleIncludeGroups' in input) patch.googleIncludeGroups = stringList(input.googleIncludeGroups, 8, 40);
  if ('authorityRequired' in input) {
    if (!input.authorityRequired || typeof input.authorityRequired !== 'object') patch.authorityRequired = null;
    else {
      const authority = input.authorityRequired;
      patch.authorityRequired = {
        reason: trim(authority.reason, 500),
        missingConnectors: stringList(authority.missingConnectors, 8, 60),
        missingConnectorCapabilities: stringList(authority.missingConnectorCapabilities, 16, 120),
        source: trim(authority.source, 80),
        requestedAt: trim(authority.requestedAt, 80),
        ownerLabel: trim(authority.ownerLabel, 120),
        requiredRepositorySelection: bool(authority.requiredRepositorySelection),
        repoCandidates: stringList(authority.repoCandidates, 20, 120),
        requiredChannelSelection: bool(authority.requiredChannelSelection),
        channelCandidates: stringList(authority.channelCandidates, 12, 60)
      };
    }
  }
  return patch;
}
function visibleJobsForRequest(state, req, current = null) {
  const resolvedCurrent = current || currentUserContext(req);
  const byId = new Map();
  const addJobs = (jobs) => {
    for (const job of jobs || []) {
      if (job?.id) byId.set(job.id, job);
    }
  };
  if (canViewAdminDashboard(resolvedCurrent)) addJobs(Array.isArray(state?.jobs) ? state.jobs : []);
  else addJobs((Array.isArray(state?.jobs) ? state.jobs : []).filter((job) => requesterOwnsJobForCurrent(job, resolvedCurrent)));
  return [...byId.values()]
    .map((job) => sanitizeJobForViewer(job, req))
    .sort((left, right) => {
      const leftTs = String(left?.createdAt || left?.updatedAt || left?.startedAt || left?.ts || '');
      const rightTs = String(right?.createdAt || right?.updatedAt || right?.startedAt || right?.ts || '');
      const diff = rightTs.localeCompare(leftTs);
      if (diff !== 0) return diff;
      return String(right?.id || '').localeCompare(String(left?.id || ''));
    });
}
function visibleBillingAuditsForRequest(state, req, jobs = null, current = null) {
  const visibleJobs = Array.isArray(jobs) ? jobs : visibleJobsForRequest(state, req, current);
  return billingAuditsForJobIds(state.events, visibleJobs.map((job) => job.id));
}
function canViewJobFromRequest(state, req, job, current = null) {
  const resolvedCurrent = current || currentUserContext(req);
  const policy = runtimePolicy(req);
  if (policy.guestRunReadEnabled) return true;
  if (canViewAdminDashboard(resolvedCurrent)) return true;
  return requesterOwnsJobForCurrent(job, resolvedCurrent);
}
function requestedBillingPeriod(url) {
  const raw = String(url.searchParams.get('period') || '').trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : billingPeriodId();
}
async function resolveWorkActionRequest(req) {
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const prompt = String(body?.prompt || '').trim();
  if (!prompt) return { ok: true, action: '', source: 'empty' };
  if (isDeveloperExecutionIntentText(prompt)) {
    return { ok: true, action: '', source: 'developer_execution_intent' };
  }
  const state = await storage.getState();
  const action = resolveStaticWorkAction(prompt, { exactActions: state.exactMatchActions || [] }) || '';
  return {
    ok: true,
    prompt,
    action,
    source: action ? 'shared_registry' : 'none'
  };
}

async function resolveWorkIntentRequest(req) {
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const prompt = String(body?.prompt || '').trim();
  if (!prompt) return { ok: true, kind: 'empty', action: '', source: 'empty' };
  if (isDeveloperExecutionIntentText(prompt)) {
    const route = inferWorkIntentRoute(prompt);
    return {
      ok: true,
      kind: 'order',
      action: '',
      source: 'developer_execution_intent',
      taskType: route.taskType,
      strategyHint: route.strategyHint,
      routeHint: route.routeHint,
      reason: route.reason
    };
  }
  const state = await storage.getState();
  const action = resolveStaticWorkAction(prompt, { exactActions: state.exactMatchActions || [] }) || '';
  const route = action ? null : inferWorkIntentRoute(prompt);
  return {
    ok: true,
    kind: action ? 'command' : 'order',
    action,
    prompt,
    source: action ? 'shared_registry' : 'none',
    taskType: route?.taskType || '',
    strategyHint: route?.strategyHint || '',
    routeHint: route?.routeHint || '',
    reason: route?.reason || ''
  };
}

async function prepareWorkOrderRequest(req) {
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const prompt = String(body?.prompt || '').trim();
  const requestedStrategy = String(body?.requestedStrategy || body?.orderStrategy || '').trim().toLowerCase();
  if (!prompt) {
    return {
      ok: true,
      prompt: '',
      taskType: '',
      requestedOrderStrategy: requestedStrategy || 'auto',
      resolvedOrderStrategy: requestedStrategy === 'multi' ? 'multi' : 'single',
      routeHint: '',
      reason: ''
    };
  }
  const prepared = prepareWorkOrderSeed(prompt, requestedStrategy);
  return {
    ok: true,
    prompt,
    ...prepared
  };
}

async function preflightWorkOrderRequest(req) {
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const prompt = String(body?.prompt || '').trim();
  if (!prompt) return { ok: false, code: 'missing_prompt', error: 'prompt required', statusCode: 400 };
  const seed = prepareWorkOrderSeed(prompt, body?.order_strategy || body?.requestedOrderStrategy || 'auto');
  const taskType = String(body?.task_type || body?.taskType || seed.taskType || 'research').trim().toLowerCase();
  const resolvedOrderStrategy = String(body?.resolved_order_strategy || body?.resolvedOrderStrategy || seed.resolvedOrderStrategy || 'single').trim().toLowerCase();
  const state = await storage.getState();
  const current = currentUserContext(req);
  const account = current?.login ? accountSettingsForLogin(state, current.login, current.user, current.authProvider) : null;
  const requestedAgentId = String(body?.agent_id || body?.agentId || '').trim();
  const resolvedStrategyPlan = resolveOrderStrategy(state.agents, {
    ...body,
    task_type: taskType,
    prompt,
    budget_cap: Number(body?.budget_cap || body?.budgetCap || 0),
    agent_id: requestedAgentId
  }, body?.order_strategy || body?.requestedOrderStrategy || resolvedOrderStrategy);
  if (resolvedStrategyPlan.strategy === 'multi' || resolvedOrderStrategy === 'multi') {
    const plan = resolvedStrategyPlan.plan || { plannedTasks: [], selections: [] };
    const plannedSpecialties = [...new Set((plan.plannedTasks || []).filter(isAutoWorkflowSpecialtyTask))];
    const selectedSpecialties = [...new Set((plan.selections || []).filter((selection) => isAutoWorkflowSpecialtyTask(selection.taskType)).map((selection) => selection.taskType))];
    if ((plan.selections || []).length < 2 || selectedSpecialties.length < 2) {
      return {
        ok: false,
        code: 'agent_unavailable',
        error: 'Need at least 2 ready specialist agents before sending an Agent Team objective.',
        inferred_task_type: taskType,
        requested_agent_id: requestedAgentId,
        resolvedOrderStrategy: 'multi',
        plannedTasks: plan.plannedTasks || [],
        selectedSpecialties,
        plannedSpecialties,
        statusCode: 400
      };
    }
    return {
      ok: true,
      mode: 'multi',
      taskType,
      resolvedOrderStrategy: 'multi',
      routeHint: seed.routeHint,
      reason: resolvedStrategyPlan.reason || seed.reason,
      plannedTasks: plan.plannedTasks || [],
      selectedSpecialties,
      plannedSpecialties,
      selectionCount: (plan.selections || []).length
    };
  }
  const picked = pickAgent(state.agents, taskType, Number(body?.budget_cap || body?.budgetCap || 0), requestedAgentId, {
    body,
    tagHints: body?.workflow_tag_hints || body?.workflowTagHints || [],
    scheduled: Boolean(body?.input?._broker?.recurring),
    recurring: Boolean(body?.input?._broker?.recurring)
  });
  if (picked?.error) {
    return {
      ok: false,
      code: 'agent_unavailable',
      error: picked.error,
      inferred_task_type: taskType,
      requested_agent_id: requestedAgentId,
      statusCode: 400
    };
  }
  if (!picked?.agent) {
    return {
      ok: false,
      code: 'agent_unavailable',
      error: 'No verified agent available for this task.',
      inferred_task_type: taskType,
      requested_agent_id: requestedAgentId,
      statusCode: 400
    };
  }
  const preflight = orderPreflightForAgent(picked.agent, current, account, body, {
    scheduled: Boolean(body?.input?._broker?.recurring)
  });
  if (!preflight.ok) {
    return {
      ...preflight,
      inferred_task_type: taskType,
      requested_agent_id: requestedAgentId,
      statusCode: preflight.statusCode || 400
    };
  }
  return {
    ok: true,
    mode: 'single',
    taskType,
    resolvedOrderStrategy,
    routeHint: seed.routeHint,
    reason: seed.reason,
    selectedAgent: {
      id: picked.agent.id,
      name: picked.agent.name
    },
    selectionMode: picked.selectionMode,
    score: picked.score
  };
}

async function updateJobExecutorState(req, jobId = '') {
  const id = String(jobId || '').trim();
  if (!id) return { error: 'job id required', statusCode: 400 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const patch = sanitizeExecutorStatePatch(body || {});
  const current = currentUserContext(req);
  let updated = null;
  await storage.mutate(async (draft) => {
    const index = Array.isArray(draft.jobs) ? draft.jobs.findIndex((job) => job?.id === id) : -1;
    if (index < 0) return;
    const job = draft.jobs[index];
    if (!canViewJobFromRequest(draft, req, job, current)) return;
    const existing = job?.executorState && typeof job.executorState === 'object' ? job.executorState : {};
    const next = { ...existing, ...patch, updatedAt: nowIso() };
    job.executorState = next;
    draft.jobs[index] = job;
    updated = cloneJob(job);
  });
  if (!updated) return { error: 'Job not found or access denied', statusCode: 404 };
  return { ok: true, job: sanitizeJobForViewer(updated, req) };
}
function accountSummaryForRequest(state, req, period = billingPeriodId()) {
  const current = currentUserContext(req);
  if (!current.user) return { accountSettings: null, monthlySummary: null };
  const accountSettings = accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  const monthlySummary = buildMonthlyAccountSummary(state, current.login, period, accountSettings);
  return { accountSettings, monthlySummary };
}
function ownerFromRequest(req) {
  const current = currentUserContext(req);
  const user = current?.user || null;
  const githubIdentity = current?.githubIdentity || null;
  const callbackBase = baseUrl(req);
  if (!user) return { owner: 'samurai', metadata: { brokerCallbackUrl: `${callbackBase}/api/agent-callbacks/jobs` } };
  return {
    owner: current?.login || user.login,
    metadata: {
      githubLogin: githubIdentity?.login || current?.login || user.login,
      githubName: githubIdentity?.name || user.name,
      githubAvatarUrl: githubIdentity?.avatarUrl || user.avatarUrl,
      githubProfileUrl: githubIdentity?.profileUrl || user.profileUrl,
      brokerCallbackUrl: `${callbackBase}/api/agent-callbacks/jobs`
    }
  };
}
function ownerFromCurrent(req, current = null) {
  const callbackBase = baseUrl(req);
  const user = current?.user || null;
  const login = String(current?.login || user?.login || '').trim();
  const githubIdentity = current?.githubIdentity || null;
  if (!login) return { owner: 'samurai', metadata: { brokerCallbackUrl: `${callbackBase}/api/agent-callbacks/jobs` } };
  return {
    owner: login,
    metadata: {
      githubLogin: githubIdentity?.login || login,
      githubName: githubIdentity?.name || user?.name || login,
      githubAvatarUrl: githubIdentity?.avatarUrl || user?.avatarUrl || '',
      githubProfileUrl: githubIdentity?.profileUrl || user?.profileUrl || '',
      brokerCallbackUrl: `${callbackBase}/api/agent-callbacks/jobs`
    }
  };
}

async function snapshot(req) {
  const url = new URL(req.url, 'http://localhost');
  let state = await storage.getState();
  const auth = authStatus(req);
  const current = currentUserContext(req);
  const period = requestedBillingPeriod(url);
  const { accountSettings, monthlySummary } = accountSummaryForRequest(state, req, period);
  const canReviewReports = canReviewFeedbackReports(current, req);
  const canRepairAdminAccounts = canViewAdminDashboard(current);
  if (canRepairAdminAccounts) {
    const repair = await storage.mutate(async (draft) => recoverMissingAccountsInState(draft));
    if (Number(repair?.recovered || 0) > 0) state = await storage.getState();
  }
  const feedbackReports = canReviewReports ? feedbackReportsForClient(state, 200) : null;
  const conversionAnalytics = canReviewReports ? buildConversionAnalytics(state) : null;
  const chatTranscripts = canReviewReports ? chatTranscriptsForClient(state, 200) : null;
  const adminDashboard = canRepairAdminAccounts
    ? buildAdminDashboard(state, { operator: current.login })
    : null;
  const chatMemory = current?.login ? ownChatMemoryForClient(state, current.login, 20) : [];
  const jobs = visibleJobsForRequest(state, req, current);
  const payload = {
    stats: statsOf(state),
    agents: state.agents.map(publicAgent).filter(Boolean),
    jobs,
    events: visibleEventsForRequest(state, req, current),
    billingAudits: visibleBillingAuditsForRequest(state, req, jobs, current),
    recurringOrders: recurringOrdersVisibleToLogin(state, current.login),
    storage: { kind: storage.kind, supportsPersistence: storage.supportsPersistence, path: null, note: storage.note || null },
    auth,
    appSettings: appSettingsMap(state),
    accountSettings: sanitizeAccountSettingsForClient(accountSettings),
    monthlySummary,
    chatMemory
  };
  if (feedbackReports) payload.feedbackReports = feedbackReports;
  if (conversionAnalytics) payload.conversionAnalytics = conversionAnalytics;
  if (chatTranscripts) payload.chatTranscripts = chatTranscripts;
  if (adminDashboard) payload.adminDashboard = adminDashboard;
  return payload;
}

async function getSettingsPayload(req, url) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  const state = await storage.getState();
  const period = requestedBillingPeriod(url);
  const account = accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  const monthlySummary = buildMonthlyAccountSummary(state, current.login, period, account);
  return { account: sanitizeAccountSettingsForClient(account), monthlySummary };
}

async function saveSettingsSection(req, url, section) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  if (section === 'payout' && !current.githubLinked) {
    return { error: 'GitHub connection required for provider actions.', statusCode: 403 };
  }
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const patch = section === 'billing'
    ? sanitizeBillingSettingsPatch(body || {})
    : section === 'payout'
      ? sanitizePayoutSettingsPatch(body || {})
      : section === 'executorPreferences'
        ? sanitizeExecutorPreferencesPatch(body || {})
      : (body || {});
  let account = null;
  await storage.mutate(async (draft) => {
    account = upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, { [section]: patch });
  });
  const state = await storage.getState();
  const period = requestedBillingPeriod(url);
  const monthlySummary = buildMonthlyAccountSummary(state, current.login, period, account);
  return { account: sanitizeAccountSettingsForClient(account), monthlySummary };
}

async function getAppSettings(req) {
  const current = currentUserContext(req);
  if (!canViewAdminDashboard(current)) return { error: 'Admin access required', statusCode: 403 };
  const state = await storage.getState();
  return { app_settings: appSettingsMap(state) };
}

async function saveAppSetting(req) {
  const current = currentUserContext(req);
  if (!canViewAdminDashboard(current)) return { error: 'Admin access required', statusCode: 403 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const patch = sanitizeAppSettingPatch(body || {});
  if (patch.error) return { error: patch.error, statusCode: 400 };
  await storage.mutate(async (draft) => {
    const existing = Array.isArray(draft.appSettings) ? draft.appSettings : [];
    const next = [...existing];
    const index = next.findIndex((item) => String(item?.key || '').trim() === patch.key);
    const merged = {
      ...(index >= 0 ? next[index] : {}),
      ...patch,
      createdAt: index >= 0 ? (next[index]?.createdAt || nowIso()) : nowIso(),
      updatedAt: nowIso()
    };
    if (index >= 0) next[index] = merged;
    else next.push(merged);
    draft.appSettings = next;
  });
  const state = await storage.getState();
  return { app_settings: appSettingsMap(state) };
}

async function deleteAppSetting(req, key = '') {
  const current = currentUserContext(req);
  if (!canViewAdminDashboard(current)) return { error: 'Admin access required', statusCode: 403 };
  const targetKey = String(key || '').trim();
  if (!targetKey || !(targetKey in APP_SETTING_DEFAULTS)) return { error: 'Unknown app setting key.', statusCode: 400 };
  await storage.mutate(async (draft) => {
    draft.appSettings = (Array.isArray(draft.appSettings) ? draft.appSettings : [])
      .filter((item) => String(item?.key || '').trim() !== targetKey);
  });
  const state = await storage.getState();
  return { ok: true, app_settings: appSettingsMap(state) };
}

async function hideOwnChatMemory(req, memoryId) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  const safeMemoryId = String(memoryId || '').trim().replace(/^server_/, '').slice(0, 140);
  if (!safeMemoryId) return { error: 'Chat memory id is required', statusCode: 400 };
  const activeStatuses = new Set(['queued', 'claimed', 'running', 'dispatched']);
  const stateBefore = await storage.getState();
  const visibleJobs = jobsVisibleToLogin(stateBefore, current.login, {
    account: accountSettingsForLogin(stateBefore, current.login, current.user, current.authProvider)
  });
  const rootJobIdsToCancel = [...new Set(visibleJobs
    .filter((job) => activeStatuses.has(String(job?.status || '').trim().toLowerCase()))
    .filter((job) => {
      const jobId = String(job?.id || '').trim();
      const sessionId = chatSessionIdForJob(job);
      const syntheticSessionId = jobId ? `job_${jobId}` : '';
      return safeMemoryId === jobId || safeMemoryId === sessionId || safeMemoryId === syntheticSessionId;
    })
    .map((job) => String(job?.workflowParentId || job?.id || '').trim())
    .filter(Boolean))];
  for (const rootJobId of rootJobIdsToCancel) {
    const rootJob = visibleJobs.find((job) => String(job?.id || '').trim() === rootJobId) || null;
    const relatedActiveJobs = visibleJobs
      .filter((job) => activeStatuses.has(String(job?.status || '').trim().toLowerCase()))
      .filter((job) => String(job?.id || '').trim() === rootJobId || String(job?.workflowParentId || '').trim() === rootJobId)
      .sort((left, right) => Number(Boolean(left?.workflowParentId)) - Number(Boolean(right?.workflowParentId)));
    for (const job of relatedActiveJobs) {
      await failJob(
        job.id,
        'Cancelled because the linked chat session was deleted.',
        ['cancelled after linked chat session deletion'],
        { failureStatus: 'failed', failureCategory: 'user_cancelled', retryable: false, source: 'chat_memory_delete' }
      );
    }
    if (rootJob && !relatedActiveJobs.some((job) => String(job?.id || '').trim() === rootJob.id)) {
      await failJob(
        rootJob.id,
        'Cancelled because the linked chat session was deleted.',
        ['cancelled after linked chat session deletion'],
        { failureStatus: 'failed', failureCategory: 'user_cancelled', retryable: false, source: 'chat_memory_delete' }
      );
    }
    await touchEvent('FAILED', `chat-linked work ${rootJobId.slice(0, 6)} cancelled after session delete`, {
      jobId: rootJobId,
      source: 'chat_memory_delete',
      login: current.login
    });
  }
  let result = null;
  await storage.mutate(async (draft) => {
    result = hideChatMemoryTranscriptForLoginInState(draft, current.login, safeMemoryId, current.user, current.authProvider);
  });
  if (!result && !rootJobIdsToCancel.length) return { error: 'Chat memory could not be hidden', statusCode: 400 };
  const refreshedState = await storage.getState();
  const refreshedAccount = result?.account || accountSettingsForLogin(refreshedState, current.login, current.user, current.authProvider);
  const state = await storage.getState();
  return {
    ok: true,
    hidden_chat_memory_id: result?.transcriptId || safeMemoryId,
    cancelled_job_ids: rootJobIdsToCancel,
    account: sanitizeAccountSettingsForClient(refreshedAccount),
    chatMemory: ownChatMemoryForClient(state, current.login, 20)
  };
}

function feedbackEmailAddress(value = '', fallback = 'support@aiagent-marketplace.net') {
  const text = String(value || '').trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text) ? text : fallback;
}

async function forwardFeedbackReportEmail(report) {
  const webhookUrl = String(process.env.FEEDBACK_EMAIL_WEBHOOK_URL || '').trim();
  if (!webhookUrl) return { ok: false, skipped: true, status: 'not_configured' };
  const email = formatFeedbackReportEmail(report, {
    to: feedbackEmailAddress(process.env.FEEDBACK_EMAIL_TO),
    from: feedbackEmailAddress(process.env.FEEDBACK_EMAIL_FROM)
  });
  const deliveryTo = feedbackEmailAddress(process.env.FEEDBACK_EMAIL_DELIVERY_TO || 'yasuikunihiro@gmail.com');
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: email.to,
        deliveryTo,
        from: email.from,
        replyTo: email.replyTo,
        subject: email.subject,
        text: email.text
      })
    });
    if (!response.ok) throw new Error(`Email webhook returned ${response.status}`);
    return { ok: true, status: 'sent', to: email.to, deliveryTo, subject: email.subject };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      error: String(error?.message || error || 'email send failed').slice(0, 240)
    };
  }
}

async function submitFeedbackReport(req) {
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const title = String(body?.title || '').trim();
  const message = String(body?.message || '').trim();
  if (!title && !message) return { error: 'Title or message is required', statusCode: 400 };
  const current = currentUserContext(req);
  const report = createFeedbackReport(body || {}, {
    reporterLogin: current?.login || '',
    pagePath: body?.page_path || new URL(req.url, 'http://localhost').pathname,
    currentTab: body?.current_tab || '',
    source: body?.source || 'contact_form'
  });
  await storage.mutate(async (draft) => {
    if (!Array.isArray(draft.feedbackReports)) draft.feedbackReports = [];
    draft.feedbackReports.unshift(report);
    if (draft.feedbackReports.length > 1000) draft.feedbackReports = draft.feedbackReports.slice(0, 1000);
  });
  const emailForward = await forwardFeedbackReportEmail(report);
  await touchEvent('FEEDBACK', `feedback ${report.type} ${report.id.slice(0, 8)} submitted`, {
    reportId: report.id,
    type: report.type,
    source: report.context?.source || 'contact_form',
    pagePath: report.context?.pagePath || '/',
    reporterLogin: report.reporterLogin || '',
    emailForwarded: Boolean(emailForward.ok),
    emailStatus: emailForward.status,
    emailError: emailForward.ok ? '' : emailForward.error || emailForward.status || ''
  });
  return {
    ok: true,
    report: sanitizeFeedbackReportForClient(report),
    email_forwarded: Boolean(emailForward.ok),
    email_status: emailForward.status
  };
}

async function recordAnalyticsEvent(req) {
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const current = currentUserContext(req);
  const payload = createConversionEventPayload(body || {}, {
    loggedIn: Boolean(current?.user),
    authProvider: current?.authProvider || 'guest',
    login: current?.login || ''
  });
  if (payload.error) return payload;
  const event = await touchEvent('TRACK', payload.message, payload.meta);
  return { ok: true, event: { id: event.id, ts: event.ts, type: event.type } };
}

async function recordChatTranscript(req) {
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const current = currentUserContext(req);
  const transcript = createChatTranscript(body || {}, {
    loggedIn: Boolean(current?.user),
    authProvider: current?.authProvider || 'guest',
    login: current?.login || ''
  });
  if (transcript.error) return transcript;
  if (typeof storage.appendChatTranscript === 'function') {
    await storage.appendChatTranscript(transcript);
  } else {
    await storage.mutate(async (draft) => {
      if (!Array.isArray(draft.chatTranscripts)) draft.chatTranscripts = [];
      draft.chatTranscripts.unshift(transcript);
      if (draft.chatTranscripts.length > 2000) draft.chatTranscripts = draft.chatTranscripts.slice(0, 2000);
    });
  }
  return {
    ok: true,
    transcript: {
      id: transcript.id,
      createdAt: transcript.createdAt,
      redacted: transcript.redacted
    }
  };
}

async function listFeedbackReports(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  if (!canReviewFeedbackReports(current, req)) return { error: 'Reports are restricted to operators', statusCode: 403 };
  const state = await storage.getState();
  return { feedbackReports: feedbackReportsForClient(state, 200) };
}

async function updateFeedbackReport(req, reportId) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  if (!canReviewFeedbackReports(current, req)) return { error: 'Reports are restricted to operators', statusCode: 403 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  let updated = null;
  await storage.mutate(async (draft) => {
    updated = updateFeedbackReportInState(draft, reportId, body || {}, { login: current.login });
  });
  if (!updated) return { error: 'Feedback report not found', statusCode: 404 };
  await touchEvent('FEEDBACK', `feedback ${updated.id.slice(0, 8)} marked ${updated.status}`, {
    reportId: updated.id,
    status: updated.status,
    reviewedBy: current.login
  });
  return { ok: true, report: sanitizeFeedbackReportForClient(updated) };
}

async function updateChatTranscriptReview(req, transcriptId) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  if (!canReviewFeedbackReports(current, req)) return { error: 'Chat transcripts are restricted to operators', statusCode: 403 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  let updated = null;
  await storage.mutate(async (draft) => {
    updated = updateChatTranscriptReviewInState(draft, transcriptId, body || {}, { login: current.login });
  });
  if (!updated) return { error: 'Chat transcript not found', statusCode: 404 };
  await touchEvent('TRACK', `chat transcript ${updated.id.slice(0, 8)} marked ${updated.reviewStatus}`, {
    kind: 'chat_transcript_review',
    transcriptId: updated.id,
    reviewStatus: updated.reviewStatus,
    reviewedBy: current.login
  });
  return { ok: true, transcript: updated };
}

async function listChatTrainingData(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  if (!canReviewFeedbackReports(current, req)) return { error: 'Training data export is restricted to operators', statusCode: 403 };
  const state = await storage.getState();
  const examples = chatTrainingExamplesForClient(state, 200);
  return {
    ok: true,
    schema: 'cait-chat-training-export/v1',
    policy: {
      source: 'Reviewed Work Chat transcripts only.',
      includedStatuses: ['fixed'],
      redaction: 'Secrets, emails, auth headers, long text, and payment-like numbers are redacted or truncated before export.',
      usage: 'Use for CAIt prompt/rule/evaluation improvement. Do not use as external model training data without updated user notice and consent.'
    },
    examples
  };
}

async function listOrderApiKeys(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  const state = await storage.getState();
  const account = accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  return { apiKeys: sanitizeAccountSettingsForClient(account)?.apiAccess?.orderKeys || [] };
}

async function createOrderApiKey(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  if (runtimePolicy(req).releaseStage === 'public' && String(body?.mode || 'live').toLowerCase() === 'test') {
    return { error: 'Test API keys are disabled on the public deployment.', statusCode: 403 };
  }
  let created = null;
  await storage.mutate(async (draft) => {
    created = createOrderApiKeyInState(draft, current.login, current.user, current.authProvider, {
      label: body?.label || '',
      mode: body?.mode || 'live'
    });
  });
  await touchEvent('API_KEY', `${current.login} issued ${created.apiKey.mode} CAIt API key ${created.apiKey.label}`);
  return {
    ok: true,
    apiKey: created.apiKey,
    account: sanitizeAccountSettingsForClient(created.account)
  };
}

async function revokeOrderApiKey(req, keyId) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  let revoked = null;
  await storage.mutate(async (draft) => {
    revoked = revokeOrderApiKeyInState(draft, current.login, keyId, current.user, current.authProvider);
  });
  if (!revoked) return { error: 'API key not found', statusCode: 404 };
  await touchEvent('API_KEY', `${current.login} revoked CAIt API key ${revoked.apiKey.label}`);
  return {
    ok: true,
    apiKey: revoked.apiKey,
    account: sanitizeAccountSettingsForClient(revoked.account)
  };
}

async function getStripeStatus(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  const state = await storage.getState();
  const account = accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  return { stripe: stripeStateForClient(req, account) };
}

async function createStripeDepositSessionForCurrent(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const ensured = await ensureStripeCustomerForCurrent(current, req);
  if (ensured.error) return ensured;
  const displayAmount = Number(body?.amount || 0);
  const ledgerAmount = displayCurrencyToLedgerAmount(displayAmount);
  const returnTab = ['work', 'settings'].includes(String(body?.return_tab || body?.returnTab || '').trim().toLowerCase())
    ? String(body?.return_tab || body?.returnTab || '').trim().toLowerCase()
    : 'settings';
  const session = await createDepositCheckoutSession(ensured.config, {
    account: ensured.account,
    customerId: ensured.customerId,
    amount: displayAmount,
    currency: BILLING_DISPLAY_CURRENCY,
    baseUrl: baseUrl(req),
    ledgerAmount,
    returnTab
  });
  await storage.mutate(async (draft) => {
    const account = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
    upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
      billing: {
        ...(account.billing || {}),
        mode: 'monthly_invoice',
        invoiceEnabled: true,
        invoiceApproved: false
      },
      stripe: {
        ...(account.stripe || {}),
        customerId: ensured.customerId,
        customerStatus: 'ready',
        pendingTopupCheckoutSessionId: session.id,
        lastSyncAt: nowIso(),
        mode: 'configured'
      }
    });
  });
  await touchEvent('STRIPE', `${current.login} opened deposit checkout`);
  return { ok: true, checkout_url: session.url, session_id: session.id, amount: ledgerAmount, return_tab: returnTab, stripe: stripeStateForClient(req, ensured.account) };
}

async function createStripeSetupSessionForCurrent(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  const ensured = await ensureStripeCustomerForCurrent(current, req);
  if (ensured.error) return ensured;
  const session = await createSetupCheckoutSession(ensured.config, {
    account: ensured.account,
    customerId: ensured.customerId,
    baseUrl: baseUrl(req)
  });
  await storage.mutate(async (draft) => {
    const account = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
    upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
      stripe: {
        ...(account.stripe || {}),
        customerId: ensured.customerId,
        customerStatus: 'ready',
        setupCheckoutStatus: 'started',
        setupCheckoutSessionId: session.id,
        lastSyncAt: nowIso(),
        mode: 'configured'
      }
    });
  });
  await touchEvent('STRIPE', `${current.login} opened payment method setup`);
  return { ok: true, checkout_url: session.url, session_id: session.id };
}

async function createStripeSubscriptionSessionForCurrent(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const ensured = await ensureStripeCustomerForCurrent(current, req);
  if (ensured.error) return ensured;
  const plan = String(body?.plan || ensured.account?.billing?.subscriptionPlan || 'none').trim().toLowerCase();
  const session = await createSubscriptionCheckoutSession(ensured.config, {
    account: ensured.account,
    customerId: ensured.customerId,
    baseUrl: baseUrl(req),
    plan,
    priceId: body?.priceId || ''
  });
  await storage.mutate(async (draft) => {
    const account = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
    upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
      stripe: {
        ...(account.stripe || {}),
        customerId: ensured.customerId,
        customerStatus: 'ready',
        subscriptionStatus: 'started',
        subscriptionPlan: plan || account.stripe?.subscriptionPlan || 'none',
        lastSyncAt: nowIso(),
        mode: 'configured'
      }
    });
  });
  await touchEvent('STRIPE', `${current.login} opened subscription checkout ${plan}`);
  return { ok: true, checkout_url: session.url, session_id: session.id, plan };
}

async function createStripeConnectOnboardingForCurrent(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  if (!current.githubLinked) return { error: 'GitHub connection required for provider actions.', statusCode: 403 };
  const config = currentStripeConfig(req);
  if (!stripeConfigured(config)) return { error: 'Stripe is not configured', statusCode: 503 };
  const state = await storage.getState();
  const account = accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  const existingConnectedAccountId = String(account?.stripe?.connectedAccountId || '').trim();
  if (existingConnectedAccountId) {
    const remoteAccount = await retrieveConnectedAccount(config, existingConnectedAccountId);
    const detailsSubmitted = Boolean(remoteAccount?.details_submitted);
    const chargesEnabled = Boolean(remoteAccount?.charges_enabled);
    const payoutsEnabled = Boolean(remoteAccount?.payouts_enabled);
    await storage.mutate(async (draft) => {
      const latest = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
      upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
        payout: {
          ...(latest.payout || {}),
          providerEnabled: true,
          minimumPayoutAmount: Number(latest.payout?.minimumPayoutAmount || 0) === 5000 ? displayCurrencyToLedgerAmount(10) : (latest.payout?.minimumPayoutAmount || displayCurrencyToLedgerAmount(10))
        },
        stripe: {
          ...(latest.stripe || {}),
          connectedAccountId: existingConnectedAccountId,
          connectedAccountStatus: payoutsEnabled ? 'ready' : 'pending',
          connectOnboardingStatus: detailsSubmitted ? 'completed' : 'pending',
          chargesEnabled,
          payoutsEnabled,
          lastSyncAt: nowIso(),
          mode: 'configured'
        }
      });
    });
    if (payoutsEnabled) {
      await touchEvent('STRIPE', `${current.login} connect onboarding already complete`);
      return { ok: true, already_connected: true, account_id: existingConnectedAccountId, status: 'ready' };
    }
  }
  let connected;
  try {
    connected = await createConnectedAccount(config, { account, payout: account.payout || {} });
  } catch (error) {
    const message = String(error?.message || '');
    if (/signed up for Connect/i.test(message)) {
      return {
        error: 'Stripe Connect is not enabled on the CAIt platform account. Open https://dashboard.stripe.com/connect, complete Connect setup, then retry OPEN CONNECT.',
        code: 'connect_not_enabled',
        statusCode: 409
      };
    }
    throw error;
  }
  const link = await createConnectOnboardingLink(config, {
    connectedAccountId: connected.connectedAccountId,
    baseUrl: baseUrl(req)
  });
  await storage.mutate(async (draft) => {
    const latest = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
    upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
      payout: {
        ...(latest.payout || {}),
        providerEnabled: true,
        minimumPayoutAmount: Number(latest.payout?.minimumPayoutAmount || 0) === 5000 ? displayCurrencyToLedgerAmount(10) : (latest.payout?.minimumPayoutAmount || displayCurrencyToLedgerAmount(10))
      },
      stripe: {
        ...(latest.stripe || {}),
        connectedAccountId: connected.connectedAccountId,
        connectedAccountStatus: connected.created ? 'pending' : (latest.stripe?.payoutsEnabled ? 'ready' : 'pending'),
        connectOnboardingStatus: 'started',
        lastSyncAt: nowIso(),
        mode: 'configured'
      }
    });
  });
  await touchEvent('STRIPE', `${current.login} opened connect onboarding`);
  return { ok: true, onboarding_url: link.url, account_id: connected.connectedAccountId };
}

async function createStripeProviderPayoutForCurrent(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  if (!current.githubLinked) return { error: 'GitHub connection required for provider actions.', statusCode: 403 };
  const config = currentStripeConfig(req);
  if (!stripeConfigured(config)) return { error: 'Stripe is not configured', statusCode: 503 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const state = await storage.getState();
  const account = accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  if (!account?.payout?.providerEnabled) {
    return { error: 'Enable provider profile before requesting payout.', statusCode: 400 };
  }
  const connectedAccountId = String(account?.stripe?.connectedAccountId || '').trim();
  if (!connectedAccountId) {
    return { error: 'Open Connect first to create a connected payout account.', statusCode: 400 };
  }
  const remoteAccount = await retrieveConnectedAccount(config, connectedAccountId);
  const payoutsEnabled = Boolean(remoteAccount?.payouts_enabled);
  const chargesEnabled = Boolean(remoteAccount?.charges_enabled);
  await storage.mutate(async (draft) => {
    const latest = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
    upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
      stripe: {
        ...(latest.stripe || {}),
        connectedAccountId,
        connectedAccountStatus: payoutsEnabled ? 'ready' : 'pending',
        connectOnboardingStatus: remoteAccount?.details_submitted ? 'completed' : 'pending',
        chargesEnabled,
        payoutsEnabled,
        lastSyncAt: nowIso(),
        mode: 'configured'
      }
    });
  });
  if (!payoutsEnabled) {
    return { error: 'Stripe Connect payout onboarding is not complete yet. Finish OPEN CONNECT or RESUME CONNECT and wait for payouts to be enabled.', statusCode: 409 };
  }
  const latestState = await storage.getState();
  const latestAccount = accountSettingsForLogin(latestState, current.login, current.user, current.authProvider);
  const ledger = providerPayoutLedgerForLogin(latestState, current.login, latestAccount);
  const pendingBalance = Number(ledger.pendingBalance || 0);
  if (!(pendingBalance > 0)) {
    return { error: 'No provider payout balance is available yet.', statusCode: 400 };
  }
  const minimumPayoutAmount = Number(latestAccount?.payout?.minimumPayoutAmount || displayCurrencyToLedgerAmount(10));
  const requestedAmount = displayCurrencyToLedgerAmount(Number(body?.amount || 0));
  const payoutAmount = requestedAmount > 0 ? Math.min(requestedAmount, pendingBalance) : pendingBalance;
  if (!(payoutAmount > 0)) {
    return { error: 'Payout amount must be greater than zero.', statusCode: 400 };
  }
  if (payoutAmount < minimumPayoutAmount && !body?.force) {
    return {
      error: `Pending payout is below the minimum threshold (${minimumPayoutAmount}).`,
      code: 'minimum_payout_not_reached',
      pending_balance: pendingBalance,
      minimum_payout_amount: minimumPayoutAmount,
      statusCode: 409
    };
  }
  const period = billingPeriodId();
  const transfer = await createConnectedAccountTransfer(config, {
    account: latestAccount,
    connectedAccountId,
    amount: ledgerAmountToDisplayCurrency(payoutAmount),
    currency: BILLING_DISPLAY_CURRENCY,
    description: `CAIt provider payout ${period}`,
    metadata: {
      aiagent2_payout_period: period,
      aiagent2_payout_login: current.login,
      aiagent2_ledger_amount: String(payoutAmount)
    }
  });
  const payoutRun = {
    id: randomUUID(),
    transferId: transfer.id,
    amount: +payoutAmount.toFixed(1),
    currency: latestAccount?.payout?.currency || config.defaultCurrency || BILLING_DISPLAY_CURRENCY,
    period,
    status: 'paid',
    createdAt: nowIso()
  };
  let updated = null;
  await storage.mutate(async (draft) => {
    const draftAccount = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
    const priorRuns = Array.isArray(draftAccount?.payout?.payoutRuns) ? draftAccount.payout.payoutRuns : [];
    updated = upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
      payout: {
        ...(draftAccount.payout || {}),
        pendingBalance: Math.max(0, pendingBalance - payoutAmount),
        paidOutTotal: Number(draftAccount?.payout?.paidOutTotal || 0) + payoutAmount,
        lastPayoutAt: payoutRun.createdAt,
        lastPayoutAmount: payoutRun.amount,
        lastPayoutTransferId: payoutRun.transferId,
        payoutRuns: [payoutRun, ...priorRuns].slice(0, 100)
      },
      stripe: {
        ...(draftAccount.stripe || {}),
        connectedAccountId,
        connectedAccountStatus: payoutsEnabled ? 'ready' : 'pending',
        connectOnboardingStatus: remoteAccount?.details_submitted ? 'completed' : 'pending',
        chargesEnabled,
        payoutsEnabled,
        lastSyncAt: nowIso(),
        mode: 'configured'
      }
    });
  });
  await touchEvent('PAYOUT', `${current.login} provider payout ${payoutAmount} -> ${transfer.id}`);
  return {
    ok: true,
    transfer_id: transfer.id,
    amount: payoutAmount,
    payout: payoutRun,
    pending_before: pendingBalance,
    pending_after: Math.max(0, pendingBalance - payoutAmount),
    account: sanitizeAccountSettingsForClient(updated)
  };
}

async function triggerStripeAutoTopupForCurrent(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const amount = displayCurrencyToLedgerAmount(Number(body?.amount || 0));
  const result = await attemptStripeAutoTopup(current, req, amount);
  if (!result.ok) return { error: result.error, code: result.code, statusCode: 400 };
  return { ok: true, amount: result.amount, payment_intent_id: result.intent?.id || null };
}

async function triggerStripeMonthlyInvoiceChargeForCurrent(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const config = currentStripeConfig(req);
  if (!stripeConfigured(config)) return { error: 'Stripe is not configured', code: 'stripe_not_configured', statusCode: 503 };
  const state = await storage.getState();
  const account = accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  if (String(account?.billing?.mode || '').toLowerCase() !== 'monthly_invoice') {
    return { error: 'Monthly billing is not selected for this account.', code: 'monthly_billing_not_selected', statusCode: 400 };
  }
  if (!account?.billing?.invoiceApproved) {
    return { error: 'Register a Stripe card before running month-end billing.', code: 'payment_method_missing', statusCode: 402 };
  }
  const customerId = account?.stripe?.customerId;
  const paymentMethodId = account?.stripe?.defaultPaymentMethodId;
  if (!customerId || !paymentMethodId) {
    return { error: 'Saved Stripe card is missing. Use REGISTER CARD first.', code: 'payment_method_missing', statusCode: 402 };
  }
  const arrearsTotal = Number(account?.billing?.arrearsTotal || 0);
  const requestedAmount = Number(body?.amount || 0) > 0 ? displayCurrencyToLedgerAmount(Number(body.amount || 0)) : arrearsTotal;
  const chargeAmount = Math.min(arrearsTotal, requestedAmount);
  if (!(chargeAmount > 0)) return { ok: true, amount: 0, skipped: true, reason: 'no_month_end_amount_due' };
  const period = String(body?.period || billingPeriodId()).trim() || billingPeriodId();
  const intent = await createOffSessionMonthlyInvoicePaymentIntent(config, {
    account,
    customerId,
    paymentMethodId,
    amount: ledgerAmountToDisplayCurrency(chargeAmount),
    currency: BILLING_DISPLAY_CURRENCY,
    ledgerAmount: chargeAmount,
    period
  });
  if (intent.status !== 'succeeded') {
    return { error: `Month-end charge did not complete (${intent.status})`, code: 'monthly_invoice_not_captured', statusCode: 402, intent_status: intent.status };
  }
  let updated = null;
  await storage.mutate(async (draft) => {
    const draftAccount = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
    const priorCharges = Array.isArray(draftAccount?.stripe?.monthlyInvoiceCharges) ? draftAccount.stripe.monthlyInvoiceCharges : [];
    const charge = {
      paymentIntentId: intent.id,
      amount: chargeAmount,
      currency: BILLING_DISPLAY_CURRENCY,
      period,
      status: intent.status,
      createdAt: nowIso()
    };
    updated = upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
      billing: {
        ...(draftAccount.billing || {}),
        arrearsTotal: Math.max(0, Number(draftAccount.billing?.arrearsTotal || 0) - chargeAmount)
      },
      stripe: {
        ...(draftAccount.stripe || {}),
        customerId,
        customerStatus: 'ready',
        defaultPaymentMethodId: paymentMethodId,
        defaultPaymentMethodStatus: 'ready',
        lastMonthlyInvoiceChargeAt: charge.createdAt,
        lastMonthlyInvoiceChargeAmount: chargeAmount,
        lastMonthlyInvoiceChargePeriod: period,
        monthlyInvoiceCharges: [charge, ...priorCharges].slice(0, 100),
        lastSyncAt: nowIso(),
        mode: 'configured'
      }
    });
  });
  await touchEvent('STRIPE', `${current.login} month-end charge succeeded ${chargeAmount}`);
  return { ok: true, amount: chargeAmount, payment_intent_id: intent.id, account: sanitizeAccountSettingsForClient(updated) };
}

async function triggerStripeProviderMonthlyChargeForCurrent(req) {
  const current = currentUserContext(req);
  if (!current.user) return { error: 'Login required', statusCode: 401 };
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return { error: error.message, statusCode: 400 };
  }
  const config = currentStripeConfig(req);
  if (!stripeConfigured(config)) return { error: 'Stripe is not configured', code: 'stripe_not_configured', statusCode: 503 };
  const state = await storage.getState();
  const account = accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  const customerId = account?.stripe?.customerId;
  const paymentMethodId = account?.stripe?.defaultPaymentMethodId;
  if (!customerId || !paymentMethodId) {
    return { error: 'Saved Stripe card is missing. Use REGISTER CARD first.', code: 'payment_method_missing', statusCode: 402 };
  }
  const period = String(body?.period || billingPeriodId()).trim() || billingPeriodId();
  const providerLedger = providerMonthlyBillingLedgerForLogin(state, current.login, period, account);
  const dueAmount = Number(providerLedger.dueAmount || 0);
  const requestedAmount = Number(body?.amount || 0) > 0 ? displayCurrencyToLedgerAmount(Number(body.amount || 0)) : dueAmount;
  const chargeAmount = Math.min(dueAmount, requestedAmount);
  if (!(providerLedger.agentCount > 0)) {
    return { ok: true, amount: 0, skipped: true, reason: 'no_provider_subscription_agents', provider_monthly: providerLedger };
  }
  if (!(chargeAmount > 0)) {
    return { ok: true, amount: 0, skipped: true, reason: 'no_provider_monthly_amount_due', provider_monthly: providerLedger };
  }
  const intent = await createOffSessionProviderMonthlyPaymentIntent(config, {
    account,
    customerId,
    paymentMethodId,
    amount: ledgerAmountToDisplayCurrency(chargeAmount),
    currency: BILLING_DISPLAY_CURRENCY,
    ledgerAmount: chargeAmount,
    period
  });
  if (intent.status !== 'succeeded') {
    return {
      error: `Provider monthly charge did not complete (${intent.status})`,
      code: 'provider_monthly_not_captured',
      statusCode: 402,
      intent_status: intent.status
    };
  }
  const charge = {
    id: `provider_monthly_${intent.id}`,
    paymentIntentId: intent.id,
    amount: chargeAmount,
    currency: BILLING_DISPLAY_CURRENCY,
    period,
    status: 'succeeded',
    lineItems: providerLedger.agents,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  let updated = null;
  await storage.mutate(async (draft) => {
    const draftAccount = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
    const history = recordProviderMonthlyChargeInAccount(draftAccount, charge);
    updated = upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
      stripe: {
        ...(draftAccount.stripe || {}),
        customerId,
        customerStatus: 'ready',
        defaultPaymentMethodId: paymentMethodId,
        defaultPaymentMethodStatus: 'ready',
        providerMonthlyCharges: history,
        lastProviderMonthlyChargeAt: charge.createdAt,
        lastProviderMonthlyChargeAmount: chargeAmount,
        lastProviderMonthlyChargePeriod: period,
        lastProviderMonthlyChargeStatus: 'succeeded',
        providerMonthlyRetryPeriod: null,
        providerMonthlyRetryCount: 0,
        providerMonthlyLastAttemptAt: charge.createdAt,
        providerMonthlyLastFailureAt: null,
        providerMonthlyLastFailureMessage: '',
        providerMonthlyLastNotificationAt: null,
        providerMonthlyLastNotificationPeriod: null,
        lastSyncAt: nowIso(),
        mode: 'configured'
      }
    });
  });
  const afterState = await storage.getState();
  const afterAccount = accountSettingsForLogin(afterState, current.login, current.user, current.authProvider);
  const afterLedger = providerMonthlyBillingLedgerForLogin(afterState, current.login, period, afterAccount);
  await touchEvent('STRIPE', `${current.login} provider monthly charge succeeded ${chargeAmount} period=${period}`);
  return {
    ok: true,
    amount: chargeAmount,
    payment_intent_id: intent.id,
    period,
    provider_monthly: afterLedger,
    account: sanitizeAccountSettingsForClient(updated)
  };
}

async function handleStripeWebhook(req) {
  const config = currentStripeConfig(req);
  if (!stripeConfigured(config)) return { error: 'Stripe is not configured', statusCode: 503 };
  const payload = await readRawBody(req);
  await verifyStripeWebhookSignature(payload, req.headers['stripe-signature'] || '', config.webhookSecret);
  const event = JSON.parse(payload || '{}');
  const result = await applyStripeWebhookEvent(event);
  return { ok: true, received: true, result };
}

async function performSingleJobCreate(req, body, current, options = {}) {
  const touchUsage = options.touchUsage || (async () => {});
  const requester = requesterContextFromUser(current.user, current.authProvider, {
    login: current.login,
    accountId: accountIdForLogin(current.login)
  });
  const taskType = inferTaskType(body.task_type, body.prompt);
  const state = await storage.getState();
  const account = current?.login ? accountSettingsForLogin(state, current.login, current.user, current.authProvider) : null;
  const billingMode = billingModeForRequester(current, account);
  const intakeClarification = buildIntakeClarification(body, { taskType });
  if (intakeClarification) {
    await touchUsage();
    return intakeClarification;
  }
  const followupConversation = buildFollowupConversationContext(state, body, { login: current?.login || '' });
  if (followupConversation?.error) {
    return {
      error: followupConversation.error,
      code: followupConversation.code,
      followup_to_job_id: followupConversation.followupToJobId,
      statusCode: followupConversation.statusCode || 400
    };
  }
  const promptOptimization = optimizeOrderPromptForBroker(body, { taskType });
  const executionPrompt = promptOptimization.optimized ? promptOptimization.prompt : body.prompt;
  const inputBase = body.input && typeof body.input === 'object' ? body.input : {};
  const inputSourceBase = mergeProtectedPromptSourceIntoInput(inputBase, promptOptimization);
  const chatSessionId = String(body.session_id || body.sessionId || inputSourceBase.session_id || inputSourceBase.sessionId || '').trim().slice(0, 160);
  const promptOptimizationMeta = promptOptimization.optimized ? promptOptimization.metadata : null;
  const optimizationLog = promptOptimization.optimized
    ? `prompt optimized mode=${promptOptimization.mode} originalChars=${promptOptimization.originalChars} optimizedChars=${promptOptimization.optimizedChars} outputLanguage=${promptOptimization.outputLanguageCode}`
    : null;
  const input = {
    ...inputSourceBase,
    ...(chatSessionId && !inputSourceBase.session_id && !inputSourceBase.sessionId ? { session_id: chatSessionId } : {}),
    ...(promptOptimizationMeta && !inputSourceBase.output_language && !inputSourceBase.outputLanguage
      ? { output_language: promptOptimization.outputLanguageCode }
      : {}),
    _broker: {
      ...((inputSourceBase && inputSourceBase._broker) || {}),
      requester,
      billingMode,
      ...(chatSessionId ? { chatSessionId } : {}),
      ...(promptOptimizationMeta ? { promptOptimization: promptOptimizationMeta } : {}),
      ...(followupConversation ? { conversation: followupConversation } : {})
    }
  };
  await touchEvent('JOB', `parent ${body.parent_agent_id} requested ${taskType}`);
  const requestedAgentId = String(body.agent_id || '').trim();
  const picked = pickAgent(state.agents, taskType, body.budget_cap || 0, requestedAgentId, {
    body,
    scheduled: Boolean(body?.input?._broker?.recurring),
    recurring: Boolean(body?.input?._broker?.recurring)
  });
  if (picked?.error) {
    return {
      error: picked.error,
      requested_agent_id: requestedAgentId,
      inferred_task_type: taskType,
      statusCode: 400
    };
  }
  if (!picked) {
    const failedJob = {
      id: randomUUID(),
      jobKind: body.workflow_parent_id ? 'workflow_child' : 'job',
      parentAgentId: body.parent_agent_id,
      taskType,
      prompt: executionPrompt,
      ...(promptOptimization.optimized ? { originalPrompt: promptOptimization.originalPrompt, promptOptimization } : {}),
      input,
      budgetCap: body.budget_cap || null,
      deadlineSec: body.deadline_sec || null,
      priority: body.priority || 'normal',
      status: 'failed',
      assignedAgentId: null,
      score: null,
      createdAt: nowIso(),
      failedAt: nowIso(),
      failureReason: 'No agent available',
      workflowParentId: body.workflow_parent_id || null,
      workflowTask: body.workflow_task || taskType,
      workflowAgentName: null,
      logs: [
        `created by ${body.parent_agent_id}`,
        ...(followupConversation ? [`follow-up to ${followupConversation.followupToJobId} turn=${followupConversation.turn}`] : []),
        ...(optimizationLog ? [optimizationLog] : []),
        'matching failed: no agent available'
      ]
    };
    await storage.mutate(async (draft) => { draft.jobs.unshift(failedJob); });
    await touchEvent('FAILED', `${taskType}/${failedJob.id.slice(0, 6)} no agent available`);
    if (failedJob.workflowParentId) await reconcileWorkflowParent(failedJob.workflowParentId);
    await touchUsage();
    return {
      job_id: failedJob.id,
      status: 'failed',
      failure_reason: failedJob.failureReason,
      inferred_task_type: taskType,
      workflow_parent_id: failedJob.workflowParentId,
      statusCode: 201
    };
  }

  const preflight = orderPreflightForAgent(picked.agent, current, account, body, {
    scheduled: Boolean(body?.input?._broker?.recurring)
  });
  if (!preflight.ok) {
    await touchUsage();
    return {
      ...preflight,
      inferred_task_type: taskType,
      requested_agent_id: requestedAgentId,
      statusCode: preflight.statusCode || 400
    };
  }
  input._broker.agentPreflight = {
    agentId: picked.agent.id,
    riskLevel: preflight.profile?.riskLevel || 'safe',
    requiredConnectors: preflight.profile?.requiredConnectors || [],
    requiredConnectorCapabilities: preflight.profile?.requiredConnectorCapabilities || [],
    authorityStatus: preflight.authority_status || 'ready',
    connectorStatus: preflight.connector_status || {},
    grantedConnectorCapabilities: preflight.granted_connector_capabilities || [],
    warning: preflight.warning || ''
  };

  const estimatedBilling = estimateBilling(picked.agent, {
    api_cost: Number(body.estimated_api_cost || 100),
    total_cost_basis: Number(body.estimated_total_cost_basis || 0) || undefined,
    cost_basis: body.estimated_cost_basis || undefined
  });
  const job = {
    id: randomUUID(),
    jobKind: body.workflow_parent_id ? 'workflow_child' : 'job',
    parentAgentId: body.parent_agent_id,
    taskType,
    prompt: executionPrompt,
    ...(promptOptimization.optimized ? { originalPrompt: promptOptimization.originalPrompt, promptOptimization } : {}),
    input,
    budgetCap: body.budget_cap || null,
    deadlineSec: body.deadline_sec || null,
    priority: body.priority || 'normal',
    status: 'queued',
    assignedAgentId: picked.agent.id,
    score: picked.score,
    createdAt: nowIso(),
    callbackToken: null,
    workflowParentId: body.workflow_parent_id || null,
    workflowTask: body.workflow_task || taskType,
    workflowAgentName: picked.agent.name,
    billingEstimate: estimatedBilling,
    estimateWindow: estimateRunWindow(picked.agent, taskType),
    logs: [
      `created by ${body.parent_agent_id}`,
      ...(followupConversation ? [`follow-up to ${followupConversation.followupToJobId} turn=${followupConversation.turn}`] : []),
      ...(optimizationLog ? [optimizationLog] : []),
      preflight.warning ? `preflight warning: ${preflight.warning}` : 'preflight ok',
      `${picked.selectionMode === 'manual' ? 'manually selected' : 'matched to'} ${picked.agent.id} score=${picked.score} source=${isBuiltInAgent(picked.agent) ? 'built-in-fallback' : 'provider'}`,
      `inferred taskType=${taskType}`
    ],
    selectionMode: picked.selectionMode
  };
  job.callbackToken = callbackTokenForJob(job);
  let funding = null;
  const reserveAndInsert = async () => {
    funding = null;
    await storage.mutate(async (draft) => {
      if (current?.login) {
        funding = reserveBillingEstimateInState(draft, current.login, current.user, current.authProvider, estimatedBilling.total, {
          apiKeyMode: billingApiKeyModeForRequester(current),
          period: billingPeriodId(),
          at: job.createdAt
        });
        if (!funding?.ok) return;
      }
      job.billingReservation = funding?.reservation || {
        period: billingPeriodId(job.createdAt),
        mode: billingMode,
        estimatedTotal: estimatedBilling.total,
        reservedCredits: 0,
        reservedDeposit: 0,
        autoTopupAdded: 0,
        overageMode: null
      };
      if (job.billingReservation.autoTopupAdded > 0) {
        job.logs.push(`auto top-up added ${job.billingReservation.autoTopupAdded}`);
      }
      draft.jobs.unshift(job);
    });
  };
  await reserveAndInsert();
  let stripeFunding = null;
  if (current?.login && funding && !funding.ok && funding.code === 'insufficient_deposit') {
    const latestState = await storage.getState();
    const latestAccount = accountSettingsForLogin(latestState, current.login, current.user, current.authProvider);
    if (latestAccount?.billing?.autoTopupEnabled) {
      try {
        stripeFunding = await attemptStripeAutoTopup(current, req, estimatedBilling.total);
        if (stripeFunding?.ok) await reserveAndInsert();
      } catch (error) {
        stripeFunding = { ok: false, code: 'stripe_auto_topup_failed', error: error.message };
      }
    }
  }
  if (current?.login && funding && !funding.ok) {
    await touchUsage();
    const guestLimitExceeded = current?.guestTrial && ['insufficient_deposit', 'payment_required'].includes(String(funding.code || ''));
    return {
      error: guestLimitExceeded
        ? `Guest trial covers one order up to ${current.guestTrial.limit || 500} points. Sign in to continue with this larger order.`
        : (stripeFunding?.error || funding.error),
      code: guestLimitExceeded ? 'guest_trial_limit_exceeded' : (stripeFunding?.code || funding.code),
      inferred_task_type: taskType,
      requested_agent_id: requestedAgentId,
      estimated_cost: estimatedBilling,
      billing_profile: funding.profile || null,
      missing_amount: funding.missingAmount || 0,
      stripe_auto_topup: stripeFunding || null,
      statusCode: 402
    };
  }
  await touchEvent('MATCHED', `${job.taskType}/${job.id.slice(0, 6)} -> ${picked.agent.name}`);
  if (job.workflowParentId) await reconcileWorkflowParent(job.workflowParentId);

  if (!resolveAgentJobEndpoint(picked.agent)) {
    await touchUsage();
    return {
      job_id: job.id,
      matched_agent_id: job.assignedAgentId,
      selection_mode: picked.selectionMode,
      inferred_task_type: taskType,
      status: 'queued',
      workflow_parent_id: job.workflowParentId,
      statusCode: 201
    };
  }

  try {
    const dispatch = await dispatchJobToAssignedAgent(job, picked.agent);
    const final = await storage.mutate(async (draft) => {
      const draftJob = draft.jobs.find(j => j.id === job.id);
      const draftAgent = draft.agents.find(a => a.id === picked.agent.id);
      if (!draftJob) return { error: 'Job disappeared during dispatch', statusCode: 500 };
      if (!dispatch.ok) {
        const failureMeta = buildDispatchFailureMeta(draftJob, dispatch.statusCode, dispatch.failureReason);
        draftJob.status = 'failed';
        draftJob.failedAt = nowIso();
        draftJob.failureReason = dispatch.failureReason;
        draftJob.failureCategory = failureMeta.category;
        if (draftJob.billingReservation && !draftJob.billingReservation?.releasedAt) {
          releaseBillingReservationInState(draft, draftJob);
        }
        draftJob.dispatch = {
          ...(draftJob.dispatch || {}),
          endpoint: dispatch.endpoint || draftJob.dispatch?.endpoint || null,
          statusCode: dispatch.statusCode || null,
          responseStatus: dispatch.responseBody?.status || null,
          lastAttemptAt: nowIso(),
          attempts: failureMeta.attempts,
          retryable: failureMeta.retryable,
          nextRetryAt: failureMeta.nextRetryAt,
          completionStatus: 'failed'
        };
        draftJob.logs.push(`dispatch failed for ${picked.agent.id}`, dispatch.failureReason, `retryable=${failureMeta.retryable}`);
        return { ok: true, mode: 'failed', job: draftJob };
      }

      draftJob.dispatchedAt = nowIso();
      draftJob.startedAt = draftJob.startedAt || draftJob.dispatchedAt;
      draftJob.status = 'dispatched';
      draftJob.completedAt = null;
      draftJob.failedAt = null;
      draftJob.timedOutAt = null;
      draftJob.failureReason = null;
      draftJob.failureCategory = null;
      draftJob.dispatch = {
        endpoint: dispatch.endpoint,
        statusCode: dispatch.statusCode,
        externalJobId: dispatch.normalized.externalJobId,
        responseStatus: dispatch.normalized.status,
        lastAttemptAt: nowIso(),
        attempts: Number(draftJob.dispatch?.attempts || 0) + 1,
        retryable: false,
        nextRetryAt: null,
        completionStatus: dispatch.normalized.completed ? 'completed' : 'accepted'
      };
      draftJob.logs.push(`dispatched to ${picked.agent.id} endpoint=${dispatch.endpoint}`);

      if (dispatch.normalized.completed) {
        const billing = estimateBilling(picked.agent, dispatch.normalized.usage);
        draftJob.status = 'completed';
        draftJob.completedAt = nowIso();
        draftJob.usage = dispatch.normalized.usage;
        draftJob.output = {
          report: dispatch.normalized.report,
          files: dispatch.normalized.files,
          returnTargets: dispatch.normalized.returnTargets
        };
        draftJob.actualBilling = billing;
        draftJob.deliveryQuality = {
          score: deliveryQualityScoreForJob(draftJob),
          version: 'delivery-quality/v1',
          checkedAt: draftJob.completedAt
        };
        draftJob.logs.push(`completed by dispatch response from ${picked.agent.id}`, billingLogLine(draftJob, billing), `delivery quality score=${draftJob.deliveryQuality.score}`);
        settleAgentEarnings(draftJob, draftAgent, billing);
        return { ok: true, mode: 'completed', job: draftJob, billing };
      }

      draftJob.logs.push(`dispatch accepted by ${picked.agent.id} status=${dispatch.normalized.status}`);
      return { ok: true, mode: 'dispatched', job: draftJob };
    });

    if (final.error) return { error: final.error, statusCode: final.statusCode || 500 };
    if (final.mode === 'failed') {
      await touchEvent('FAILED', `${job.taskType}/${job.id.slice(0, 6)} dispatch failed`);
      await touchUsage();
      if (job.workflowParentId) await reconcileWorkflowParent(job.workflowParentId);
      return {
        job_id: job.id,
        matched_agent_id: job.assignedAgentId,
        selection_mode: picked.selectionMode,
        inferred_task_type: taskType,
        status: 'failed',
        failure_reason: final.job.failureReason,
        estimated_cost: job.billingEstimate,
        estimate_window: job.estimateWindow,
        workflow_parent_id: job.workflowParentId,
        statusCode: 201
      };
    }
    if (final.mode === 'completed') {
      await touchEvent('COMPLETED', `${job.taskType}/${job.id.slice(0, 6)} completed by external dispatch`);
      await recordBillingOutcome(final.job, final.billing, 'external-dispatch');
      await touchUsage();
      if (job.workflowParentId) await reconcileWorkflowParent(job.workflowParentId);
      return {
        job_id: job.id,
        matched_agent_id: job.assignedAgentId,
        selection_mode: picked.selectionMode,
        inferred_task_type: taskType,
        status: 'completed',
        estimated_cost: job.billingEstimate,
        estimate_window: job.estimateWindow,
        actual_billing: final.billing,
        workflow_parent_id: job.workflowParentId,
        delivery: {
          report: final.job.output?.report || null,
          files: final.job.output?.files || [],
          returnTargets: final.job.output?.returnTargets || ['api']
        },
        statusCode: 201
      };
    }
    await touchEvent('RUNNING', `${picked.agent.name} accepted external dispatch for ${job.taskType}/${job.id.slice(0, 6)}`);
    await touchUsage();
    if (job.workflowParentId) await reconcileWorkflowParent(job.workflowParentId);
    return {
      job_id: job.id,
      matched_agent_id: job.assignedAgentId,
      selection_mode: picked.selectionMode,
      estimated_cost: job.billingEstimate,
      estimate_window: job.estimateWindow,
      inferred_task_type: taskType,
      status: 'dispatched',
      workflow_parent_id: job.workflowParentId,
      statusCode: 201
    };
  } catch (error) {
    const failureMeta = buildDispatchFailureMeta(job, 0, error.message);
    const failed = await failJob(job.id, error.message, [`dispatch exception for ${picked.agent.id}`], {
      failureCategory: failureMeta.category,
      retryable: failureMeta.retryable,
      nextRetryAt: failureMeta.nextRetryAt,
      attempts: failureMeta.attempts
    });
    await touchEvent('FAILED', `${job.taskType}/${job.id.slice(0, 6)} dispatch exception`);
    await touchUsage();
    if (job.workflowParentId) await reconcileWorkflowParent(job.workflowParentId);
    return {
      job_id: job.id,
      matched_agent_id: job.assignedAgentId,
      selection_mode: picked.selectionMode,
      estimated_cost: job.billingEstimate,
      estimate_window: job.estimateWindow,
      inferred_task_type: taskType,
      status: failed?.status || 'failed',
      failure_reason: failed?.failureReason || error.message,
      workflow_parent_id: job.workflowParentId,
      statusCode: 201
    };
  }
}

async function handleCreateWorkflowJob(req, body, current, options = {}) {
  if (String(body.agent_id || '').trim()) {
    return { error: 'Multi-agent objective does not support a single pinned agent. Clear the pin and retry.', statusCode: 400 };
  }
  const taskType = inferTaskType(body.task_type, body.prompt);
  const intakeClarification = buildIntakeClarification(body, { taskType });
  if (intakeClarification) {
    await (options.touchUsage || (async () => {}))();
    return intakeClarification;
  }
  const state = await storage.getState();
  const plan = options.workflowPlan || planWorkflowSelections(state.agents, taskType, body.prompt, body.budget_cap || 0);
  if (plan.selections.length < 2) {
    return {
      error: 'Need at least 2 ready agents for an Agent Team objective. Register or verify more agents first.',
      statusCode: 400,
      planned_task_types: plan.plannedTasks,
      ready_agent_count: plan.selections.length
    };
  }
  const requester = requesterContextFromUser(current.user, current.authProvider, {
    login: current.login,
    accountId: accountIdForLogin(current.login)
  });
  const account = current?.login ? accountSettingsForLogin(state, current.login, current.user, current.authProvider) : null;
  const billingMode = billingModeForRequester(current, account);
  const followupConversation = buildFollowupConversationContext(state, body, { login: current?.login || '' });
  if (followupConversation?.error) {
    return {
      error: followupConversation.error,
      code: followupConversation.code,
      followup_to_job_id: followupConversation.followupToJobId,
      statusCode: followupConversation.statusCode || 400
    };
  }
  const promptOptimization = optimizeOrderPromptForBroker(body, { taskType });
  const inputBase = body.input && typeof body.input === 'object' ? body.input : {};
  const inputSourceBase = mergeProtectedPromptSourceIntoInput(inputBase, promptOptimization);
  const chatSessionId = String(body.session_id || body.sessionId || inputSourceBase.session_id || inputSourceBase.sessionId || '').trim().slice(0, 160);
  const promptOptimizationMeta = promptOptimization.optimized ? promptOptimization.metadata : null;
  const parentInput = {
    ...inputSourceBase,
    ...(chatSessionId && !inputSourceBase.session_id && !inputSourceBase.sessionId ? { session_id: chatSessionId } : {}),
    ...(promptOptimizationMeta && !inputSourceBase.output_language && !inputSourceBase.outputLanguage
      ? { output_language: promptOptimization.outputLanguageCode }
      : {}),
    _broker: {
      ...((inputSourceBase && inputSourceBase._broker) || {}),
      requester,
      billingMode,
      ...(chatSessionId ? { chatSessionId } : {}),
      ...(promptOptimizationMeta ? { promptOptimization: promptOptimizationMeta } : {}),
      ...(followupConversation ? { conversation: followupConversation } : {})
    }
  };
  const parentJob = buildWorkflowParentJob(body, parentInput, plan, taskType, { promptOptimization });
  await storage.mutate(async (draft) => { draft.jobs.unshift(parentJob); });
  await touchEvent('JOB', `parent ${body.parent_agent_id} requested Agent Team objective ${parentJob.id.slice(0, 6)}`);
  const childRuns = [];
  for (const selection of plan.selections) {
    const childResult = await performSingleJobCreate(req, {
      ...body,
      order_strategy: 'single',
      task_type: selection.taskType,
      agent_id: selection.agent.id,
      workflow_parent_id: parentJob.id,
      workflow_task: selection.taskType
    }, current, options);
    childRuns.push({
      job_id: childResult.job_id || null,
      task_type: selection.taskType,
      agent_id: selection.agent.id,
      agent_name: selection.agent.name,
      status: childResult.status || 'failed',
      failure_reason: childResult.failure_reason || null
    });
  }
  const finalParent = await reconcileWorkflowParent(parentJob.id);
  await touchEvent('MATCHED', `workflow ${parentJob.id.slice(0, 6)} planned ${childRuns.length} child runs`);
  return {
    workflow_job_id: parentJob.id,
    job_ids: childRuns.map((item) => item.job_id).filter(Boolean),
    child_runs: childRuns,
    planned_task_types: plan.plannedTasks,
    matched_agent_ids: childRuns.map((item) => item.agent_id),
    status: finalParent?.status || 'queued',
    mode: 'workflow',
    selection_mode: 'multi',
    statusCode: 201
  };
}

function currentFromRecurringOrder(state, order = {}) {
  const login = String(order.ownerLogin || order.owner_login || '').trim();
  const account = login ? accountSettingsForLogin(state, login, order.user || { login }, order.authProvider || 'scheduled') : null;
  const user = order.user && typeof order.user === 'object'
    ? { ...order.user, login }
    : (accountUserFromSettings(account) || { login, name: login });
  return {
    session: null,
    user,
    login,
    authProvider: 'scheduled',
    account,
    apiKeyStatus: 'scheduled',
    apiKey: null
  };
}

async function listRecurringOrdersForRequest(req) {
  const state = await storage.getState();
  const current = currentOrderRequesterContext(state, req);
  if (!current.user && current.apiKeyStatus === 'invalid') return { error: 'Invalid API key', statusCode: 401 };
  if (!current.user && current.apiKeyStatus !== 'valid') return { error: 'Login or CAIt API key required', statusCode: 401 };
  if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
  return { ok: true, recurringOrders: recurringOrdersVisibleToLogin(state, current.login) };
}

function promptPolicyBlockPayload(promptGuard = {}) {
  const policyBlocked = String(promptGuard.code || '').startsWith('stripe_prohibited_');
  return {
    error: policyBlocked ? 'Request blocked by CAIt policy' : 'Prompt injection blocked by CAIt',
    code: policyBlocked ? 'prohibited_category_blocked' : 'prompt_injection_blocked',
    reason: promptGuard.reason,
    reason_code: promptGuard.code,
    statusCode: 400
  };
}

async function createRecurringOrderForRequest(req) {
  const state = await storage.getState();
  const current = currentOrderRequesterContext(state, req);
  const access = requireOrderWriteAccess(req, current);
  if (access.error) return { error: access.error, statusCode: access.statusCode || 400 };
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return { error: body.__error, statusCode: 400 };
  const promptInjection = promptInjectionGuardForPrompt(body.prompt || '');
  if (promptInjection.blocked) {
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return promptPolicyBlockPayload(promptInjection);
  }
  let result = null;
  await storage.mutate(async (draft) => {
    result = createRecurringOrderInState(draft, body, current);
  });
  if (result?.error) return result;
  await touchEvent('RECURRING', `scheduled work ${result.recurringOrder.id.slice(0, 12)} created`, {
    recurringOrderId: result.recurringOrder.id,
    ownerLogin: current.login,
    interval: result.recurringOrder.schedule?.interval || 'daily',
    nextRunAt: result.recurringOrder.nextRunAt || null
  });
  if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
  return { ok: true, recurring_order: result.recurringOrder, statusCode: 201 };
}

async function updateRecurringOrderForRequest(req, recurringOrderId) {
  const state = await storage.getState();
  const current = currentOrderRequesterContext(state, req);
  const access = requireOrderWriteAccess(req, current);
  if (access.error) return { error: access.error, statusCode: access.statusCode || 400 };
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return { error: body.__error, statusCode: 400 };
  const promptInjection = body.prompt !== undefined ? promptInjectionGuardForPrompt(body.prompt || '') : { blocked: false };
  if (promptInjection.blocked) {
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return promptPolicyBlockPayload(promptInjection);
  }
  let result = null;
  await storage.mutate(async (draft) => {
    result = updateRecurringOrderInState(draft, recurringOrderId, body, current);
  });
  if (result?.error) return result;
  await touchEvent('RECURRING', `scheduled work ${result.recurringOrder.id.slice(0, 12)} updated`, {
    recurringOrderId: result.recurringOrder.id,
    status: result.recurringOrder.status,
    nextRunAt: result.recurringOrder.nextRunAt || null
  });
  if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
  return { ok: true, recurring_order: result.recurringOrder };
}

async function deleteRecurringOrderForRequest(req, recurringOrderId) {
  const state = await storage.getState();
  const current = currentOrderRequesterContext(state, req);
  const access = requireOrderWriteAccess(req, current);
  if (access.error) return { error: access.error, statusCode: access.statusCode || 400 };
  let result = null;
  await storage.mutate(async (draft) => {
    result = deleteRecurringOrderInState(draft, recurringOrderId, current);
  });
  if (result?.error) return result;
  await touchEvent('RECURRING', `scheduled work ${result.recurringOrder.id.slice(0, 12)} deleted`, {
    recurringOrderId: result.recurringOrder.id
  });
  if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
  return { ok: true, recurring_order: result.recurringOrder };
}

async function runRecurringOrderSweep(req, options = {}) {
  const at = options.at || nowIso();
  const state = await storage.getState();
  const due = dueRecurringOrders(state, at, options.limit || 10);
  const results = [];
  for (const order of due) {
    const latestState = await storage.getState();
    const fresh = (latestState.recurringOrders || []).find((item) => item.id === order.id) || order;
    const current = currentFromRecurringOrder(latestState, fresh);
    let result;
    const exactAction = exactConnectorActionFromRecurringOrder(fresh);
    if (exactAction) {
      result = await executeScheduledExactConnectorAction(fresh, current);
    } else {
      const body = recurringOrderToJobPayload(fresh);
      const promptInjection = promptInjectionGuardForPrompt(body.prompt || '');
      if (promptInjection.blocked) {
        result = promptPolicyBlockPayload(promptInjection);
      } else {
        const requestedStrategy = normalizeOrderStrategy(body.order_strategy || body.orderStrategy || 'auto');
        const taskType = inferTaskType(body.task_type, body.prompt);
        const resolved = resolveOrderStrategy(latestState.agents || [], body, taskType, requestedStrategy);
        result = resolved.strategy === 'multi'
          ? await handleCreateWorkflowJob(req, body, current, { workflowPlan: resolved.plan })
          : await performSingleJobCreate(req, body, current, {});
        if (!result.error) {
          result.order_strategy_requested = requestedStrategy;
          result.order_strategy_resolved = resolved.strategy;
          result.routing_reason = resolved.reason;
        }
      }
    }
    let updated = null;
    await storage.mutate(async (draft) => {
      updated = markRecurringOrderRunInState(draft, fresh.id, result, { at: nowIso() });
    });
    const summary = {
      recurring_order_id: fresh.id,
      job_id: result.job_id || null,
      workflow_job_id: result.workflow_job_id || null,
      status: result.status || result.mode || (result.error ? 'failed' : 'created'),
      error: result.error || null,
      next_run_at: updated?.nextRunAt || null
    };
    results.push(summary);
    await touchEvent('RECURRING', `scheduled work ${fresh.id.slice(0, 12)} run ${summary.status}`, summary);
  }
  return { ok: true, checked_at: at, due_count: due.length, results };
}

function xCallbackUrl(req) {
  return String(process.env.X_CALLBACK_URL || '').trim() || `${baseUrl(req)}/auth/x/callback`;
}

function xAuthErrorRedirect(code = 'x_auth_failed') {
  return `/?auth_error=${encodeURIComponent(code)}`;
}

async function handleXAuthStart(req, res) {
  if (!xOAuthConfigured(process.env)) return json(res, 503, { error: 'X OAuth is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET.' });
  if (!xTokenEncryptionConfigured(process.env)) return json(res, 503, { error: 'X token encryption is not configured. Set X_TOKEN_ENCRYPTION_KEY to base64 32 bytes.' });
  const current = currentUserContext(req);
  if (!current?.login) return redirect(res, xAuthErrorRedirect('login_required_for_x'));
  const state = randomBytes(24).toString('base64url');
  const pkce = await buildXPkcePair();
  oauthStates.set(state, {
    createdAt: Date.now(),
    provider: 'x-oauth',
    action: 'connect',
    accountLogin: current.login,
    codeVerifier: pkce.verifier
  });
  const authUrl = buildXAuthorizeUrl(process.env, {
    callbackUrl: xCallbackUrl(req),
    state,
    codeChallenge: pkce.challenge
  });
  return redirect(res, authUrl.toString());
}

async function handleXAuthCallback(req, res, url) {
  if (!xOAuthConfigured(process.env)) return redirect(res, xAuthErrorRedirect('x_not_configured'));
  if (!xTokenEncryptionConfigured(process.env)) return redirect(res, xAuthErrorRedirect('x_token_encryption_not_configured'));
  const code = String(url.searchParams.get('code') || '').trim();
  const state = String(url.searchParams.get('state') || '').trim();
  const errorParam = String(url.searchParams.get('error') || '').trim();
  if (errorParam) return redirect(res, xAuthErrorRedirect(`x_oauth_${errorParam}`));
  if (!code || !state || !oauthStates.has(state)) return redirect(res, xAuthErrorRedirect('invalid_x_oauth_state'));
  const oauthState = oauthStates.get(state);
  oauthStates.delete(state);
  if (oauthState?.provider !== 'x-oauth' || !oauthState?.codeVerifier || !oauthState?.accountLogin) {
    return redirect(res, xAuthErrorRedirect('invalid_x_oauth_state'));
  }
  const current = currentUserContext(req);
  if (!current?.login) return redirect(res, xAuthErrorRedirect('login_required_for_x'));
  if (String(current.login).toLowerCase() !== String(oauthState.accountLogin).toLowerCase()) {
    return redirect(res, xAuthErrorRedirect('x_oauth_account_mismatch'));
  }
  try {
    const token = await exchangeXOAuthCode(process.env, {
      code,
      codeVerifier: oauthState.codeVerifier,
      callbackUrl: xCallbackUrl(req)
    });
    const profile = await fetchXProfile(token.access_token);
    if (!profile?.id || !profile?.username) throw new Error('X profile missing id or username.');
    await storage.mutate(async (draft) => {
      const account = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
      const existingX = account?.connectors?.x || {};
      const x = await xConnectorFromOAuthToken(process.env, profile, token, existingX);
      upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
        connectors: {
          ...(account.connectors || {}),
          x
        }
      });
    });
    await touchEvent('X_CONNECTED', `${current.login} connected X @${profile.username}`, {
      login: current.login,
      username: profile.username
    });
    return redirect(res, '/?connect=x_connected', { 'Cache-Control': 'no-store' });
  } catch (error) {
    return redirect(res, xAuthErrorRedirect(error.message || 'x_callback_failed'));
  }
}

async function handleXConnectorStatus(req, res) {
  const state = await storage.getState();
  const current = currentAgentRequesterContext(state, req);
  if (!current?.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
  if (!current?.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
  const account = current.account || accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
  return json(res, 200, {
    ok: true,
    x: publicXConnectorStatus(account?.connectors?.x || null, process.env)
  });
}

async function handleXConnectorPost(req, res) {
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return json(res, 400, { error: body.__error });
  if (!(body.confirm_post === true || body.confirmPost === true)) {
    return json(res, 428, {
      error: 'Explicit confirmation required before posting to X.',
      required: 'confirm_post=true'
    });
  }
  const validation = validateXPostText(body.text || body.post || body.tweet || '');
  if (!validation.ok) return json(res, 400, { error: validation.error, length: validation.length || 0 });
  const state = await storage.getState();
  const current = currentAgentRequesterContext(state, req);
  if (!current?.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
  if (!current?.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
  const account = current.account || accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  const connector = account?.connectors?.x || null;
  if (!connector?.connected || !connector?.accessTokenEnc) {
    return json(res, 409, {
      error: 'X connection required before posting.',
      action: connectorOAuthActionInstruction('connect_x')
    });
  }
  try {
    const posted = await postXTweet(process.env, connector, {
      text: validation.text,
      replyToTweetId: body.reply_to_tweet_id || body.replyToTweetId || ''
    });
    let updated = null;
    await storage.mutate(async (draft) => {
      const latest = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
      updated = upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
        connectors: {
          ...(latest.connectors || {}),
          x: posted.connector
        }
      });
    });
    await touchEvent('X_POSTED', `${current.login} posted to X`, {
      login: current.login,
      tweetId: posted.tweetId,
      url: posted.url,
      source: String(body.source || 'web')
    });
    return json(res, 201, {
      ok: true,
      tweet_id: posted.tweetId,
      url: posted.url,
      x: publicXConnectorStatus(updated?.connectors?.x || posted.connector, process.env)
    });
  } catch (error) {
    return json(res, Number(error?.statusCode || 502), { error: error.message || 'X post failed' });
  } finally {
    if (current?.apiKey?.id) await recordOrderApiKeyUsage(current, req);
  }
}

async function handleGoogleConnectorAssets(req, res) {
  const state = await storage.getState();
  const current = currentAgentRequesterContext(state, req);
  if (!current?.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
  if (!current?.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
  const url = new URL(req.url, 'http://localhost');
  const requestedGroups = Array.from(new Set(
    url.searchParams
      .getAll('include')
      .flatMap((value) => String(value || '').split(','))
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => ['gsc', 'ga4', 'drive', 'calendar', 'gmail'].includes(value))
  ));
  const includeGroups = requestedGroups.length ? requestedGroups : ['gsc', 'ga4'];
  const requestedCapabilities = Array.from(new Set(includeGroups.flatMap((group) => {
    if (group === 'gsc') return ['google.read_gsc'];
    if (group === 'ga4') return ['google.read_ga4'];
    if (group === 'drive') return ['google.read_drive'];
    if (group === 'calendar') return ['google.read_calendar'];
    if (group === 'gmail') return ['google.read_gmail'];
    return [];
  })));
  const account = current.account || accountSettingsForLogin(state, current.login, current.user, current.authProvider);
  const connector = googleConnectorForAccount(account);
  if (!connector?.connected || !connector?.accessTokenEnc) {
    return json(res, 409, {
      error: 'Google connection required before CAIt can read the requested Google sources.',
      missing_connectors: ['google'],
      missing_connector_capabilities: requestedCapabilities,
      action: connectorActionLabel('connect_google')
    });
  }
  try {
    const tokenInfo = await googleAccessTokenForConnector(current.login, current.user, current.authProvider, connector);
    const [sitesResult, ga4Result, driveResult, calendarResult, gmailProfileResult, gmailLabelsResult] = await Promise.allSettled([
      includeGroups.includes('gsc')
        ? fetchGoogleAuthorizedJson('https://www.googleapis.com/webmasters/v3/sites', tokenInfo.accessToken)
        : Promise.resolve(null),
      includeGroups.includes('ga4')
        ? fetchGoogleAuthorizedJson('https://analyticsadmin.googleapis.com/v1alpha/accountSummaries?pageSize=200', tokenInfo.accessToken)
        : Promise.resolve(null),
      includeGroups.includes('drive')
        ? fetchGoogleAuthorizedJson('https://www.googleapis.com/drive/v3/files?pageSize=50&fields=files(id,name,mimeType,webViewLink,modifiedTime)', tokenInfo.accessToken)
        : Promise.resolve(null),
      includeGroups.includes('calendar')
        ? fetchGoogleAuthorizedJson('https://www.googleapis.com/calendar/v3/users/me/calendarList', tokenInfo.accessToken)
        : Promise.resolve(null),
      includeGroups.includes('gmail')
        ? fetchGoogleAuthorizedJson('https://gmail.googleapis.com/gmail/v1/users/me/profile', tokenInfo.accessToken)
        : Promise.resolve(null),
      includeGroups.includes('gmail')
        ? fetchGoogleAuthorizedJson('https://gmail.googleapis.com/gmail/v1/users/me/labels', tokenInfo.accessToken)
        : Promise.resolve(null)
    ]);
    const sites = sitesResult.status === 'fulfilled'
      ? (Array.isArray(sitesResult.value?.siteEntry) ? sitesResult.value.siteEntry : []).map((site) => ({
          siteUrl: String(site?.siteUrl || ''),
          permissionLevel: String(site?.permissionLevel || '')
        }))
      : [];
    const accountSummaries = ga4Result.status === 'fulfilled'
      ? (Array.isArray(ga4Result.value?.accountSummaries) ? ga4Result.value.accountSummaries : []).map((summary) => ({
          name: String(summary?.name || ''),
          displayName: String(summary?.displayName || ''),
          propertySummaries: Array.isArray(summary?.propertySummaries)
            ? summary.propertySummaries.slice(0, 50).map((property) => ({
                property: String(property?.property || ''),
                displayName: String(property?.displayName || ''),
                propertyType: String(property?.propertyType || '')
              }))
            : []
        }))
      : [];
    const driveFiles = driveResult.status === 'fulfilled'
      ? (Array.isArray(driveResult.value?.files) ? driveResult.value.files : []).map((file) => ({
          id: String(file?.id || ''),
          name: String(file?.name || ''),
          mimeType: String(file?.mimeType || ''),
          webViewLink: String(file?.webViewLink || ''),
          modifiedTime: String(file?.modifiedTime || '')
        }))
      : [];
    const calendars = calendarResult.status === 'fulfilled'
      ? (Array.isArray(calendarResult.value?.items) ? calendarResult.value.items : []).map((item) => ({
          id: String(item?.id || ''),
          summary: String(item?.summary || ''),
          primary: item?.primary === true,
          accessRole: String(item?.accessRole || '')
        }))
      : [];
    const gmailProfile = gmailProfileResult.status === 'fulfilled'
      ? {
          emailAddress: String(gmailProfileResult.value?.emailAddress || ''),
          messagesTotal: Number(gmailProfileResult.value?.messagesTotal || 0),
          threadsTotal: Number(gmailProfileResult.value?.threadsTotal || 0)
        }
      : null;
    const gmailLabels = gmailLabelsResult.status === 'fulfilled'
      ? (Array.isArray(gmailLabelsResult.value?.labels) ? gmailLabelsResult.value.labels : []).map((label) => ({
          id: String(label?.id || ''),
          name: String(label?.name || ''),
          type: String(label?.type || '')
        }))
      : [];
    const warnings = [];
    if (includeGroups.includes('gsc') && sitesResult.status === 'rejected') warnings.push(`Search Console: ${sitesResult.reason?.message || sitesResult.reason || 'request failed'}`);
    if (includeGroups.includes('ga4') && ga4Result.status === 'rejected') warnings.push(`GA4: ${ga4Result.reason?.message || ga4Result.reason || 'request failed'}`);
    if (includeGroups.includes('drive') && driveResult.status === 'rejected') warnings.push(`Drive: ${driveResult.reason?.message || driveResult.reason || 'request failed'}`);
    if (includeGroups.includes('calendar') && calendarResult.status === 'rejected') warnings.push(`Calendar: ${calendarResult.reason?.message || calendarResult.reason || 'request failed'}`);
    if (includeGroups.includes('gmail') && gmailProfileResult.status === 'rejected') warnings.push(`Gmail profile: ${gmailProfileResult.reason?.message || gmailProfileResult.reason || 'request failed'}`);
    if (includeGroups.includes('gmail') && gmailLabelsResult.status === 'rejected') warnings.push(`Gmail labels: ${gmailLabelsResult.reason?.message || gmailLabelsResult.reason || 'request failed'}`);
    if (current?.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    const payload = {
      ok: true,
      requested: includeGroups,
      google: {
        connected: true,
        scopes: String(tokenInfo.connector?.scopes || ''),
        token_expires_at: String(tokenInfo.connector?.tokenExpiresAt || ''),
        refreshed: tokenInfo.refreshed
      },
      warnings
    };
    if (includeGroups.includes('gsc')) payload.search_console = { sites };
    if (includeGroups.includes('ga4')) payload.ga4 = { account_summaries: accountSummaries };
    if (includeGroups.includes('drive')) payload.drive = { files: driveFiles };
    if (includeGroups.includes('calendar')) payload.calendar = { calendars };
    if (includeGroups.includes('gmail')) {
      payload.gmail = {
        profile: gmailProfile,
        labels: gmailLabels
      };
    }
    return json(res, 200, payload);
  } catch (error) {
    return json(res, Number(error?.statusCode || 502), {
      error: error.message || 'Google assets fetch failed',
      code: error.code || 'google_assets_failed'
    });
  }
}

async function handleGoogleSendGmail(req, res) {
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return json(res, 400, { error: body.__error });
  if (!(body.confirm_send === true || body.confirmSend === true)) {
    return json(res, 428, { error: 'Explicit confirmation required before sending email.', required: 'confirm_send=true' });
  }
  const to = String(body.to || '').trim();
  const subject = String(body.subject || '').trim();
  const text = String(body.text || body.body || '').trim();
  if (!validateEmailAddress(to)) return json(res, 400, { error: 'Valid recipient email is required.' });
  if (!subject) return json(res, 400, { error: 'Email subject is required.' });
  if (!text) return json(res, 400, { error: 'Email body is required.' });
  const state = await storage.getState();
  const current = currentAgentRequesterContext(state, req);
  if (!current.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
  if (!current.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
  const connector = current.account?.connectors?.google || null;
  if (!connector?.connected || !connector?.accessTokenEnc) {
    return json(res, 409, {
      error: 'Google connection required before Gmail send.',
      missing_connectors: ['google'],
      missing_connector_capabilities: ['google.send_gmail'],
      action: connectorActionLabel('connect_google')
    });
  }
  const scopes = new Set(String(connector.scopes || '').split(/\s+/).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  const sendReady = scopes.has('https://www.googleapis.com/auth/gmail.send') || scopes.has('https://mail.google.com/');
  if (!sendReady) {
    return json(res, 409, {
      error: 'Google connection must be refreshed with Gmail send scope before CAIt can send email.',
      missing_connectors: ['google'],
      missing_connector_capabilities: ['google.send_gmail'],
      action: connectorActionLabel('connect_google')
    });
  }
  try {
    const tokenInfo = await googleAccessTokenForConnector(current.accountLogin || current.user?.login || '', current.user || null, current.authProvider || '', connector);
    const sent = await sendGoogleGmailMessage(tokenInfo.accessToken, { to, subject, text });
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 201, {
      ok: true,
      id: String(sent?.id || ''),
      thread_id: String(sent?.threadId || ''),
      to,
      subject
    });
  } catch (error) {
    return json(res, Number(error?.statusCode || 502), { error: error.message || 'Gmail send failed' });
  }
}

async function handleResendSendEmail(req, res) {
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return json(res, 400, { error: body.__error });
  if (!(body.confirm_send === true || body.confirmSend === true)) {
    return json(res, 428, { error: 'Explicit confirmation required before sending email.', required: 'confirm_send=true' });
  }
  const to = String(body.to || '').trim();
  const from = String(body.from || '').trim();
  const replyTo = String(body.replyTo || body.reply_to || '').trim();
  const subject = String(body.subject || '').trim();
  const text = String(body.text || body.body || '').trim();
  if (!validateEmailAddress(to)) return json(res, 400, { error: 'Valid recipient email is required.' });
  if (!validateEmailAddress(from)) return json(res, 400, { error: 'Valid sender email is required.' });
  if (replyTo && !validateEmailAddress(replyTo)) return json(res, 400, { error: 'Reply-to email is invalid.' });
  if (!subject) return json(res, 400, { error: 'Email subject is required.' });
  if (!text) return json(res, 400, { error: 'Email body is required.' });
  const state = await storage.getState();
  const current = currentAgentRequesterContext(state, req);
  if (!current.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
  if (!current.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
  if (!canUsePlatformResend(current)) {
    return json(res, 403, { error: 'CAIt Resend send is restricted to the platform admin account.' });
  }
  if (!resendConfigured()) {
    return json(res, 503, { error: 'CAIt Resend is not configured.' });
  }
  const baseDelivery = {
    id: randomUUID(),
    accountLogin: String(current.login || '').trim().toLowerCase(),
    recipientEmail: to,
    senderEmail: from,
    subject,
    template: 'manual_executor_v1',
    provider: 'resend',
    status: 'queued',
    providerMessageId: '',
    payload: {
      from,
      replyTo: replyTo || '',
      to,
      subject,
      text,
      source: String(body.source || 'web')
    },
    response: {},
    errorText: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  try {
    const sent = await sendResendEmail({
      from,
      replyTo: replyTo || undefined,
      to,
      subject,
      text
    });
    const delivery = {
      ...baseDelivery,
      status: 'sent',
      providerMessageId: String(sent?.id || ''),
      response: sent,
      updatedAt: nowIso()
    };
    await appendEmailDelivery(delivery);
    await touchEvent('EMAIL', `${current.login} sent Resend via executor`, {
      login: current.login,
      to,
      from,
      subject,
      provider: 'resend',
      providerMessageId: delivery.providerMessageId,
      source: String(body.source || 'web')
    });
    if (current?.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 201, {
      ok: true,
      id: delivery.providerMessageId,
      to,
      from,
      subject,
      provider: 'resend'
    });
  } catch (error) {
    const failed = {
      ...baseDelivery,
      status: 'failed',
      response: error?.payload || {},
      errorText: String(error?.message || error || 'Resend send failed').slice(0, 500),
      updatedAt: nowIso()
    };
    await appendEmailDelivery(failed);
    await touchEvent('FAILED', `${current.login} Resend send failed`, {
      login: current.login,
      to,
      from,
      subject,
      provider: 'resend',
      error: failed.errorText,
      source: String(body.source || 'web')
    });
    return json(res, Number(error?.statusCode || 502), { error: failed.errorText });
  }
}

function exactConnectorActionFromRecurringOrder(order = {}) {
  const broker = order?.input?._broker;
  if (!broker || typeof broker !== 'object') return null;
  const action = broker.exactConnectorAction || broker.exact_connector_action;
  return action && typeof action === 'object' ? action : null;
}

function recurringConnectorError(message, code = 'connector_required', statusCode = 409) {
  return {
    error: String(message || 'Scheduled connector action could not run.'),
    code,
    statusCode
  };
}

async function publishInstagramPhotoByApi(action = {}) {
  const accessToken = String(action.accessToken || action.access_token || '').trim();
  const instagramUserId = String(action.instagramUserId || action.instagram_user_id || '').trim();
  const mediaUrl = String(action.mediaUrl || action.media_url || '').trim();
  const caption = String(action.caption || '').trim();
  const graphBase = String(action.graphBaseUrl || action.graph_base_url || 'https://graph.instagram.com').trim().replace(/\/+$/g, '');
  const graphVersion = String(action.graphVersion || action.graph_version || 'v24.0').trim().replace(/^\/+|\/+$/g, '');
  if (!accessToken) throw Object.assign(new Error('Instagram access token is required.'), { statusCode: 400 });
  if (!instagramUserId) throw Object.assign(new Error('Instagram user ID is required.'), { statusCode: 400 });
  if (!mediaUrl) throw Object.assign(new Error('Instagram media URL is required.'), { statusCode: 400 });
  const base = `${graphBase}/${graphVersion}`;
  const createBody = new URLSearchParams({
    image_url: mediaUrl,
    caption,
    access_token: accessToken
  });
  const createResponse = await fetch(`${base}/${encodeURIComponent(instagramUserId)}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: createBody.toString()
  });
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !created?.id) {
    const error = created?.error?.message || created?.message || 'Instagram media container creation failed';
    throw Object.assign(new Error(String(error)), { statusCode: createResponse.status || 502, payload: created });
  }
  const creationId = String(created.id || '');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const statusResponse = await fetch(`${base}/${encodeURIComponent(creationId)}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`);
    const statusPayload = await statusResponse.json().catch(() => ({}));
    const statusCode = String(statusPayload?.status_code || '').toUpperCase();
    if (!statusResponse.ok) break;
    if (!statusCode || statusCode === 'FINISHED' || statusCode === 'PUBLISHED') break;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw Object.assign(new Error(`Instagram media processing failed: ${statusCode}`), { statusCode: 502, payload: statusPayload });
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const publishBody = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken
  });
  const publishResponse = await fetch(`${base}/${encodeURIComponent(instagramUserId)}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: publishBody.toString()
  });
  const published = await publishResponse.json().catch(() => ({}));
  if (!publishResponse.ok || !published?.id) {
    const error = published?.error?.message || published?.message || 'Instagram publish failed';
    throw Object.assign(new Error(String(error)), { statusCode: publishResponse.status || 502, payload: published });
  }
  return {
    creationId,
    mediaId: String(published.id || '')
  };
}

async function executeScheduledExactConnectorAction(order = {}, current = {}) {
  const action = exactConnectorActionFromRecurringOrder(order);
  if (!action) return null;
  const kind = String(action.kind || action.type || '').trim().toLowerCase();
  const state = await storage.getState();
  const account = current.account || accountSettingsForLogin(state, current.login, current.user, current.authProvider) || {};
  if (kind === 'x_post') {
    const validation = validateXPostText(action.text || action.postText || action.post_text || '');
    if (!validation.ok) return recurringConnectorError(validation.error, 'connector_required', 400);
    const connector = account?.connectors?.x || null;
    if (!connector?.connected || !connector?.accessTokenEnc) {
      return recurringConnectorError('X connection required before the scheduled post can run.');
    }
    try {
      const posted = await postXTweet(process.env, connector, {
        text: validation.text,
        replyToTweetId: action.replyToTweetId || action.reply_to_tweet_id || ''
      });
      await storage.mutate(async (draft) => {
        const latest = accountSettingsForLogin(draft, current.login, current.user, current.authProvider);
        upsertAccountSettingsInState(draft, current.login, current.user, current.authProvider, {
          connectors: {
            ...(latest.connectors || {}),
            x: posted.connector
          }
        });
      });
      await touchEvent('X_POSTED', `${current.login} posted to X from scheduled action`, {
        login: current.login,
        tweetId: posted.tweetId,
        url: posted.url,
        recurringOrderId: String(order.id || ''),
        source: 'scheduled_exact_action'
      });
      return {
        ok: true,
        mode: 'connector_action',
        status: 'posted',
        connector_action: 'x_post',
        connector_action_id: String(posted.tweetId || ''),
        url: posted.url || ''
      };
    } catch (error) {
      return recurringConnectorError(error.message || 'Scheduled X post failed', 'connector_required', Number(error?.statusCode || 502));
    }
  }
  if (kind === 'gmail_send') {
    const to = String(action.to || '').trim();
    const subject = String(action.subject || '').trim();
    const text = String(action.text || action.body || '').trim();
    if (!validateEmailAddress(to) || !subject || !text) {
      return recurringConnectorError('Scheduled Gmail send requires recipient, subject, and body.', 'connector_required', 400);
    }
    const connector = googleConnectorForAccount(account);
    if (!connector?.connected || !connector?.accessTokenEnc) {
      return recurringConnectorError('Google connection required before the scheduled Gmail send can run.');
    }
    const scopes = new Set(String(connector.scopes || '').split(/\s+/).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
    if (!(scopes.has('https://www.googleapis.com/auth/gmail.send') || scopes.has('https://mail.google.com/'))) {
      return recurringConnectorError('Google must be reconnected with Gmail send scope before the scheduled Gmail send can run.');
    }
    try {
      const tokenInfo = await googleAccessTokenForConnector(current.login, current.user, current.authProvider, connector);
      const sent = await sendGoogleGmailMessage(tokenInfo.accessToken, { to, subject, text });
      await touchEvent('GMAIL_SENT', `${current.login} sent Gmail from scheduled action`, {
        login: current.login,
        to,
        subject,
        messageId: String(sent?.id || ''),
        threadId: String(sent?.threadId || ''),
        recurringOrderId: String(order.id || ''),
        source: 'scheduled_exact_action'
      });
      return {
        ok: true,
        mode: 'connector_action',
        status: 'sent',
        connector_action: 'gmail_send',
        connector_action_id: String(sent?.id || ''),
        thread_id: String(sent?.threadId || '')
      };
    } catch (error) {
      return recurringConnectorError(error.message || 'Scheduled Gmail send failed', 'connector_required', Number(error?.statusCode || 502));
    }
  }
  if (kind === 'resend_send') {
    const to = String(action.to || '').trim();
    const from = String(action.from || '').trim();
    const replyTo = String(action.replyTo || action.reply_to || '').trim();
    const subject = String(action.subject || '').trim();
    const text = String(action.text || action.body || '').trim();
    if (!validateEmailAddress(to) || !validateEmailAddress(from) || !subject || !text) {
      return recurringConnectorError('Scheduled Resend send requires valid to/from, subject, and body.', 'connector_required', 400);
    }
    if (replyTo && !validateEmailAddress(replyTo)) {
      return recurringConnectorError('Scheduled Resend reply-to email is invalid.', 'connector_required', 400);
    }
    if (!canUsePlatformResend(current)) {
      return recurringConnectorError('CAIt Resend scheduled sends are restricted to the platform admin account.', 'agent_restricted', 403);
    }
    if (!resendConfigured()) {
      return recurringConnectorError('CAIt Resend is not configured.', 'connector_required', 503);
    }
    const baseDelivery = {
      id: randomUUID(),
      accountLogin: String(current.login || '').trim().toLowerCase(),
      recipientEmail: to,
      senderEmail: from,
      subject,
      template: 'scheduled_executor_v1',
      provider: 'resend',
      status: 'queued',
      providerMessageId: '',
      payload: {
        from,
        replyTo: replyTo || '',
        to,
        subject,
        text,
        source: 'scheduled_exact_action',
        recurringOrderId: String(order.id || '')
      },
      response: {},
      errorText: '',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    try {
      const sent = await sendResendEmail({
        from,
        replyTo: replyTo || undefined,
        to,
        subject,
        text
      });
      await appendEmailDelivery({
        ...baseDelivery,
        status: 'sent',
        providerMessageId: String(sent?.id || ''),
        response: sent,
        updatedAt: nowIso()
      });
      await touchEvent('EMAIL', `${current.login} sent Resend from scheduled action`, {
        login: current.login,
        to,
        from,
        subject,
        provider: 'resend',
        providerMessageId: String(sent?.id || ''),
        recurringOrderId: String(order.id || ''),
        source: 'scheduled_exact_action'
      });
      return {
        ok: true,
        mode: 'connector_action',
        status: 'sent',
        connector_action: 'resend_send',
        connector_action_id: String(sent?.id || '')
      };
    } catch (error) {
      await appendEmailDelivery({
        ...baseDelivery,
        status: 'failed',
        response: error?.payload || {},
        errorText: String(error?.message || error || 'Resend send failed').slice(0, 500),
        updatedAt: nowIso()
      });
      return recurringConnectorError(error.message || 'Scheduled Resend send failed', 'connector_required', Number(error?.statusCode || 502));
    }
  }
  if (kind === 'instagram_post') {
    try {
      const published = await publishInstagramPhotoByApi(action);
      await touchEvent('INSTAGRAM_POSTED', `${current.login} published Instagram from scheduled action`, {
        login: current.login,
        mediaId: published.mediaId,
        creationId: published.creationId,
        recurringOrderId: String(order.id || ''),
        source: 'scheduled_exact_action'
      });
      return {
        ok: true,
        mode: 'connector_action',
        status: 'posted',
        connector_action: 'instagram_post',
        connector_action_id: String(published.mediaId || '')
      };
    } catch (error) {
      return recurringConnectorError(error.message || 'Scheduled Instagram publish failed', 'connector_required', Number(error?.statusCode || 502));
    }
  }
  return recurringConnectorError('Unsupported scheduled connector action.', 'connector_required', 400);
}

async function handleInstagramConnectorPost(req, res) {
  const body = await parseBody(req).catch((error) => ({ __error: error.message }));
  if (body.__error) return json(res, 400, { error: body.__error });
  if (!(body.confirm_post === true || body.confirmPost === true)) {
    return json(res, 428, {
      error: 'Explicit confirmation required before posting to Instagram.',
      required: 'confirm_post=true'
    });
  }
  const state = await storage.getState();
  const current = currentAgentRequesterContext(state, req);
  if (!current?.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
  if (!current?.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
  try {
    const published = await publishInstagramPhotoByApi(body);
    await touchEvent('INSTAGRAM_POSTED', `${current.login} published Instagram via executor`, {
      login: current.login,
      mediaId: published.mediaId,
      creationId: published.creationId,
      source: String(body.source || 'web')
    });
    if (current?.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 201, {
      ok: true,
      media_id: published.mediaId,
      creation_id: published.creationId
    });
  } catch (error) {
    return json(res, Number(error?.statusCode || 502), { error: error.message || 'Instagram publish failed' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (enforceRateLimit(req, res, url.pathname)) return;
  if (enforceBrowserWriteProtection(req, res, url.pathname)) return;
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/app') || url.pathname === '/styles.css' || url.pathname === '/client.js')) {
    if (serveStatic(res, url.pathname === '/' ? '/index.html' : url.pathname)) return;
  }
  if (req.method === 'GET' && url.pathname === '/auth/status') {
    const session = getSession(req);
    const refreshedCookie = maybeRefreshSessionCookie(req, session);
    return json(res, 200, authStatus(req), refreshedCookie ? { 'Set-Cookie': refreshedCookie } : {});
  }
  if (req.method === 'GET' && url.pathname === '/auth/debug') {
    const current = await currentUserContext(req);
    if (!canUseProductionDebugRoute(current, req)) return json(res, 404, { error: 'Not found' });
    const callback = `${baseUrl(req)}/auth/github/callback`;
    const googleCallback = `${baseUrl(req)}/auth/google/callback`;
    const xCallback = xCallbackUrl(req);
    const githubAppSetup = githubAppRecommendedSettings(req);
    const policy = runtimePolicy(req);
    return json(res, 200, {
      baseUrl: baseUrl(req),
      callback,
      googleCallback,
      githubConfigured: Boolean(githubClientId && githubClientSecret),
      googleConfigured: googleConfigured(),
      xConfigured: xOAuthConfigured(process.env),
      xTokenEncryptionConfigured: xTokenEncryptionConfigured(process.env),
      githubAppConfigured: githubAppConfigured(),
      githubScope: githubOAuthScope(),
      googleScope: googleOAuthScope(),
      xScope: xOAuthScopeLabel(),
      privateRepoImportEnabled: githubPrivateRepoImportEnabled(),
      releaseStage: policy.releaseStage,
      openWriteApiEnabled: policy.openWriteApiEnabled,
      guestRunReadEnabled: policy.guestRunReadEnabled,
      devApiEnabled: policy.devApiEnabled,
      exposeJobSecrets: policy.exposeJobSecrets,
      hasClientId: Boolean(githubClientId),
      hasClientSecret: Boolean(githubClientSecret),
      xCallback,
      hasGoogleClientId: Boolean(googleClientId),
      hasGoogleClientSecret: Boolean(googleClientSecret),
      githubApp: {
        appIdPresent: Boolean(githubAppId()),
        clientIdPresent: Boolean(githubAppClientId()),
        clientSecretPresent: Boolean(githubAppClientSecret()),
        privateKeyPresent: Boolean(githubAppPrivateKey()),
        slug: githubAppSlug() || null,
        recommendedSettings: githubAppSetup
      },
      host: req.headers.host,
      forwardedProto: req.headers['x-forwarded-proto'] || null
    });
  }
  if (req.method === 'GET' && url.pathname === '/auth/github-app/install') {
    if (!githubAppConfigured()) return json(res, 503, { error: 'GitHub App is not configured yet.', setup: githubAppRecommendedSettings(req) });
    const slug = await githubAppInstallSlug();
    if (!slug) return json(res, 503, { error: 'GitHub App slug is unavailable. Set GITHUB_APP_SLUG or complete app registration.' });
    const { action } = oauthStartContext(req, url);
    const state = randomBytes(16).toString('hex');
    oauthStates.set(state, { createdAt: Date.now(), provider: 'github-app', action });
    const installUrl = new URL(`https://github.com/apps/${slug}/installations/new`);
    installUrl.searchParams.set('state', state);
    return redirect(res, installUrl.toString());
  }
  if (req.method === 'GET' && url.pathname === '/auth/github-app/connect') {
    if (!githubAppConfigured()) return json(res, 503, { error: 'GitHub App is not configured yet.', setup: githubAppRecommendedSettings(req) });
    const { existingSession, action, returnTo, loginSource, visitorId } = oauthStartContext(req, url);
    if (existingSession?.user && action !== 'link' && sessionHasGithubApp(existingSession)) return redirect(res, returnTo || '/');
    const state = randomBytes(16).toString('hex');
    oauthStates.set(state, { createdAt: Date.now(), provider: 'github-app', action, returnTo, loginSource, visitorId });
    return redirect(res, githubAppConnectUrl(req, state));
  }
  if (req.method === 'GET' && url.pathname === '/auth/github-app/callback') {
    if (!githubAppConfigured()) return redirect(res, '/?auth_error=github_app_not_configured');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const installationId = url.searchParams.get('installation_id') || '';
    if (!code || !state || !oauthStates.has(state)) {
      await trackAuthLoginFailure('github-app', {
        source: 'auth_callback',
        status: 'invalid_state'
      });
      return redirect(res, '/?auth_error=invalid_github_app_state');
    }
    const oauthState = oauthStates.get(state);
    oauthStates.delete(state);
    try {
      const existingSession = getSession(req);
      const linkedSession = await buildGithubAppSession(req, code, installationId);
      let session = linkedSession;
      if (shouldLinkOAuthCallback(oauthState, existingSession)) {
        const current = currentUserContext(req);
        if (!current?.login) return redirect(res, authFailureRedirectPath(req, 'login_required_for_link', oauthState));
        const linked = await linkSessionIdentityToAccount(current.login, linkedSession.githubIdentity, 'github-app');
        if (!linked?.ok) return redirect(res, authFailureRedirectPath(req, 'github_identity_already_linked', oauthState));
        session = mergeLinkedSession(existingSession || {}, {
          accountLogin: linked.account.login,
          githubIdentity: accountIdentityForProvider(linked.account, 'github') || linkedSession.githubIdentity,
          googleIdentity: accountIdentityForProvider(linked.account, 'google') || existingSession?.googleIdentity || null,
          githubAppUserAccessToken: linkedSession.githubAppUserAccessToken,
          githubApp: linkedSession.githubApp,
          linkedProviders: linkedProvidersFromAccount(linked.account),
          expiresAt: Date.now() + SESSION_MAX_AGE_SEC * 1000
        });
      } else {
        const account = await persistAccountForIdentity(linkedSession.githubIdentity, 'github-app');
        session = mergeLinkedSession(linkedSession, {
          accountLogin: account.login,
          githubIdentity: accountIdentityForProvider(account, 'github') || linkedSession.githubIdentity,
          googleIdentity: accountIdentityForProvider(account, 'google') || linkedSession.googleIdentity || null,
          linkedProviders: linkedProvidersFromAccount(account)
        });
      }
      await persistGithubAppAccess(session.accountLogin || session.user?.login || '', session);
      const sessionId = randomBytes(24).toString('hex');
      sessions.set(sessionId, session);
      return redirect(res, authSuccessRedirectPath(req, oauthState), { 'Set-Cookie': makeSessionCookie(sessionId, req) });
    } catch (error) {
      return redirect(res, authFailureRedirectPath(req, error.message, oauthState));
    }
  }
  if (req.method === 'GET' && url.pathname === '/auth/github-app/setup') {
    if (url.searchParams.get('code')) {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const installationId = url.searchParams.get('installation_id') || '';
      if (!code || !state || !oauthStates.has(state)) return redirect(res, '/?auth_error=invalid_github_app_state');
      const oauthState = oauthStates.get(state);
      oauthStates.delete(state);
      try {
        const existingSession = getSession(req);
        const linkedSession = await buildGithubAppSession(req, code, installationId);
        let session = linkedSession;
        if (shouldLinkOAuthCallback(oauthState, existingSession)) {
          const current = currentUserContext(req);
          if (!current?.login) return redirect(res, authFailureRedirectPath(req, 'login_required_for_link', oauthState));
          const linked = await linkSessionIdentityToAccount(current.login, linkedSession.githubIdentity, 'github-app');
          if (!linked?.ok) return redirect(res, authFailureRedirectPath(req, 'github_identity_already_linked', oauthState));
          session = mergeLinkedSession(existingSession || {}, {
            accountLogin: linked.account.login,
            githubIdentity: accountIdentityForProvider(linked.account, 'github') || linkedSession.githubIdentity,
            googleIdentity: accountIdentityForProvider(linked.account, 'google') || existingSession?.googleIdentity || null,
            githubAppUserAccessToken: linkedSession.githubAppUserAccessToken,
            githubApp: linkedSession.githubApp,
            linkedProviders: linkedProvidersFromAccount(linked.account),
            expiresAt: Date.now() + SESSION_MAX_AGE_SEC * 1000
          });
        } else {
          const account = await persistAccountForIdentity(linkedSession.githubIdentity, 'github-app');
          session = mergeLinkedSession(linkedSession, {
            accountLogin: account.login,
            githubIdentity: accountIdentityForProvider(account, 'github') || linkedSession.githubIdentity,
            googleIdentity: accountIdentityForProvider(account, 'google') || linkedSession.googleIdentity || null,
            linkedProviders: linkedProvidersFromAccount(account)
          });
        }
        await persistGithubAppAccess(session.accountLogin || session.user?.login || '', session);
        const sessionId = randomBytes(24).toString('hex');
        sessions.set(sessionId, session);
        return redirect(res, authSuccessRedirectPath(req, oauthState), { 'Set-Cookie': makeSessionCookie(sessionId, req) });
      } catch (error) {
        await trackAuthLoginFailure('github-app', {
          source: 'auth_callback',
          status: 'callback_error'
        });
        return redirect(res, authFailureRedirectPath(req, error.message, oauthState));
      }
    }
    if (!githubAppConfigured()) return json(res, 503, { error: 'GitHub App is not configured yet.', setup: githubAppRecommendedSettings(req) });
    return redirect(res, '/?auth_error=github_app_setup_requires_reconnect');
  }
  if (req.method === 'GET' && url.pathname === '/auth/github') {
    if (!(githubClientId && githubClientSecret)) {
      if (githubAppConfigured()) {
        const state = randomBytes(16).toString('hex');
        const { action, returnTo, loginSource, visitorId } = oauthStartContext(req, url);
        oauthStates.set(state, { createdAt: Date.now(), provider: 'github-app', action, returnTo, loginSource, visitorId });
        return redirect(res, githubAppConnectUrl(req, state));
      }
      return json(res, 503, { error: 'GitHub OAuth is not configured yet. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' });
    }
    const { existingSession, action, returnTo, loginSource, visitorId } = oauthStartContext(req, url);
    if (existingSession?.user && action !== 'link') return redirect(res, returnTo || '/');
    const state = randomBytes(16).toString('hex');
    oauthStates.set(state, { createdAt: Date.now(), provider: 'github-oauth', action, returnTo, loginSource, visitorId });
    const callback = `${baseUrl(req)}/auth/github/callback`;
    const githubScope = githubOAuthScope();
    const githubUrl = new URL('https://github.com/login/oauth/authorize');
    githubUrl.searchParams.set('client_id', githubClientId);
    githubUrl.searchParams.set('redirect_uri', callback);
    githubUrl.searchParams.set('scope', githubScope);
    githubUrl.searchParams.set('state', state);
    return redirect(res, githubUrl.toString());
  }
  if (req.method === 'GET' && url.pathname === '/auth/github/callback') {
    if (!(githubClientId && githubClientSecret)) return redirect(res, '/?auth_error=github_not_configured');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state || !oauthStates.has(state)) {
      await trackAuthLoginFailure('github-oauth', {
        source: 'auth_callback',
        status: 'invalid_state'
      });
      return redirect(res, '/?auth_error=invalid_oauth_state');
    }
    const oauthState = oauthStates.get(state);
    oauthStates.delete(state);
    try {
      const existingSession = getSession(req);
      const callback = `${baseUrl(req)}/auth/github/callback`;
      const token = await fetchJson('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ client_id: githubClientId, client_secret: githubClientSecret, code, redirect_uri: callback, state })
      });
      const { user, scopes } = await fetchGithubUserProfile(token.access_token);
      const githubIdentity = githubUserRecord(user);
      let session;
      if (shouldLinkOAuthCallback(oauthState, existingSession)) {
        const current = currentUserContext(req);
        if (!current?.login) return redirect(res, authFailureRedirectPath(req, 'login_required_for_link', oauthState));
        const linked = await linkSessionIdentityToAccount(current.login, githubIdentity, 'github-oauth');
        if (!linked?.ok) return redirect(res, authFailureRedirectPath(req, 'github_identity_already_linked', oauthState));
        if (connectorTokenEncryptionConfigured(process.env)) {
          await storage.mutate(async (draft) => {
            const latest = accountSettingsForLogin(draft, linked.account.login, { ...githubIdentity, login: linked.account.login }, 'github-oauth');
            const github = await githubConnectorFromOAuthToken(process.env, githubIdentity, token, scopes, latest?.connectors?.github || {});
            linked.account = upsertAccountSettingsInState(draft, linked.account.login, { ...githubIdentity, login: linked.account.login }, 'github-oauth', {
              connectors: {
                ...(latest.connectors || {}),
                github
              }
            });
          });
        }
        session = mergeLinkedSession(existingSession || {}, {
          accountLogin: linked.account.login,
          githubIdentity: accountIdentityForProvider(linked.account, 'github') || githubIdentity,
          googleIdentity: accountIdentityForProvider(linked.account, 'google') || existingSession?.googleIdentity || null,
          githubScopes: scopes,
          githubAccessToken: token.access_token,
          linkedProviders: linkedProvidersFromAccount(linked.account),
          expiresAt: Date.now() + SESSION_MAX_AGE_SEC * 1000
        });
      } else {
        let account = await persistAccountForIdentity(githubIdentity, 'github-oauth');
        if (connectorTokenEncryptionConfigured(process.env)) {
          await storage.mutate(async (draft) => {
            const latest = accountSettingsForLogin(draft, account.login, githubIdentity, 'github-oauth');
            const github = await githubConnectorFromOAuthToken(process.env, githubIdentity, token, scopes, latest?.connectors?.github || {});
            account = upsertAccountSettingsInState(draft, account.login, githubIdentity, 'github-oauth', {
              connectors: {
                ...(latest.connectors || {}),
                github
              }
            });
          });
        }
        session = mergeLinkedSession({}, {
          authProvider: 'github-oauth',
          sessionVersion: SESSION_VERSION,
          user: githubIdentity,
          accountLogin: account.login,
          githubIdentity: accountIdentityForProvider(account, 'github') || githubIdentity,
          googleIdentity: accountIdentityForProvider(account, 'google') || null,
          githubScopes: scopes,
          githubAccessToken: token.access_token,
          linkedProviders: linkedProvidersFromAccount(account),
          createdAt: Date.now(),
          expiresAt: Date.now() + SESSION_MAX_AGE_SEC * 1000
        });
      }
      const sessionId = randomBytes(24).toString('hex');
      sessions.set(sessionId, session);
      return redirect(res, authSuccessRedirectPath(req, oauthState), { 'Set-Cookie': makeSessionCookie(sessionId, req) });
    } catch (error) {
      await trackAuthLoginFailure('github-oauth', {
        source: 'auth_callback',
        status: 'callback_error'
      });
      return redirect(res, authFailureRedirectPath(req, error.message, oauthState));
    }
  }
  if (req.method === 'GET' && url.pathname === '/auth/google') {
    if (!googleConfigured()) return json(res, 503, { error: 'Google OAuth is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
    const { existingSession, action, returnTo, loginSource, visitorId } = oauthStartContext(req, url);
    if (existingSession?.user && action !== 'link') return redirect(res, returnTo || '/');
    const state = randomBytes(16).toString('hex');
    oauthStates.set(state, { createdAt: Date.now(), provider: 'google-oauth', action, returnTo, loginSource, visitorId });
    const callback = `${baseUrl(req)}/auth/google/callback`;
    const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleUrl.searchParams.set('client_id', googleClientId);
    googleUrl.searchParams.set('redirect_uri', callback);
    googleUrl.searchParams.set('response_type', 'code');
    googleUrl.searchParams.set('scope', googleScopeForOAuthAction(action));
    googleUrl.searchParams.set('state', state);
    googleUrl.searchParams.set('access_type', 'offline');
    googleUrl.searchParams.set('include_granted_scopes', 'true');
    googleUrl.searchParams.set('prompt', googlePromptForOAuthAction(action));
    return redirect(res, googleUrl.toString());
  }
  if (req.method === 'GET' && url.pathname === '/auth/google/callback') {
    if (!googleConfigured()) return redirect(res, '/?auth_error=google_not_configured');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state || !oauthStates.has(state)) {
      await trackAuthLoginFailure('google-oauth', {
        source: 'auth_callback',
        status: 'invalid_state'
      });
      return redirect(res, '/?auth_error=invalid_google_oauth_state');
    }
    const oauthState = oauthStates.get(state);
    oauthStates.delete(state);
    try {
      const existingSession = getSession(req);
      const callback = `${baseUrl(req)}/auth/google/callback`;
      const token = await fetchJson('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          code,
          redirect_uri: callback,
          grant_type: 'authorization_code'
        }).toString()
      });
      const user = await fetchGoogleUserProfile(token.access_token);
      const googleIdentity = googleUserRecord(user);
      let session;
      if (shouldLinkOAuthCallback(oauthState, existingSession)) {
        const current = currentUserContext(req);
        if (!current?.login) return redirect(res, authFailureRedirectPath(req, 'login_required_for_link', oauthState));
        const linked = await linkSessionIdentityToAccount(current.login, googleIdentity, 'google-oauth');
        if (!linked?.ok) return redirect(res, authFailureRedirectPath(req, 'google_identity_already_linked', oauthState));
        if (connectorTokenEncryptionConfigured(process.env)) {
          await storage.mutate(async (draft) => {
            const latest = accountSettingsForLogin(draft, linked.account.login, { ...googleIdentity, login: linked.account.login }, 'google-oauth');
            const google = await googleConnectorFromOAuthToken(process.env, googleIdentity, token, latest?.connectors?.google || {});
            linked.account = upsertAccountSettingsInState(draft, linked.account.login, { ...googleIdentity, login: linked.account.login }, 'google-oauth', {
              connectors: {
                ...(latest.connectors || {}),
                google
              }
            });
          });
        }
        session = mergeLinkedSession(existingSession || {}, {
          accountLogin: linked.account.login,
          googleIdentity: accountIdentityForProvider(linked.account, 'google') || googleIdentity,
          githubIdentity: accountIdentityForProvider(linked.account, 'github') || existingSession?.githubIdentity || null,
          googleAccessToken: token.access_token,
          linkedProviders: linkedProvidersFromAccount(linked.account),
          expiresAt: Date.now() + SESSION_MAX_AGE_SEC * 1000
        });
      } else {
        let account = await persistAccountForIdentity(googleIdentity, 'google-oauth');
        if (connectorTokenEncryptionConfigured(process.env)) {
          await storage.mutate(async (draft) => {
            const latest = accountSettingsForLogin(draft, account.login, googleIdentity, 'google-oauth');
            const google = await googleConnectorFromOAuthToken(process.env, googleIdentity, token, latest?.connectors?.google || {});
            account = upsertAccountSettingsInState(draft, account.login, googleIdentity, 'google-oauth', {
              connectors: {
                ...(latest.connectors || {}),
                google
              }
            });
          });
        }
        session = mergeLinkedSession({}, {
          authProvider: 'google-oauth',
          sessionVersion: SESSION_VERSION,
          user: googleIdentity,
          accountLogin: account.login,
          googleIdentity: accountIdentityForProvider(account, 'google') || googleIdentity,
          githubIdentity: accountIdentityForProvider(account, 'github') || null,
          googleAccessToken: token.access_token,
          linkedProviders: linkedProvidersFromAccount(account),
          createdAt: Date.now(),
          expiresAt: Date.now() + SESSION_MAX_AGE_SEC * 1000
        });
      }
      const sessionId = randomBytes(24).toString('hex');
      sessions.set(sessionId, session);
      return redirect(res, authSuccessRedirectPath(req, oauthState), { 'Set-Cookie': makeSessionCookie(sessionId, req) });
    } catch (error) {
      await trackAuthLoginFailure('google-oauth', {
        source: 'auth_callback',
        status: 'callback_error'
      });
      return redirect(res, authFailureRedirectPath(req, error.message, oauthState));
    }
  }
  if (req.method === 'POST' && url.pathname === '/auth/email/request') {
    let body = {};
    try {
      body = await parseBody(req);
    } catch (error) {
      await trackAuthLoginFailure('email', {
        source: 'email_auth_request',
        status: 'invalid_json'
      });
      return json(res, 400, { error: error.message });
    }
    const email = String(body?.email || '').trim().toLowerCase();
    const returnTo = normalizeLocalRedirectPath(req, body?.return_to || '', '/?tab=work');
    const loginSource = normalizeOAuthLoginSource(body?.login_source || 'login_page') || 'login_page';
    const visitorId = normalizeOAuthVisitorId(body?.visitor_id || '');
    if (!validateEmailAddress(email)) {
      await trackAuthLoginFailure('email', {
        source: 'email_auth_request',
        status: 'invalid_email'
      });
      return json(res, 400, { error: 'A valid email address is required.' });
    }
    if (!resendConfigured()) {
      await trackAuthLoginFailure('email', {
        source: 'email_auth_request',
        status: 'provider_not_configured',
        login: email
      });
      return json(res, 503, { error: 'Email sign-in is not configured yet.' });
    }
    const token = createEmailAuthToken({
      email,
      returnTo,
      loginSource,
      visitorId
    });
    const verifyUrl = new URL('/auth/email/verify', baseUrl(req));
    verifyUrl.searchParams.set('token', token);
    const delivery = await sendEmailAuthLink(email, verifyUrl.toString(), {
      returnTo,
      loginSource,
      visitorId
    });
    if (delivery.status !== 'sent') {
      await trackAuthLoginFailure('email', {
        source: 'email_auth_request',
        status: delivery.status === 'failed' ? 'send_failed' : 'send_skipped',
        login: email
      });
      return json(res, delivery.status === 'failed' ? 502 : 503, {
        error: delivery.errorText || 'Could not send the email sign-in link.'
      });
    }
    return json(res, 201, { ok: true, status: 'sent' });
  }
  if (req.method === 'GET' && url.pathname === '/auth/email/verify') {
    const token = String(url.searchParams.get('token') || '').trim();
    const fallbackState = {
      action: 'login',
      loginSource: 'login_page',
      returnTo: '/?tab=work',
      visitorId: ''
    };
    if (!token) {
      await trackAuthLoginFailure('email', {
        source: 'email_auth_verify',
        status: 'missing_token'
      });
      return redirect(res, authFailureRedirectPath(req, 'email_link_invalid', fallbackState));
    }
    const emailState = parseEmailAuthToken(token);
    if (!emailState) {
      await trackAuthLoginFailure('email', {
        source: 'email_auth_verify',
        status: 'invalid_token'
      });
      return redirect(res, authFailureRedirectPath(req, 'email_link_invalid', fallbackState));
    }
    try {
      const account = await persistAccountForIdentity({
        providerUserId: emailState.email,
        login: emailState.email,
        email: emailState.email,
        name: emailState.email.split('@')[0] || emailState.email,
        avatarUrl: '',
        profileUrl: ''
      }, 'email');
      const session = mergeLinkedSession({}, {
        authProvider: 'email',
        sessionVersion: SESSION_VERSION,
        user: {
          login: account?.login || emailState.email,
          name: account?.profile?.displayName || emailState.email,
          avatarUrl: '',
          profileUrl: '',
          email: emailState.email,
          accountId: account?.id || ''
        },
        accountLogin: account?.login || emailState.email,
        linkedProviders: linkedProvidersFromAccount(account),
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_MAX_AGE_SEC * 1000
      });
      const sessionId = randomBytes(24).toString('hex');
      sessions.set(sessionId, session);
      return redirect(res, authSuccessRedirectPath(req, {
        action: 'login',
        loginSource: emailState.loginSource,
        returnTo: emailState.returnTo,
        visitorId: emailState.visitorId
      }), { 'Set-Cookie': makeSessionCookie(sessionId, req) });
    } catch (error) {
      await trackAuthLoginFailure('email', {
        source: 'email_auth_verify',
        status: 'verify_error',
        login: emailState.email
      });
      return redirect(res, authFailureRedirectPath(req, 'email_link_invalid', {
        action: 'login',
        loginSource: emailState.loginSource,
        returnTo: emailState.returnTo,
        visitorId: emailState.visitorId
      }));
    }
  }
  if (req.method === 'GET' && url.pathname === '/auth/x') {
    return handleXAuthStart(req, res);
  }
  if (req.method === 'GET' && url.pathname === '/auth/x/callback') {
    return handleXAuthCallback(req, res, url);
  }
  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    const cookies = parseCookies(req);
    const raw = cookies.aiagent2_session;
    const [id] = String(raw || '').split('.');
    if (id) sessions.delete(id);
    return json(res, 200, { ok: true, redirect_to: '/' }, { 'Set-Cookie': clearSessionCookie(req) });
  }
  if (req.method === 'GET' && url.pathname === '/api/connectors/x/status') {
    return handleXConnectorStatus(req, res);
  }
  if (req.method === 'GET' && url.pathname === '/api/connectors/google/assets') {
    return handleGoogleConnectorAssets(req, res);
  }
  if (req.method === 'POST' && url.pathname === '/api/connectors/instagram/post') {
    return handleInstagramConnectorPost(req, res);
  }
  if (req.method === 'POST' && url.pathname === '/api/connectors/google/send-gmail') {
    return handleGoogleSendGmail(req, res);
  }
  if (req.method === 'POST' && url.pathname === '/api/connectors/resend/send-email') {
    return handleResendSendEmail(req, res);
  }
  if (req.method === 'POST' && url.pathname === '/api/connectors/x/post') {
    return handleXConnectorPost(req, res);
  }
  if (req.method === 'GET' && url.pathname === '/api/github/repos') {
    const state = await storage.getState();
    const current = currentAgentRequesterContext(state, req);
    if (!current.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
    if (!current.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
    const session = current.session;
    try {
      if (sessionHasGithubApp(session)) {
        await persistGithubAppAccess(session.accountLogin || session.user?.login || '', session);
        return json(res, 200, {
          auth_provider: 'github-app',
          access_mode: 'installation-selected',
          repos: githubAppReposFromSession(session)
        });
      }
      if (current.apiKeyStatus === 'valid') {
        if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
        return json(res, 200, {
          auth_provider: 'github-app',
          access_mode: 'account-stored-installations',
          repos: current.account?.githubAppAccess?.repos || [],
          requires_session_refresh: !(current.account?.githubAppAccess?.repos || []).length
        });
      }
      if (!sessionHasGithubOauth(session)) return json(res, 403, { error: 'GitHub connection required' });
      const allowPrivateRepos = githubSessionCanReadPrivateRepos(session);
      const repos = allowPrivateRepos
        ? await fetchAllGithubRepos(session.githubAccessToken)
        : await fetchGithubPublicRepos(session.githubIdentity?.login || session.user?.login || '', session.githubAccessToken);
      return json(res, 200, {
        auth_provider: 'github-oauth',
        access_mode: allowPrivateRepos ? 'private-enabled' : 'public-only',
        repos: repos.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          homepage: repo.homepage || '',
          private: repo.private,
          defaultBranch: repo.default_branch,
          htmlUrl: repo.html_url,
          owner: repo.owner?.login
        }))
      });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/github/app-setup') {
    return json(res, 200, {
      githubAppConfigured: githubAppConfigured(),
      recommended: githubAppRecommendedSettings(req)
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/github/load-manifest') {
    const state = await storage.getState();
    const current = currentAgentRequesterContext(state, req);
    if (!current.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
    if (!current.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
    const session = current.session;
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.owner || !body.repo) return json(res, 400, { error: 'owner and repo required' });
    try {
      if (sessionHasGithubApp(session) || current.apiKeyStatus === 'valid') {
        const repoAccess = await githubAppRepoTokenForRequester(current, body.owner, body.repo, body.installation_id || '');
        if (repoAccess.error) return json(res, repoAccess.statusCode || 403, { error: repoAccess.error, use: repoAccess.use, next_step: repoAccess.next_step });
        const { selectedRepo, installationToken } = repoAccess;
        const repoMetaResult = await fetchGithubRepoMeta(body.owner, body.repo, installationToken);
        if (!repoMetaResult.ok) return json(res, repoMetaResult.status === 404 ? 404 : 400, { error: repoMetaResult.error });
        const repoMeta = repoMetaResult.repo;
        const attempts = [];
        let manifest = null;
        let selectedCandidate = null;
        for (const candidatePath of MANIFEST_CANDIDATE_PATHS) {
          const loaded = await fetchGithubManifestCandidate(installationToken, body.owner, body.repo, repoMeta.default_branch, candidatePath);
          if (!loaded.ok) {
            attempts.push({ path: candidatePath, status: loaded.status, error: loaded.error || null });
            continue;
          }
          try {
            manifest = parseAndValidateManifest(loaded.text, { contentType: loaded.contentType, sourceUrl: loaded.manifestUrl });
            selectedCandidate = loaded;
            attempts.push({ path: candidatePath, status: 200, parsed: true });
            break;
          } catch (error) {
            attempts.push({ path: candidatePath, status: 422, error: error.message });
          }
        }
        if (!manifest || !selectedCandidate) {
          return json(res, 404, { error: 'No valid manifest found in candidate files', candidate_paths: MANIFEST_CANDIDATE_PATHS.filter(p => p.endsWith('.json')), attempts });
        }
        const safety = assessAgentRegistrationSafety(manifest, agentSafetyOptionsForRequest(req));
        if (!safety.ok) return agentSafetyErrorResponse(res, safety);
        const ownerInfo = ownerFromCurrent(req, current);
        const agent = createAgentFromManifest(manifest, ownerInfo, {
          manifestUrl: selectedCandidate.manifestUrl,
          manifestSource: `github-app:${repoMeta.full_name}:${selectedCandidate.candidatePath}`,
          verificationStatus: 'manifest_loaded',
          importMode: 'github-app-installation'
        });
        const review = await runAgentReviewForRequest(agent, req, { source: 'github-app-manifest', safety });
        applyAgentReviewToAgentRecord(agent, review);
        await storage.mutate(async (state) => { state.agents.unshift(agent); });
        await touchEvent('REGISTERED', `${agent.name} manifest loaded from ${repoMeta.full_name}/${selectedCandidate.candidatePath} via GitHub App`);
        if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
        return json(res, 201, {
          ok: true,
          auth_provider: 'github-app',
          access_mode: current.apiKeyStatus === 'valid' ? 'account-stored-installation' : 'installation-selected',
          agent,
          repo: { fullName: repoMeta.full_name, private: repoMeta.private },
          installation_id: selectedRepo.installationId,
          manifest_url: selectedCandidate.manifestUrl,
          candidate_path: selectedCandidate.candidatePath,
          candidate_paths_checked: MANIFEST_CANDIDATE_PATHS.filter(p => p.endsWith('.json')),
          attempts,
          safety,
          review
        });
      }
      if (!sessionHasGithubOauth(session)) return json(res, 403, { error: 'GitHub connection required' });
      const allowPrivateRepos = githubSessionCanReadPrivateRepos(session);
      const repoMetaResult = await fetchGithubRepoMeta(body.owner, body.repo, allowPrivateRepos ? session.githubAccessToken : '');
      if (!repoMetaResult.ok) {
        const suffix = allowPrivateRepos ? '' : ' Safe OAuth mode only supports public repositories.';
        return json(res, repoMetaResult.status === 404 ? 404 : 400, { error: `${repoMetaResult.error}.${suffix}`.trim() });
      }
      const repoMeta = repoMetaResult.repo;
      if (repoMeta.private && !allowPrivateRepos) {
        return json(res, 403, {
          error: 'Private repo import is disabled in safe OAuth mode. Keep the manifest in a public repository or switch this integration to a GitHub App for fine-grained private access.'
        });
      }
      const attempts = [];
      let manifest = null;
      let selectedCandidate = null;
      for (const candidatePath of MANIFEST_CANDIDATE_PATHS) {
        const loaded = await fetchGithubManifestCandidate(repoMeta.private && allowPrivateRepos ? session.githubAccessToken : '', body.owner, body.repo, repoMeta.default_branch, candidatePath);
        if (!loaded.ok) {
          attempts.push({ path: candidatePath, status: loaded.status, error: loaded.error || null });
          continue;
        }
        try {
          manifest = parseAndValidateManifest(loaded.text, { contentType: loaded.contentType, sourceUrl: loaded.manifestUrl });
          selectedCandidate = loaded;
          attempts.push({ path: candidatePath, status: 200, parsed: true });
          break;
        } catch (error) {
          attempts.push({ path: candidatePath, status: 422, error: error.message });
        }
      }
      if (!manifest || !selectedCandidate) {
        return json(res, 404, { error: 'No valid manifest found in candidate files', candidate_paths: MANIFEST_CANDIDATE_PATHS.filter(p => p.endsWith('.json')), attempts });
      }
      const safety = assessAgentRegistrationSafety(manifest, agentSafetyOptionsForRequest(req));
      if (!safety.ok) return agentSafetyErrorResponse(res, safety);
      const ownerInfo = ownerFromCurrent(req, current);
      const agent = createAgentFromManifest(manifest, ownerInfo, {
        manifestUrl: selectedCandidate.manifestUrl,
        manifestSource: `github:${repoMeta.full_name}:${selectedCandidate.candidatePath}`,
        verificationStatus: 'manifest_loaded',
        importMode: 'github-manifest-candidate'
      });
      const review = await runAgentReviewForRequest(agent, req, { source: 'github-manifest', safety });
      applyAgentReviewToAgentRecord(agent, review);
      await storage.mutate(async (state) => { state.agents.unshift(agent); });
      await touchEvent('REGISTERED', `${agent.name} manifest loaded from ${repoMeta.full_name}/${selectedCandidate.candidatePath}`);
      if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
      return json(res, 201, {
        ok: true,
        agent,
        repo: { fullName: repoMeta.full_name, private: repoMeta.private },
        access_mode: repoMeta.private ? 'private-enabled' : 'public-only',
        manifest_url: selectedCandidate.manifestUrl,
        candidate_path: selectedCandidate.candidatePath,
        candidate_paths_checked: MANIFEST_CANDIDATE_PATHS.filter(p => p.endsWith('.json')),
        attempts,
        safety,
        review
      });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/github/generate-manifest') {
    const state = await storage.getState();
    const current = currentAgentRequesterContext(state, req);
    if (!current.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
    if (!current.user && current.apiKeyStatus !== 'valid') return json(res, 401, { error: 'Login or CAIt API key required' });
    const session = current.session;
    const preferLocalEndpoints = ['localhost', '127.0.0.1'].includes(url.hostname);
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.owner || !body.repo) return json(res, 400, { error: 'owner and repo required' });
    try {
      if (sessionHasGithubApp(session) || current.apiKeyStatus === 'valid') {
        const repoAccess = await githubAppRepoTokenForRequester(current, body.owner, body.repo, body.installation_id || '');
        if (repoAccess.error) return json(res, repoAccess.statusCode || 403, { error: repoAccess.error, use: repoAccess.use, next_step: repoAccess.next_step });
        const { selectedRepo, installationToken } = repoAccess;
        const repoMetaResult = await fetchGithubRepoMeta(body.owner, body.repo, installationToken);
        if (!repoMetaResult.ok) return json(res, repoMetaResult.status === 404 ? 404 : 400, { error: repoMetaResult.error });
        const repoMeta = repoMetaResult.repo;
        const treeLoad = await fetchGithubRepoTree(installationToken, body.owner, body.repo, repoMeta.default_branch);
        const signalLoad = await loadGithubManifestDraftSignals(
          installationToken,
          body.owner,
          body.repo,
          repoMeta.default_branch,
          treeLoad.ok ? treeLoad.paths : []
        );
        const draft = buildDraftManifestFromRepoAnalysis({
          repoMeta,
          files: signalLoad.files,
          ownerLogin: current.githubIdentity?.login || current.user?.login || current.login || '',
          preferLocalEndpoints
        });
        if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
        return json(res, 200, {
          ok: true,
          auth_provider: 'github-app',
          access_mode: current.apiKeyStatus === 'valid' ? 'account-stored-installation' : 'installation-selected',
          repo: { fullName: repoMeta.full_name, private: repoMeta.private },
          installation_id: selectedRepo.installationId,
          draft_manifest: draft.draftManifest,
          source_files: draft.analysis.loadedFiles,
          missing_files: draft.analysis.missingFiles,
          runtime_hints: draft.analysis.runtimeHints,
          task_type_scores: draft.analysis.scoredTaskTypes,
          endpoint_hints: {
            absolute_health_urls: draft.analysis.absoluteHealthUrls,
            absolute_job_urls: draft.analysis.absoluteJobUrls,
            relative_health_paths: draft.analysis.relativeHealthHints,
            relative_job_paths: draft.analysis.relativeJobHints
          },
          warnings: draft.analysis.warnings,
          signal_attempts: signalLoad.attempts,
          next_step: 'Review the generated JSON, add deployed endpoint URLs if needed, then import the JSON manifest.'
        });
      }
      if (!sessionHasGithubOauth(session)) return json(res, 403, { error: 'GitHub connection required' });
      const allowPrivateRepos = githubSessionCanReadPrivateRepos(session);
      const repoMetaResult = await fetchGithubRepoMeta(body.owner, body.repo, allowPrivateRepos ? session.githubAccessToken : '');
      if (!repoMetaResult.ok) {
        const suffix = allowPrivateRepos ? '' : ' Safe OAuth mode only supports public repositories.';
        return json(res, repoMetaResult.status === 404 ? 404 : 400, { error: `${repoMetaResult.error}.${suffix}`.trim() });
      }
      const repoMeta = repoMetaResult.repo;
      if (repoMeta.private && !allowPrivateRepos) {
        return json(res, 403, {
          error: 'Private repo draft generation is disabled in safe OAuth mode. Keep the repo public or use a GitHub App for fine-grained private access.'
        });
      }
      const treeLoad = await fetchGithubRepoTree(
        repoMeta.private && allowPrivateRepos ? session.githubAccessToken : '',
        body.owner,
        body.repo,
        repoMeta.default_branch
      );
      const signalLoad = await loadGithubManifestDraftSignals(
        repoMeta.private && allowPrivateRepos ? session.githubAccessToken : '',
        body.owner,
        body.repo,
        repoMeta.default_branch,
        treeLoad.ok ? treeLoad.paths : []
      );
      const draft = buildDraftManifestFromRepoAnalysis({
        repoMeta,
        files: signalLoad.files,
        ownerLogin: current.githubIdentity?.login || current.user?.login || current.login || '',
        preferLocalEndpoints
      });
      return json(res, 200, {
        ok: true,
        auth_provider: 'github-oauth',
        access_mode: repoMeta.private ? 'private-enabled' : 'public-only',
        repo: { fullName: repoMeta.full_name, private: repoMeta.private },
        draft_manifest: draft.draftManifest,
        source_files: draft.analysis.loadedFiles,
        missing_files: draft.analysis.missingFiles,
        runtime_hints: draft.analysis.runtimeHints,
        task_type_scores: draft.analysis.scoredTaskTypes,
        endpoint_hints: {
          absolute_health_urls: draft.analysis.absoluteHealthUrls,
          absolute_job_urls: draft.analysis.absoluteJobUrls,
          relative_health_paths: draft.analysis.relativeHealthHints,
          relative_job_paths: draft.analysis.relativeJobHints
        },
        warnings: draft.analysis.warnings,
        signal_attempts: signalLoad.attempts,
        next_step: 'Review the generated JSON, add deployed endpoint URLs if needed, then import the JSON manifest.'
      });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/github/create-adapter-pr') {
    return handleGithubCreateAdapterPr(req, res);
  }
  if (req.method === 'POST' && url.pathname === '/api/github/create-executor-pr') {
    return handleGithubCreateExecutorPr(req, res);
  }
  if (req.method === 'POST' && url.pathname === '/api/github/import-repo') {
    return json(res, 410, {
      error: 'Deprecated endpoint. Repository analysis import is disabled.',
      use: '/api/github/load-manifest'
    });
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    sseClients.add(res);
    const state = await storage.getState();
    for (const event of state.events.slice(-25)) res.write(`data: ${JSON.stringify(event)}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'aiagent2', version: runtimeAppVersion, deploy_target: deployTarget, time: nowIso() });
  if (req.method === 'GET' && url.pathname === '/api/ready') return json(res, 200, { ok: true, ready: true, storage: { kind: storage.kind, supportsPersistence: storage.supportsPersistence }, version: runtimeAppVersion, deploy_target: deployTarget, time: nowIso() });
  if (req.method === 'GET' && url.pathname === '/api/version') return json(res, 200, { ok: true, version: runtimeAppVersion, deploy_target: deployTarget, node: process.version, time: nowIso() });
  if (req.method === 'GET' && url.pathname === '/api/metrics') {
    const snap = await snapshot(req);
    return json(res, 200, {
      ok: true,
      version: runtimeAppVersion,
      deploy_target: deployTarget,
      stats: snap.stats,
      storage: snap.storage,
      billing_audit_count: (snap.billingAudits || []).length,
      event_count: (snap.events || []).length,
      time: nowIso()
    });
  }
  const builtInRouteMatch = url.pathname.match(/^\/mock\/([^/]+)\/(health|jobs)$/);
  if (builtInRouteMatch) {
    const builtInKind = String(builtInRouteMatch[1] || '').trim().toLowerCase();
    const builtInRoute = String(builtInRouteMatch[2] || '').trim().toLowerCase();
    if (BUILT_IN_KINDS.includes(builtInKind)) {
      if (builtInRoute === 'health' && req.method === 'GET') {
        return json(res, 200, builtInAgentHealthPayload(builtInKind, process.env));
      }
      if (builtInRoute === 'jobs' && req.method === 'POST') {
        if (!canUseBuiltInMockJobRoute(req)) return json(res, 404, { error: 'Not found' });
        const body = await parseBody(req).catch(err => ({ __error: err.message }));
        if (body.__error) return json(res, 400, { error: body.__error });
        try {
          return json(res, 200, await runBuiltInAgent(builtInKind, body, process.env));
        } catch (error) {
          return json(res, Number(error?.statusCode || 502), {
            error: `Built-in ${builtInKind} agent failed`,
            detail: String(error?.message || error || 'Unknown error')
          });
        }
      }
    }
  }
  if (req.method === 'POST' && url.pathname === '/mock/accepted/jobs') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    return json(res, 202, { accepted: true, status: 'accepted', external_job_id: `remote-${String(body.job_id || '').slice(0, 8)}` });
  }
  if (req.method === 'GET' && url.pathname === '/api/snapshot') {
    const session = getSession(req);
    const payload = await snapshot(req);
    const refreshedCookie = maybeRefreshSessionCookie(req, session);
    return json(res, 200, payload, refreshedCookie ? { 'Set-Cookie': refreshedCookie } : {});
  }
  if (req.method === 'POST' && url.pathname === '/api/guest-trial/claim') {
    const result = await handleGuestTrialClaim(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error, code: result.code });
    return json(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/schema') return json(res, 200, { schema: storage.schemaSql });
  if (req.method === 'GET' && url.pathname === '/api/stats') return json(res, 200, (await snapshot(req)).stats);
  if (req.method === 'POST' && url.pathname === '/api/analytics/events') {
    const result = await recordAnalyticsEvent(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 201, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/analytics/chat-transcripts') {
    const result = await recordChatTranscript(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 201, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/open-chat/intent') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const authorization = authorizeOpenChatIntentLlm(req, process.env);
    if (!authorization.ok) {
      return json(res, authorization.statusCode || 403, {
        ok: false,
        available: false,
        source: authorization.source || 'none',
        error: authorization.error
      });
    }
    const state = await storage.getState();
    const uiLabels = orderUiLabelsFromAppSettings(appSettingsMap(state));
    const result = await classifyOpenChatIntent(body, process.env, {
      allowOpenAiApiKeyFallback: authorization.allowOpenAiApiKeyFallback,
      allowPlatformOpenAiApiKeyFallback: authorization.allowPlatformOpenAiApiKeyFallback,
      uiLabels
    });
    return json(res, result.ok ? 200 : 503, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/work/resolve-action') {
    const result = await resolveWorkActionRequest(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/work/resolve-intent') {
    const result = await resolveWorkIntentRequest(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/work/prepare-order') {
    const result = await prepareWorkOrderRequest(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/work/preflight-order') {
    const result = await preflightWorkOrderRequest(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, result.ok ? 200 : (result.statusCode || 400), result);
  }
  if (req.method === 'PATCH' && /^\/api\/jobs\/[^/]+\/executor-state$/.test(url.pathname)) {
    const jobId = url.pathname.split('/')[3] || '';
    const result = await updateJobExecutorState(req, jobId);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/deliveries/classify') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const authorization = authorizeOpenChatIntentLlm(req, process.env);
    if (!authorization.ok) {
      return json(res, authorization.statusCode || 403, {
        ok: false,
        available: false,
        source: authorization.source || 'none',
        error: authorization.error
      });
    }
    const result = await classifyDeliveryArtifactWithOpenAi(body, process.env, {
      allowOpenAiApiKeyFallback: authorization.allowOpenAiApiKeyFallback,
      allowPlatformOpenAiApiKeyFallback: authorization.allowPlatformOpenAiApiKeyFallback
    });
    return json(res, result.ok ? 200 : 503, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/deliveries/prepare-publish') {
    const result = await prepareDeliveryPublishRequest(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/deliveries/prepare-publish-order') {
    const result = await prepareDeliveryPublishOrderRequest(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/deliveries/prepare-execution') {
    const result = await prepareDeliveryExecutionRequest(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/deliveries/execute') {
    const result = await executeDeliveryActionRequest(req);
    if (result.error) return json(res, result.statusCode || 400, normalizeDeliveryExecuteFailureResponse(result));
    return json(res, result.statusCode || 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/deliveries/schedule') {
    const result = await scheduleDeliveryActionRequest(req);
    if (result.error) return json(res, result.statusCode || 400, normalizeDeliveryScheduleFailureResponse(result));
    return json(res, result.statusCode || 200, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { agents: (await snapshot(req)).agents });
  if (req.method === 'GET' && url.pathname === '/api/jobs') {
    const state = await storage.getState();
    const current = currentOrderRequesterContext(state, req);
    if (!current.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
    const jobs = visibleJobsForRequest(state, req, current);
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 200, { jobs });
  }
  if (req.method === 'GET' && url.pathname === '/api/recurring-orders') {
    const result = await listRecurringOrdersForRequest(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, { recurring_orders: result.recurringOrders });
  }
  if (req.method === 'POST' && url.pathname === '/api/recurring-orders') {
    const result = await createRecurringOrderForRequest(req);
    if (result.error) return json(res, result.statusCode || 400, result);
    return json(res, result.statusCode || 201, result);
  }
  if ((req.method === 'PATCH' || req.method === 'DELETE') && /^\/api\/recurring-orders\/[^/]+$/.test(url.pathname)) {
    const recurringOrderId = url.pathname.split('/')[3] || '';
    const result = req.method === 'PATCH'
      ? await updateRecurringOrderForRequest(req, recurringOrderId)
      : await deleteRecurringOrderForRequest(req, recurringOrderId);
    if (result.error) return json(res, result.statusCode || 400, result);
    return json(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/billing-audits') return json(res, 200, { billing_audits: (await snapshot(req)).billingAudits });
  if (req.method === 'POST' && url.pathname === '/api/feedback') {
    const result = await submitFeedbackReport(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 201, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/settings') {
    const result = await getSettingsPayload(req, url);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, { account: result.account, monthly_summary: result.monthlySummary });
  }
  if (req.method === 'GET' && url.pathname === '/api/settings/feedback-reports') {
    const result = await listFeedbackReports(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, { feedback_reports: result.feedbackReports });
  }
  if (req.method === 'POST' && /^\/api\/settings\/feedback-reports\/[^/]+$/.test(url.pathname)) {
    const result = await updateFeedbackReport(req, url.pathname.split('/')[4] || '');
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'POST' && /^\/api\/settings\/chat-transcripts\/[^/]+$/.test(url.pathname)) {
    const result = await updateChatTranscriptReview(req, url.pathname.split('/')[4] || '');
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'DELETE' && /^\/api\/settings\/chat-memory\/[^/]+$/.test(url.pathname)) {
    const result = await hideOwnChatMemory(req, url.pathname.split('/')[4] || '');
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/settings/chat-training-data') {
    const result = await listChatTrainingData(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/settings/api-keys') {
    const result = await listOrderApiKeys(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, { api_keys: result.apiKeys });
  }
  if (req.method === 'POST' && url.pathname === '/api/settings/api-keys') {
    const result = await createOrderApiKey(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 201, { ok: true, api_key: result.apiKey, account: result.account });
  }
  if (req.method === 'DELETE' && /^\/api\/settings\/api-keys\/[^/]+$/.test(url.pathname)) {
    const result = await revokeOrderApiKey(req, url.pathname.split('/')[4] || '');
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, { ok: true, api_key: result.apiKey, account: result.account });
  }
  if (req.method === 'POST' && url.pathname === '/api/settings/billing') {
    const result = await saveSettingsSection(req, url, 'billing');
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, { ok: true, account: result.account, monthly_summary: result.monthlySummary, section: 'billing' });
  }
  if (req.method === 'POST' && url.pathname === '/api/settings/payout') {
    const result = await saveSettingsSection(req, url, 'payout');
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, { ok: true, account: result.account, monthly_summary: result.monthlySummary, section: 'payout' });
  }
  if (req.method === 'POST' && url.pathname === '/api/settings/executor-preferences') {
    const result = await saveSettingsSection(req, url, 'executorPreferences');
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, { ok: true, account: result.account, monthly_summary: result.monthlySummary, section: 'executorPreferences' });
  }
  if (req.method === 'GET' && url.pathname === '/api/settings/app-settings') {
    const result = await getAppSettings(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/settings/app-settings') {
    const result = await saveAppSetting(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'DELETE' && /^\/api\/settings\/app-settings\/[^/]+$/.test(url.pathname)) {
    const result = await deleteAppSetting(req, decodeURIComponent(url.pathname.split('/')[4] || ''));
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/stripe/status') {
    const result = await getStripeStatus(req);
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/stripe/deposit-session') {
    try {
      const result = await createStripeDepositSessionForCurrent(req);
      if (result.error) return json(res, result.statusCode || 400, { error: result.error, code: result.code || null });
      return json(res, 201, result);
    } catch (error) {
      const payload = stripeActionErrorPayload(error);
      return json(res, payload.statusCode || 500, payload);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/stripe/setup-session') {
    try {
      const result = await createStripeSetupSessionForCurrent(req);
      if (result.error) return json(res, result.statusCode || 400, { error: result.error, code: result.code || null });
      return json(res, 201, result);
    } catch (error) {
      const payload = stripeActionErrorPayload(error);
      return json(res, payload.statusCode || 500, payload);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/stripe/subscription-session') {
    try {
      const result = await createStripeSubscriptionSessionForCurrent(req);
      if (result.error) return json(res, result.statusCode || 400, { error: result.error, code: result.code || null });
      return json(res, 201, result);
    } catch (error) {
      const payload = stripeActionErrorPayload(error);
      return json(res, payload.statusCode || 500, payload);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/stripe/connect/onboarding') {
    try {
      const result = await createStripeConnectOnboardingForCurrent(req);
      if (result.error) return json(res, result.statusCode || 400, { error: result.error, code: result.code || null });
      return json(res, 201, result);
    } catch (error) {
      const payload = stripeActionErrorPayload(error);
      return json(res, payload.statusCode || 500, payload);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/stripe/payout/run') {
    try {
      const result = await createStripeProviderPayoutForCurrent(req);
      if (result.error) {
        return json(res, result.statusCode || 400, {
          error: result.error,
          code: result.code || null,
          pending_balance: result.pending_balance ?? null,
          minimum_payout_amount: result.minimum_payout_amount ?? null
        });
      }
      return json(res, 200, result);
    } catch (error) {
      const payload = stripeActionErrorPayload(error);
      return json(res, payload.statusCode || 500, payload);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/stripe/auto-topup') {
    try {
      const result = await triggerStripeAutoTopupForCurrent(req);
      if (result.error) return json(res, result.statusCode || 400, { error: result.error, code: result.code || null });
      return json(res, 200, result);
    } catch (error) {
      const payload = stripeActionErrorPayload(error);
      return json(res, payload.statusCode || 500, payload);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/stripe/provider-monthly-charge/run') {
    try {
      const result = await triggerStripeProviderMonthlyChargeForCurrent(req);
      if (result.error) return json(res, result.statusCode || 400, { error: result.error, code: result.code || null, action: result.action || null });
      return json(res, 200, result);
    } catch (error) {
      const payload = stripeActionErrorPayload(error);
      return json(res, payload.statusCode || 500, payload);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/stripe/monthly-charge/run') {
    try {
      const result = await triggerStripeMonthlyInvoiceChargeForCurrent(req);
      if (result.error) return json(res, result.statusCode || 400, { error: result.error, code: result.code || null, action: result.action || null });
      return json(res, 200, result);
    } catch (error) {
      const payload = stripeActionErrorPayload(error);
      return json(res, payload.statusCode || 500, payload);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/stripe/webhook') {
    try {
      const result = await handleStripeWebhook(req);
      if (result.error) return json(res, result.statusCode || 400, { error: result.error });
      return json(res, 200, result);
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.message });
    }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
    const id = url.pathname.split('/').pop();
    const state = await storage.getState();
    const current = currentOrderRequesterContext(state, req);
    if (!current.user && current.apiKeyStatus === 'invalid') return json(res, 401, { error: 'Invalid API key' });
    const job = state.jobs.find(j => j.id === id);
    if (!job || !canViewJobFromRequest(state, req, job, current)) return json(res, 404, { error: 'Job not found' });
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 200, sanitizeJobForViewer(job, req));
  }
  if (req.method === 'POST' && url.pathname === '/api/agent-callbacks/jobs') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.job_id || !body.agent_id) return json(res, 400, { error: 'job_id and agent_id required' });
    const callback = normalizeCallbackPayload(body);
    const current = await storage.getState();
    const job = current.jobs.find(j => j.id === body.job_id);
    if (!job) return json(res, 404, { error: 'Job not found' });
    if (job.assignedAgentId !== body.agent_id) return json(res, 401, { error: 'Invalid assignment' });
    if (!canTransitionJob(job, 'callback')) {
      const code = transitionErrorCode(job, 'callback');
      return json(res, 409, { error: `Job status ${job.status} cannot be changed by callback`, code, job_status: job.status });
    }
    const providedToken = extractCallbackToken(req, body);
    if (!providedToken || !job.callbackToken || !secretEquals(providedToken, job.callbackToken)) return json(res, 403, { error: 'Invalid callback token' });
    if (callback.status === 'failed') {
      if (isTerminalJobStatus(job.status)) {
        return json(res, 409, { error: `Job is already terminal (${job.status})`, code: 'job_already_terminal', job_status: job.status });
      }
      const failed = await failJob(body.job_id, callback.failureReason || 'Agent reported failure', [`failed by ${body.agent_id}`, 'failure source=callback'], { failureStatus: 'failed', failureCategory: 'agent_failed', source: 'callback', externalJobId: callback.externalJobId });
      if (!failed) return json(res, 404, { error: 'Job not found' });
      await touchEvent('FAILED', `${failed.taskType}/${failed.id.slice(0, 6)} failed by callback`);
      return json(res, 200, {
        ok: true,
        status: failed.status,
        job: failed,
        delivery: {
          report: null,
          files: [],
          returnTargets: []
        }
      });
    }
    const result = await completeJobFromAgentResult(body.job_id, body.agent_id, {
      report: callback.report,
      files: callback.files,
      usage: callback.usage,
      return_targets: callback.returnTargets
    }, { source: 'callback', externalJobId: callback.externalJobId });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error, code: result.code || null, job_status: result.job?.status || null });
    await touchEvent('COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed by callback`);
    await recordBillingOutcome(result.job, result.billing, 'callback');
    return json(res, 200, {
      ok: true,
      status: result.job.status,
      job: result.job,
      billing: result.billing,
      delivery: {
        report: result.job.output?.report || null,
        files: result.job.output?.files || [],
        returnTargets: result.job.output?.returnTargets || ['chat', 'api', 'webhook']
      }
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents') {
    const state = await storage.getState();
    const current = currentAgentRequesterContext(state, req);
    const access = requireAgentWriteAccess(req, current);
    if (access.error) return json(res, access.statusCode || 400, { error: access.error });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.name) return json(res, 400, { error: 'name required' });
    const safetyManifest = normalizeManifest({
      schema_version: 'agent-manifest/v1',
      name: body.name,
      description: body.description || '',
      task_types: body.task_types || body.taskTypes || ['summary'],
      metadata: body.metadata || {}
    });
    const safety = assessAgentRegistrationSafety(safetyManifest, agentSafetyOptionsForRequest(req));
    if (!safety.ok) return agentSafetyErrorResponse(res, safety);
    const ownerInfo = ownerFromCurrent(req, current);
    const agent = createAgentFromInput({ ...body, owner: body.owner || ownerInfo.owner, metadata: { ...(body.metadata || {}), ...ownerInfo.metadata } });
    const review = await runAgentReviewForRequest(agent, req, { source: 'manual-register', safety });
    applyAgentReviewToAgentRecord(agent, review);
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} registered with tasks ${agent.taskTypes.join(', ')}`);
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 201, { ok: true, agent, safety, review });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents/draft-skill-manifest') {
    const session = getSession(req);
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const skillMd = body.skill_md || body.skillMd || body.skill || body.text || '';
    if (!String(skillMd || '').trim()) return json(res, 400, { error: 'skill_md required' });
    try {
      const draft = buildDraftManifestFromAgentSkill({
        skillMd,
        sourceUrl: body.source_url || body.sourceUrl || '',
        filePath: body.file_path || body.filePath || 'SKILL.md',
        ownerLogin: session?.user?.login || ''
      });
      if (!draft.safety.ok) return agentSafetyErrorResponse(res, draft.safety);
      return json(res, 200, {
        ok: true,
        standard: 'agent-skills',
        draft_manifest: draft.draftManifest,
        safety: draft.safety,
        skill: {
          name: draft.skill.name,
          description: draft.skill.description,
          file_path: draft.skill.filePath,
          source_url: draft.skill.sourceUrl || null,
          frontmatter: draft.skill.frontmatter || {}
        },
        source_files: draft.analysis.loadedFiles,
        runtime_hints: draft.analysis.runtimeHints,
        task_type_scores: draft.analysis.scoredTaskTypes,
        warnings: draft.analysis.warnings,
        next_step: 'Review the generated JSON, add deployed endpoint URLs if needed, then import the JSON manifest.'
      });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/agents/import-manifest') {
    const state = await storage.getState();
    const current = currentAgentRequesterContext(state, req);
    const access = requireAgentWriteAccess(req, current);
    if (access.error) return json(res, access.statusCode || 400, { error: access.error });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const manifest = normalizeManifest(body.manifest || {});
    const validation = validateManifest(manifest);
    if (!validation.ok) return json(res, 400, { error: validation.errors.join('; ') });
    const safety = assessAgentRegistrationSafety(manifest, agentSafetyOptionsForRequest(req));
    if (!safety.ok) return agentSafetyErrorResponse(res, safety);
    const ownerInfo = ownerFromCurrent(req, current);
    const agent = createAgentFromManifest(manifest, ownerInfo, { manifestSource: 'manifest-json', verificationStatus: 'manifest_loaded', importMode: 'manifest-json' });
    const review = await runAgentReviewForRequest(agent, req, { source: 'manifest-json', safety });
    applyAgentReviewToAgentRecord(agent, review);
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} imported from manifest JSON (pending verification)`);
    const autoVerification = await maybeAutoVerifyImportedAgent(agent, ownerInfo.owner);
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 201, { ok: true, agent: autoVerification.agent, auto_verification: autoVerification.verification, welcome_credits: autoVerification.welcome_credits || null, safety, review });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents/import-url') {
    const state = await storage.getState();
    const current = currentAgentRequesterContext(state, req);
    const access = requireAgentWriteAccess(req, current);
    if (access.error) return json(res, access.statusCode || 400, { error: access.error });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.manifest_url) return json(res, 400, { error: 'manifest_url required' });
    let manifest = null;
    try {
      manifest = await loadManifestFromUrl(body.manifest_url);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
    const safety = assessAgentRegistrationSafety(manifest, agentSafetyOptionsForRequest(req));
    if (!safety.ok) return agentSafetyErrorResponse(res, safety);
    const ownerInfo = ownerFromCurrent(req, current);
    const agent = createAgentFromManifest(manifest, ownerInfo, {
      manifestUrl: body.manifest_url,
      manifestSource: body.manifest_url,
      verificationStatus: 'manifest_loaded',
      importMode: 'manifest-url'
    });
    const review = await runAgentReviewForRequest(agent, req, { source: 'manifest-url', safety });
    applyAgentReviewToAgentRecord(agent, review);
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} manifest loaded from URL`);
    const autoVerification = await maybeAutoVerifyImportedAgent(agent, ownerInfo.owner);
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 201, { ok: true, agent: autoVerification.agent, auto_verification: autoVerification.verification, welcome_credits: autoVerification.welcome_credits || null, import_mode: 'manifest-url', owner: ownerInfo.owner, safety, review });
  }
  if (req.method === 'DELETE' && url.pathname.match(/^\/api\/agents\/([^/]+)$/)) {
    const id = url.pathname.split('/')[3];
    const state = await storage.getState();
    const current = currentAgentRequesterContext(state, req);
    const authorization = authorizeAgentOwnerAction(state, req, id, current);
    if (authorization.error) return json(res, authorization.statusCode || 400, { error: authorization.error });
    const result = await storage.mutate(async (state) => {
      const agent = state.agents.find((item) => item.id === id);
      if (!agent) return { error: 'Agent not found', statusCode: 404 };
      const relatedRuns = state.jobs.filter((job) => job.assignedAgentId === id || job.parentAgentId === id).length;
      state.agents = state.agents.filter((item) => item.id !== id);
      return { ok: true, agent: publicAgent(agent), related_runs: relatedRuns };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    await touchEvent('REMOVED', `${result.agent.name} deleted from registry (${result.related_runs} related runs kept)`);
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 200, result);
  }
  if (req.method === 'PATCH' && url.pathname.match(/^\/api\/agents\/([^/]+)\/pricing$/)) {
    const id = url.pathname.split('/')[3];
    const state = await storage.getState();
    const current = currentAgentRequesterContext(state, req);
    const authorization = authorizeAgentOwnerAction(state, req, id, current);
    if (authorization.error) return json(res, authorization.statusCode || 400, { error: authorization.error });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const providerMarkupRate = providerMarkupRateFromInput(body);
    const pricingModel = pricingModelFromInput(body);
    const fixedRunPriceUsd = nonNegativeUsdFromInput(body.fixed_run_price_usd, body.fixedRunPriceUsd, body.run_price_usd, body.runPriceUsd);
    const subscriptionMonthlyPriceUsd = nonNegativeUsdFromInput(body.subscription_monthly_price_usd, body.subscriptionMonthlyPriceUsd, body.monthly_price_usd, body.monthlyPriceUsd);
    const overageMode = overageModeFromInput(body);
    const overageFixedRunPriceUsd = nonNegativeUsdFromInput(body.overage_fixed_run_price_usd, body.overageFixedRunPriceUsd);
    if (!Number.isFinite(providerMarkupRate) || providerMarkupRate < 0 || providerMarkupRate > MAX_PROVIDER_MARKUP_RATE) {
      return json(res, 400, { error: 'provider_markup_rate must be a number between 0 and 1' });
    }
    if (pricingModel === 'fixed_per_run' && fixedRunPriceUsd <= 0) {
      return json(res, 400, { error: 'fixed_run_price_usd is required when pricing_model=fixed_per_run' });
    }
    if ((pricingModel === 'subscription_required' || pricingModel === 'hybrid') && subscriptionMonthlyPriceUsd <= 0) {
      return json(res, 400, { error: 'subscription_monthly_price_usd is required when pricing_model=subscription_required or hybrid' });
    }
    if (pricingModel === 'hybrid' && overageMode === 'fixed_per_run' && overageFixedRunPriceUsd <= 0) {
      return json(res, 400, { error: 'overage_fixed_run_price_usd is required when pricing_model=hybrid and overage_mode=fixed_per_run' });
    }
    const result = await storage.mutate(async (state) => {
      const agent = state.agents.find((item) => item.id === id);
      if (!agent) return { error: 'Agent not found', statusCode: 404 };
      const manifest = agent.metadata?.manifest && typeof agent.metadata.manifest === 'object' ? agent.metadata.manifest : {};
      const pricing = manifest.pricing && typeof manifest.pricing === 'object' ? manifest.pricing : {};
      agent.providerMarkupRate = providerMarkupRate;
      agent.pricingModel = pricingModel;
      agent.fixedRunPriceUsd = fixedRunPriceUsd;
      agent.subscriptionMonthlyPriceUsd = subscriptionMonthlyPriceUsd;
      agent.overageMode = overageMode;
      agent.overageFixedRunPriceUsd = overageFixedRunPriceUsd;
      agent.tokenMarkupRate = providerMarkupRate;
      agent.creatorFeeRate = providerMarkupRate;
      agent.premiumRate = providerMarkupRate;
      agent.platformMarginRate = 0.1;
      agent.marketplaceFeeRate = 0.1;
      agent.basicRate = 0.1;
      agent.metadata = {
        ...(agent.metadata || {}),
        manifest: {
          ...manifest,
          pricing: {
            ...pricing,
            pricing_model: pricingModel,
            fixed_run_price_usd: fixedRunPriceUsd,
            subscription_monthly_price_usd: subscriptionMonthlyPriceUsd,
            overage_mode: overageMode,
            overage_fixed_run_price_usd: overageFixedRunPriceUsd,
            provider_markup_rate: providerMarkupRate,
            token_markup_rate: providerMarkupRate,
            platform_margin_rate: 0.1,
            creator_fee_rate: providerMarkupRate,
            marketplace_fee_rate: 0.1
          }
        },
        pricingUpdatedAt: nowIso()
      };
      agent.updatedAt = nowIso();
      return { ok: true, agent: publicAgent(agent) };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    await touchEvent('UPDATED', `${result.agent.name} pricing updated model=${pricingModel} provider_markup_rate=${providerMarkupRate}`);
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname.match(/^\/api\/agents\/([^/]+)\/review$/)) {
    const id = url.pathname.split('/')[3];
    const current = currentUserContext(req);
    if (!canReviewAgents(current, req)) return json(res, 403, { error: 'Agent reviews are restricted to operators' });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    let review;
    try {
      review = manualAgentReviewFromBody(body, current.login);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
    const result = await storage.mutate(async (state) => {
      const agent = state.agents.find((item) => item.id === id);
      if (!agent) return { error: 'Agent not found', statusCode: 404 };
      applyAgentReviewToAgentRecord(agent, review);
      return { ok: true, agent: publicAgent(agent), review };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    await touchEvent('REVIEWED', `${result.agent.name} agent review marked ${review.decision} by ${current.login}`);
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname.match(/^\/api\/agents\/([^/]+)\/verify$/)) {
    const id = url.pathname.split('/')[3];
    const state = await storage.getState();
    const current = currentAgentRequesterContext(state, req);
    const authorization = authorizeAgentOwnerAction(state, req, id, current);
    if (authorization.error) return json(res, authorization.statusCode || 400, { error: authorization.error });
    const safetyOptions = agentSafetyOptionsForRequest(req);
    const result = await storage.mutate(async (state) => {
      const agent = state.agents.find(a => a.id === id);
      if (!agent) return { error: 'Agent not found', statusCode: 404 };
      const manifestRecord = agent?.metadata?.manifest && typeof agent.metadata.manifest === 'object' ? agent.metadata.manifest : null;
      let safety = null;
      if (manifestRecord) {
        const safetyManifest = normalizeManifest({
          ...manifestRecord,
          name: manifestRecord.name || agent.name,
          description: manifestRecord.description || agent.description,
          task_types: manifestRecord.task_types || manifestRecord.taskTypes || agent.taskTypes
        });
        safety = assessAgentRegistrationSafety(safetyManifest, safetyOptions);
        if (!safety.ok) {
          const review = await runAgentReviewForRequest(agent, req, { source: 'manual-verify', safety });
          applyAgentReviewToAgentRecord(agent, review);
          const verification = {
            ok: false,
            status: 'verification_failed',
            checkedAt: nowIso(),
            code: 'agent_safety_blocked',
            category: 'safety_review',
            reason: safety.summary,
            details: { safety }
          };
          agent.verificationStatus = verification.status;
          agent.verificationCheckedAt = verification.checkedAt;
          agent.verificationError = verification.reason;
          agent.verificationDetails = {
            category: verification.category,
            code: verification.code,
            reason: verification.reason,
            details: verification.details
          };
          agent.updatedAt = nowIso();
          return { ok: true, agent, verification, welcome_credits: null, safety, review };
        }
      }
      let review = agent.agentReview && typeof agent.agentReview === 'object' ? agent.agentReview : null;
      const manualApproval = agent.agentReviewStatus === 'approved' && review?.source === 'manual-review';
      if (!manualApproval) {
        review = await runAgentReviewForRequest(agent, req, { source: 'manual-verify', safety });
        applyAgentReviewToAgentRecord(agent, review);
      }
      if (!isBuiltInSampleAgent(agent) && !isAgentReviewApproved(agent)) {
        const verification = {
          ok: false,
          status: 'verification_failed',
          checkedAt: nowIso(),
          code: 'agent_review_not_approved',
          category: 'agent_review',
          reason: agentReviewRouteBlockReason(agent),
          details: { review }
        };
        agent.verificationStatus = verification.status;
        agent.verificationCheckedAt = verification.checkedAt;
        agent.verificationError = verification.reason;
        agent.verificationDetails = {
          category: verification.category,
          code: verification.code,
          reason: verification.reason,
          details: verification.details
        };
        agent.updatedAt = nowIso();
        return { ok: true, agent, verification, welcome_credits: null, safety, review };
      }
      const verification = await verifyAgentByHealthcheck(agent);
      agent.verificationStatus = verification.status;
      agent.verificationCheckedAt = verification.checkedAt;
      agent.verificationError = verification.ok ? null : verification.reason;
      agent.verificationDetails = {
        category: verification.category || (verification.ok ? 'verified' : 'unknown'),
        code: verification.code || (verification.ok ? 'verified' : 'verification_failed'),
        reason: verification.reason || null,
        healthcheckUrl: verification.healthcheckUrl || null,
        challengeUrl: verification.challengeUrl || verification.details?.challengeUrl || null,
        details: verification.details || null
      };
      agent.updatedAt = nowIso();
      const welcomeCredits = verification.ok
        ? maybeGrantWelcomeCreditsForVerifiedAgentInState(state, authorization.agent.owner || current.login, agent.id)
        : null;
      return { ok: true, agent, verification, welcome_credits: welcomeCredits, safety, review };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    if (result.verification.ok) {
      await touchEvent('VERIFIED', `${result.agent.name} verification succeeded`);
      if (result.welcome_credits?.status === 'granted') {
        await touchEvent('CREDIT', `${authorization.agent.owner || current.login} earned ${WELCOME_CREDITS_GRANT_AMOUNT} welcome credits for ${result.agent.name}`);
      } else if (result.welcome_credits?.status === 'rejected') {
        await touchEvent('CREDIT', `${result.agent.name} welcome credits rejected: ${result.welcome_credits.reason}`);
      }
    } else {
      await touchEvent('FAILED', `${result.agent.name} verification failed: ${result.verification.reason}`);
    }
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname.match(/^\/api\/agents\/([^/]+)\/onboarding-check$/)) {
    const id = url.pathname.split('/')[3];
    const state = await storage.getState();
    const current = currentAgentRequesterContext(state, req);
    const authorization = authorizeAgentOwnerAction(state, req, id, current);
    if (authorization.error) return json(res, authorization.statusCode || 400, { error: authorization.error });
    const agent = publicAgent(authorization.agent);
    const onboarding = await runAgentOnboardingCheck(agent, { runtimeOrigin: baseUrl(req) });
    if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    return json(res, 200, { ok: true, agent, onboarding });
  }
  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    const state = await storage.getState();
    let current = currentOrderRequesterContext(state, req);
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const touchUsage = async () => {
      if (current.apiKey?.id) await recordOrderApiKeyUsage(current, req);
    };
    if (!body.parent_agent_id || !body.prompt) return json(res, 400, { error: 'parent_agent_id and prompt required' });
    const promptInjection = promptInjectionGuardForPrompt(body.prompt);
    if (promptInjection.blocked) {
      await touchUsage();
      return json(res, 400, promptPolicyBlockPayload(promptInjection));
    }
    const requestedStrategy = normalizeOrderStrategy(body.order_strategy || body.orderStrategy || body.execution_mode || body.executionMode);
    const taskType = inferTaskType(body.task_type, body.prompt);
    const resolved = resolveOrderStrategy(state.agents, body, taskType, requestedStrategy);
    const guestPrepared = await prepareGuestTrialOrderContext(req, current, body, resolved);
    if (guestPrepared.error) return json(res, guestPrepared.statusCode || 400, guestPrepared);
    current = guestPrepared.current;
    const preparedBody = guestPrepared.body;
    const access = requireOrderWriteAccess(req, current);
    if (access.error) return json(res, access.statusCode || 400, { error: access.error });
    const result = resolved.strategy === 'multi'
      ? await handleCreateWorkflowJob(req, preparedBody, current, { touchUsage, workflowPlan: resolved.plan })
      : await performSingleJobCreate(req, preparedBody, current, { touchUsage });
    if (result?.error) return json(res, result.statusCode || 400, result);
    result.order_strategy_requested = requestedStrategy;
    result.order_strategy_resolved = resolved.strategy;
    result.routing_reason = resolved.reason;
    if (resolved.plan?.plannedTasks) result.routing_planned_task_types = resolved.plan.plannedTasks;
    return json(res, result.statusCode || 201, result);
  }
  const claimMatch = req.method === 'POST' && url.pathname.match(/^\/api\/jobs\/([^/]+)\/claim$/);
  if (claimMatch) {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const current = await storage.getState();
    const currentJob = current.jobs.find(j => j.id === claimMatch[1]);
    if (!currentJob) return json(res, 404, { error: 'Job not found' });
    const requestedAgentId = String(body.agent_id || currentJob.assignedAgentId || '').trim();
    if (!requestedAgentId) return json(res, 400, { error: 'agent_id required' });
    const authorization = authorizeConnectedAgentAction(current, req, requestedAgentId);
    if (authorization.error) return json(res, authorization.statusCode || 400, { error: authorization.error });
    const result = await storage.mutate(async (state) => {
      const job = state.jobs.find(j => j.id === claimMatch[1]);
      if (!job) return { error: 'Job not found', statusCode: 404 };
      const agent = state.agents.find(a => a.id === requestedAgentId);
      if (!agent) return { error: 'Agent not found', statusCode: 404 };
      if (!isAgentVerified(agent)) return { error: 'Agent is not verified', statusCode: 403 };
      if (!agent.taskTypes.includes(job.taskType)) return { error: 'Agent cannot accept this job type', statusCode: 400 };
      if (job.assignedAgentId && job.assignedAgentId !== agent.id) return { error: 'Invalid assignment', statusCode: 401 };
      if (isTerminalJobStatus(job.status)) return { error: `Job is already terminal (${job.status})`, statusCode: 409, code: 'job_already_terminal' };
      if (!canTransitionJob(job, 'claim')) return { error: `Job status ${job.status} cannot be claimed`, statusCode: 400, code: transitionErrorCode(job, 'claim') };
      job.assignedAgentId = agent.id;
      job.status = 'claimed';
      job.claimedAt = nowIso();
      job.logs.push(`claimed by ${agent.id}`);
      return { ok: true, job, agent };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    if (result.job?.workflowParentId) await reconcileWorkflowParent(result.job.workflowParentId);
    await touchEvent('RUNNING', `${result.agent.name} claimed ${result.job.taskType}/${result.job.id.slice(0, 6)}`);
    return json(res, 200, result);
  }

  const resultSubmitMatch = req.method === 'POST' && url.pathname.match(/^\/api\/jobs\/([^/]+)\/result$/);
  if (resultSubmitMatch) {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const requestedAgentId = String(body.agent_id || '').trim();
    if (!requestedAgentId) return json(res, 400, { error: 'agent_id required' });
    const current = await storage.getState();
    const authorization = authorizeConnectedAgentAction(current, req, requestedAgentId);
    if (authorization.error) return json(res, authorization.statusCode || 400, { error: authorization.error });
    const result = await completeJobFromAgentResult(resultSubmitMatch[1], requestedAgentId, body, { source: 'manual-result' });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    await touchEvent('COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed by connected agent`);
    await recordBillingOutcome(result.job, result.billing, 'manual-result');
    return json(res, 200, {
      ...result,
      delivery: {
        report: result.job.output?.report || null,
        files: result.job.output?.files || [],
        returnTargets: result.job.output?.returnTargets || ['chat', 'api', 'webhook']
      }
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/dev/recurring-sweep') {
    if (!runtimePolicy(req).devApiEnabled) return json(res, 403, { error: 'Dev API disabled' });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const result = await runRecurringOrderSweep(req, {
      limit: body.limit || 10,
      at: body.at || nowIso()
    });
    return json(res, 200, result);
  }

  if (req.method === 'POST' && url.pathname === '/api/dev/dispatch-retry') {
    if (!runtimePolicy(req).devApiEnabled) return json(res, 403, { error: 'Dev API disabled' });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.job_id) return json(res, 400, { error: 'job_id required' });
    const current = await storage.getState();
    const job = current.jobs.find(j => j.id === body.job_id);
    if (!job) return json(res, 404, { error: 'Job not found' });
    const agent = current.agents.find(a => a.id === job.assignedAgentId);
    if (!agent) return json(res, 404, { error: 'Assigned agent not found' });
    if (!isAgentVerified(agent)) return json(res, 403, { error: 'Assigned agent is not verified' });
    if (!canTransitionJob(job, 'retry')) return json(res, 400, { error: `Job status ${job.status} is not retryable`, code: transitionErrorCode(job, 'retry') });
    if (job.status === 'failed' && job.dispatch && job.dispatch.retryable === false) {
      return json(res, 409, { error: 'Job is marked non-retryable', failure_category: job.failureCategory, dispatch: job.dispatch });
    }
    if (!canRetryDispatch(job)) {
      return json(res, 409, { error: 'Retry limit reached', attempts: Number(job.dispatch?.attempts || 0), max_retries: maxDispatchRetriesForJob(job) });
    }
    try {
      const dispatch = await dispatchJobToAssignedAgent(job, agent);
      const final = await storage.mutate(async (draft) => {
        const draftJob = draft.jobs.find(j => j.id === job.id);
        const draftAgent = draft.agents.find(a => a.id === agent.id);
        if (!draftJob) return { error: 'Job not found', statusCode: 404 };
        if (!dispatch.ok) {
          const failureMeta = buildDispatchFailureMeta(draftJob, dispatch.statusCode, dispatch.failureReason);
          draftJob.status = 'failed';
          draftJob.failedAt = nowIso();
          draftJob.failureReason = dispatch.failureReason;
          draftJob.failureCategory = failureMeta.category;
          draftJob.dispatch = {
            ...(draftJob.dispatch || {}),
            endpoint: dispatch.endpoint || draftJob.dispatch?.endpoint || null,
            statusCode: dispatch.statusCode || null,
            responseStatus: dispatch.responseBody?.status || null,
            lastAttemptAt: nowIso(),
            attempts: failureMeta.attempts,
            retryable: failureMeta.retryable,
            nextRetryAt: failureMeta.nextRetryAt,
            completionStatus: 'failed'
          };
          draftJob.logs.push('manual dispatch retry failed', dispatch.failureReason, `retryable=${failureMeta.retryable}`);
          return { ok: true, mode: 'failed', job: draftJob };
        }
        draftJob.dispatchedAt = nowIso();
        draftJob.startedAt = draftJob.startedAt || draftJob.dispatchedAt;
        draftJob.status = 'dispatched';
        draftJob.completedAt = null;
        draftJob.failedAt = null;
        draftJob.timedOutAt = null;
        draftJob.failureReason = null;
        draftJob.failureCategory = null;
        draftJob.dispatch = {
          endpoint: dispatch.endpoint,
          statusCode: dispatch.statusCode,
          externalJobId: dispatch.normalized.externalJobId,
          responseStatus: dispatch.normalized.status,
          lastAttemptAt: nowIso(),
          attempts: Number(draftJob.dispatch?.attempts || 0) + 1,
          retryable: false,
          nextRetryAt: null,
          completionStatus: dispatch.normalized.completed ? 'completed' : 'accepted'
        };
        if (dispatch.normalized.completed) {
          const billing = estimateBilling(agent, dispatch.normalized.usage);
          draftJob.status = 'completed';
          draftJob.completedAt = nowIso();
          draftJob.usage = dispatch.normalized.usage;
          draftJob.output = {
            report: dispatch.normalized.report,
            files: dispatch.normalized.files,
            returnTargets: dispatch.normalized.returnTargets
          };
          draftJob.actualBilling = billing;
          draftJob.deliveryQuality = {
            score: deliveryQualityScoreForJob(draftJob),
            version: 'delivery-quality/v1',
            checkedAt: draftJob.completedAt
          };
          draftJob.logs.push('manual dispatch retry completed job', billingLogLine(draftJob, billing), `delivery quality score=${draftJob.deliveryQuality.score}`);
          settleAgentEarnings(draftJob, draftAgent, billing);
          return { ok: true, mode: 'completed', job: draftJob, billing };
        }
        draftJob.status = 'dispatched';
        draftJob.logs.push('manual dispatch retry accepted');
        return { ok: true, mode: 'dispatched', job: draftJob };
      });
      if (final.error) return json(res, final.statusCode || 500, { error: final.error });
      if (final.job?.workflowParentId) await reconcileWorkflowParent(final.job.workflowParentId);
      if (final.mode === 'completed') {
        await touchEvent('COMPLETED', `${job.taskType}/${job.id.slice(0, 6)} completed after retry`);
        await recordBillingOutcome(final.job, final.billing, 'dispatch-retry');
      } else if (final.mode === 'dispatched') {
        await touchEvent('RUNNING', `${agent.name} accepted retry for ${job.taskType}/${job.id.slice(0, 6)}`);
      } else {
        await touchEvent('FAILED', `${job.taskType}/${job.id.slice(0, 6)} retry failed`);
      }
      return json(res, 200, final);
    } catch (error) {
      const failureMeta = buildDispatchFailureMeta(job, 0, error.message);
      const failed = await failJob(job.id, error.message, ['manual dispatch retry exception'], {
        failureCategory: failureMeta.category,
        retryable: failureMeta.retryable,
        nextRetryAt: failureMeta.nextRetryAt,
        attempts: failureMeta.attempts
      });
      await touchEvent('FAILED', `${job.taskType}/${job.id.slice(0, 6)} retry exception`);
      return json(res, 500, { error: failed?.failureReason || error.message, dispatch: failed?.dispatch || null });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/dev/timeout-sweep') {
    if (!runtimePolicy(req).devApiEnabled) return json(res, 403, { error: 'Dev API disabled' });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const maxAgeSec = Math.max(1, Number(body.max_age_sec || 300));
    const now = Date.now();
    const result = await storage.mutate(async (draft) => {
      const timedOut = [];
      for (const job of draft.jobs) {
        if (!canTransitionJob(job, 'timeout')) continue;
        const basis = job.dispatchedAt || job.startedAt || job.createdAt;
        const ageMs = Math.max(0, now - new Date(basis).getTime());
        if (ageMs < maxAgeSec * 1000) continue;
        const attempts = Number(job.dispatch?.attempts || 0);
        const nextAttempt = attempts + 1;
        const maxRetries = maxDispatchRetriesForJob(job);
        const retryable = nextAttempt <= maxRetries;
        job.status = 'timed_out';
        job.timedOutAt = nowIso();
        job.failedAt = nowIso();
        job.failureReason = `Timed out after ${maxAgeSec}s`;
        job.failureCategory = 'deadline_timeout';
        job.dispatch = {
          ...(job.dispatch || {}),
          completionStatus: 'timed_out',
          failedAt: job.failedAt,
          attempts,
          retryable,
          nextRetryAt: retryable ? computeNextRetryAt(nextAttempt, now) : null,
          maxRetries
        };
        job.logs.push(`timeout sweep marked timed_out at ${job.timedOutAt}`, `retryable=${retryable}`, `attempts=${attempts}/${maxRetries}`);
        timedOut.push({ id: job.id, taskType: job.taskType, status: job.status, retryable, nextRetryAt: job.dispatch.nextRetryAt, attempts, maxRetries });
      }
      return { ok: true, timedOut };
    });
    for (const item of result.timedOut) {
      const timedOutJob = (await storage.getState()).jobs.find((job) => job.id === item.id);
      if (timedOutJob?.workflowParentId) await reconcileWorkflowParent(timedOutJob.workflowParentId);
    }
    for (const item of result.timedOut) {
      const retryMessage = item.retryable
        ? `${item.taskType}/${item.id.slice(0, 6)} timed out; retry ${item.attempts + 1}/${item.maxRetries} available`
        : `${item.taskType}/${item.id.slice(0, 6)} timed out; retries exhausted at ${item.attempts}/${item.maxRetries}`;
      await touchEvent('TIMEOUT', retryMessage, {
        kind: 'run_timeout',
        jobId: item.id,
        retryable: item.retryable,
        attempts: item.attempts,
        maxRetries: item.maxRetries,
        nextRetryAt: item.nextRetryAt
      });
    }
    return json(res, 200, { ok: true, count: result.timedOut.length, timedOut: result.timedOut });
  }
  if (req.method === 'POST' && url.pathname === '/api/dev/resolve-job') {
    if (!runtimePolicy(req).devApiEnabled) return json(res, 403, { error: 'Dev API disabled' });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const mode = body.mode || 'complete';
    const result = await storage.mutate(async (state) => {
      const job = state.jobs.find(j => j.id === body.job_id);
      if (!job) return { error: 'Job not found', statusCode: 404 };
      if (!job.assignedAgentId) {
        job.status = 'failed';
        job.failedAt = nowIso();
        job.failureReason = job.failureReason || 'No assigned agent';
        return { status: 'failed', job };
      }
      const agent = state.agents.find(a => a.id === job.assignedAgentId);
      if (!agent) return { error: 'Assigned agent not found', statusCode: 404 };
      if (!isAgentVerified(agent)) return { error: 'Assigned agent is not verified', statusCode: 403 };
      job.startedAt = nowIso();
      job.status = 'running';
      job.logs.push(`started by ${agent.id}`);
      if (mode === 'fail') {
        job.status = 'failed';
        job.failedAt = nowIso();
        job.failureReason = 'Simulated failure';
        job.logs.push('simulated failure');
        return { status: 'failed', job };
      }
      const apiCost = Number(body.api_cost || Math.max(60, Math.min(240, Math.round((job.budgetCap || 180) * 0.35))));
      const usage = normalizeUsageForBilling({
        api_cost: apiCost,
        total_cost_basis: body.total_cost_basis,
        cost_basis: body.cost_basis
      }, apiCost);
      const billing = estimateBilling(agent, usage);
      job.status = 'completed';
      job.completedAt = nowIso();
      job.usage = { ...usage, simulated: true };
      job.output = { summary: `Simulated completion for ${job.taskType}`, naturalLanguageIntent: job.prompt };
      job.actualBilling = billing;
      job.deliveryQuality = {
        score: deliveryQualityScoreForJob(job),
        version: 'delivery-quality/v1',
        checkedAt: job.completedAt
      };
      job.logs.push(`completed by ${agent.id}`, billingLogLine(job, billing), `delivery quality score=${job.deliveryQuality.score}`);
      settleAgentEarnings(job, agent, billing);
      return { status: 'completed', job, billing };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    if (result.job?.workflowParentId) await reconcileWorkflowParent(result.job.workflowParentId);
    if (result.status === 'failed') {
      await touchEvent('FAILED', `${result.job.taskType}/${result.job.id.slice(0, 6)} failed`);
      return json(res, 200, { status: 'failed', failure_reason: result.job.failureReason, job: result.job });
    }
    await touchEvent('RUNNING', `${result.job.assignedAgentId} started ${result.job.taskType}/${result.job.id.slice(0, 6)}`);
    await touchEvent('COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed`);
    await recordBillingOutcome(result.job, result.billing, 'dev-resolve-job');
    return json(res, 200, { status: 'completed', billing: result.billing, job: result.job });
  }
  if (req.method === 'POST' && url.pathname === '/api/seed') {
    if (!runtimePolicy(req).devApiEnabled) return json(res, 403, { error: 'Dev API disabled' });
    const current = currentUserContext(req);
    const requester = requesterContextFromUser(current.user, current.authProvider, {
      login: current.login,
      accountId: accountIdForLogin(current.login)
    });
    const samples = [
      ['research', '中古iPhone 13の買取比較'],
      ['writing', '比較結果をLPコピーに変換'],
      ['code', '料金計算ロジックのバグ修正'],
      ['summary', '商流を短く整理']
    ];
    const seededIds = [];
    for (const [taskType, prompt] of samples) {
      const state = await storage.getState();
      const picked = pickAgent(state.agents, taskType, 300);
      if (!picked) continue;
      const apiCost = Math.floor(80 + Math.random() * 60);
      const usage = { api_cost: apiCost, simulated: true };
      const billing = estimateBilling(picked.agent, usage);
      const job = {
        id: randomUUID(),
        parentAgentId: 'cloudcode-main',
        taskType,
        prompt,
        input: { _broker: { requester, billingMode: 'monthly_invoice' } },
        budgetCap: 300,
        deadlineSec: 120,
        priority: 'normal',
        status: 'completed',
        assignedAgentId: picked.agent.id,
        score: picked.score,
        createdAt: nowIso(),
        startedAt: nowIso(),
        completedAt: nowIso(),
        billingEstimate: estimateBilling(picked.agent, 100),
        actualBilling: billing,
        usage,
        output: { summary: 'demo output' },
        logs: ['seeded demo job']
      };
      await storage.mutate(async (draft) => {
        draft.jobs.unshift(job);
        const agent = draft.agents.find(a => a.id === picked.agent.id);
        if (agent) agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
      });
      seededIds.push(job.id);
      await touchEvent('MATCHED', `${job.taskType}/${job.id.slice(0, 6)} -> ${picked.agent.name}`);
      await touchEvent('COMPLETED', `${job.taskType}/${job.id.slice(0, 6)} completed`);
      await touchEvent('BILLED', `api=${job.actualBilling.apiCost} total=${job.actualBilling.total}`);
      await appendBillingAudit(job, job.actualBilling, { source: 'seed' });
    }
    return json(res, 200, { ok: true, job_ids: seededIds });
  }
  if (serveStatic(res, url.pathname)) return;
  return json(res, 404, { error: 'Not found' });
});

const port = process.env.PORT || 4323;
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, async () => {
  await migrateLegacyAgents();
  await touchEvent('LIVE', 'broker online');
  console.log(`agent-market-app running at http://${host}:${port}`);
});
