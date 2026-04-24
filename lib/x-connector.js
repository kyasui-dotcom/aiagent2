const X_OAUTH_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];
const encoder = new TextEncoder();
const tokenKeyCache = new Map();

function normalizeString(value = '', fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  return Buffer.from(bytes).toString('base64url');
}

function base64UrlDecode(value = '') {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64url'));
}

function base64Decode(value = '') {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64'));
}

function basicAuth(clientId = '', clientSecret = '') {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

function xClientId(env = {}) {
  return normalizeString(env?.X_CLIENT_ID || env?.TWITTER_CLIENT_ID);
}

function xClientSecret(env = {}) {
  return normalizeString(env?.X_CLIENT_SECRET || env?.TWITTER_CLIENT_SECRET);
}

export function xOAuthConfigured(env = {}) {
  return Boolean(xClientId(env) && xClientSecret(env));
}

export function xTokenEncryptionConfigured(env = {}) {
  const raw = normalizeString(env?.X_TOKEN_ENCRYPTION_KEY || env?.TWITTER_TOKEN_ENCRYPTION_KEY);
  if (!raw) return false;
  try {
    return base64Decode(raw).byteLength === 32;
  } catch {
    return false;
  }
}

async function xTokenCryptoKey(env = {}) {
  const raw = normalizeString(env?.X_TOKEN_ENCRYPTION_KEY || env?.TWITTER_TOKEN_ENCRYPTION_KEY);
  if (!raw) throw new Error('X_TOKEN_ENCRYPTION_KEY is not configured.');
  if (tokenKeyCache.has(raw)) return tokenKeyCache.get(raw);
  const keyBytes = base64Decode(raw);
  if (keyBytes.byteLength !== 32) throw new Error('X_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 bytes.');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  tokenKeyCache.set(raw, key);
  return key;
}

export async function encryptXSecret(env = {}, value = '') {
  const text = normalizeString(value);
  if (!text) return '';
  const key = await xTokenCryptoKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
  return `v1:${base64UrlEncode(iv)}:${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

export async function decryptXSecret(env = {}, encrypted = '') {
  const raw = normalizeString(encrypted);
  if (!raw) return '';
  const [version, ivPart, dataPart] = raw.split(':');
  if (version !== 'v1' || !ivPart || !dataPart) throw new Error('Invalid encrypted X token format.');
  const key = await xTokenCryptoKey(env);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlDecode(ivPart) }, key, base64UrlDecode(dataPart));
  return Buffer.from(decrypted).toString('utf8');
}

export async function buildXPkcePair() {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

export function buildXAuthorizeUrl(env = {}, { callbackUrl = '', state = '', codeChallenge = '' } = {}) {
  const clientId = xClientId(env);
  if (!clientId) throw new Error('X_CLIENT_ID is not configured.');
  const url = new URL('https://twitter.com/i/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('scope', X_OAUTH_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'consent');
  return url;
}

async function fetchXJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.detail || payload?.title || payload?.error || `X request failed (${response.status})`);
  }
  return payload;
}

export async function exchangeXOAuthCode(env = {}, { code = '', codeVerifier = '', callbackUrl = '' } = {}) {
  const clientId = xClientId(env);
  const clientSecret = xClientSecret(env);
  if (!clientId || !clientSecret) throw new Error('X OAuth is not configured.');
  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('code', code);
  params.set('redirect_uri', callbackUrl);
  params.set('code_verifier', codeVerifier);
  params.set('client_id', clientId);
  return fetchXJson('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    body: params.toString()
  });
}

async function refreshXOAuthToken(env = {}, refreshToken = '') {
  const clientId = xClientId(env);
  const clientSecret = xClientSecret(env);
  if (!clientId || !clientSecret) throw new Error('X OAuth is not configured.');
  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', refreshToken);
  params.set('client_id', clientId);
  return fetchXJson('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    body: params.toString()
  });
}

export async function fetchXProfile(accessToken = '') {
  const payload = await fetchXJson('https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url', {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  return payload?.data || null;
}

export async function xConnectorFromOAuthToken(env = {}, profile = {}, token = {}, existing = {}) {
  const now = new Date().toISOString();
  return {
    ...(existing || {}),
    provider: 'x-oauth',
    connected: true,
    xUserId: normalizeString(profile?.id || existing?.xUserId),
    username: normalizeString(profile?.username || existing?.username).replace(/^@/, ''),
    displayName: normalizeString(profile?.name || existing?.displayName),
    profileImageUrl: normalizeString(profile?.profile_image_url || existing?.profileImageUrl),
    accessTokenEnc: await encryptXSecret(env, token.access_token || ''),
    refreshTokenEnc: token.refresh_token
      ? await encryptXSecret(env, token.refresh_token)
      : normalizeString(existing?.refreshTokenEnc),
    scopes: normalizeString(token.scope || token.scopes || existing?.scopes),
    tokenExpiresAt: token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : normalizeString(existing?.tokenExpiresAt),
    connectedAt: normalizeString(existing?.connectedAt, now),
    updatedAt: now,
    rateLimitResetAt: normalizeString(existing?.rateLimitResetAt),
    lastPostAt: normalizeString(existing?.lastPostAt),
    lastPostedTweetId: normalizeString(existing?.lastPostedTweetId),
    postCount: Math.max(0, Number(existing?.postCount || 0) || 0)
  };
}

export function publicXConnectorStatus(connector = null, env = {}) {
  const x = connector && typeof connector === 'object' ? connector : {};
  return {
    configured: xOAuthConfigured(env),
    encryptionConfigured: xTokenEncryptionConfigured(env),
    connected: Boolean(x.connected && x.accessTokenEnc && x.username),
    username: normalizeString(x.username),
    displayName: normalizeString(x.displayName),
    profileImageUrl: normalizeString(x.profileImageUrl),
    scopes: normalizeString(x.scopes),
    connectedAt: normalizeString(x.connectedAt),
    updatedAt: normalizeString(x.updatedAt),
    lastPostAt: normalizeString(x.lastPostAt),
    lastPostedTweetId: normalizeString(x.lastPostedTweetId),
    postCount: Math.max(0, Number(x.postCount || 0) || 0),
    rateLimitResetAt: normalizeString(x.rateLimitResetAt)
  };
}

export function validateXPostText(text = '') {
  const value = normalizeString(text);
  if (!value) return { ok: false, error: 'Post text is empty.' };
  if (value.length > 280) return { ok: false, error: 'Post text must be 280 characters or less.', length: value.length };
  const mentions = value.match(/(^|[\s(])@[A-Za-z0-9_]{1,15}\b/g) || [];
  if (mentions.length > 3) return { ok: false, error: 'Too many @mentions for a safe one-click post.' };
  if (/(?:ignore previous|system prompt|developer message|api key|secret|token|password|シークレット|トークン|パスワード)/i.test(value)) {
    return { ok: false, error: 'This text looks like it may contain unsafe instructions or secrets.' };
  }
  return { ok: true, text: value, length: value.length };
}

async function freshXAccessToken(env = {}, connector = {}) {
  if (!connector?.accessTokenEnc) throw new Error('X is not connected.');
  const expiresAt = Date.parse(connector.tokenExpiresAt || '');
  const shouldRefresh = connector.refreshTokenEnc
    && Number.isFinite(expiresAt)
    && expiresAt - Date.now() < 90_000;
  if (!shouldRefresh) {
    return { accessToken: await decryptXSecret(env, connector.accessTokenEnc), connector, refreshed: false };
  }
  const refreshToken = await decryptXSecret(env, connector.refreshTokenEnc);
  const refreshed = await refreshXOAuthToken(env, refreshToken);
  const nextConnector = {
    ...connector,
    accessTokenEnc: await encryptXSecret(env, refreshed.access_token || ''),
    refreshTokenEnc: refreshed.refresh_token ? await encryptXSecret(env, refreshed.refresh_token) : connector.refreshTokenEnc,
    scopes: normalizeString(refreshed.scope || connector.scopes),
    tokenExpiresAt: refreshed.expires_in
      ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
      : connector.tokenExpiresAt,
    updatedAt: new Date().toISOString()
  };
  return { accessToken: refreshed.access_token, connector: nextConnector, refreshed: true };
}

export async function postXTweet(env = {}, connector = {}, { text = '', replyToTweetId = '' } = {}) {
  const validation = validateXPostText(text);
  if (!validation.ok) {
    const error = new Error(validation.error);
    error.statusCode = 400;
    throw error;
  }
  if (!xOAuthConfigured(env)) throw new Error('X OAuth is not configured.');
  if (!xTokenEncryptionConfigured(env)) throw new Error('X token encryption is not configured.');
  const fresh = await freshXAccessToken(env, connector);
  const body = { text: validation.text };
  if (replyToTweetId) body.reply = { in_reply_to_tweet_id: String(replyToTweetId) };
  const payload = await fetchXJson('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${fresh.accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  const tweetId = normalizeString(payload?.data?.id);
  if (!tweetId) throw new Error('X returned no tweet id.');
  const now = new Date().toISOString();
  const username = normalizeString(fresh.connector?.username);
  return {
    tweetId,
    url: username ? `https://x.com/${username}/status/${tweetId}` : `https://x.com/i/web/status/${tweetId}`,
    connector: {
      ...fresh.connector,
      connected: true,
      lastPostAt: now,
      lastPostedTweetId: tweetId,
      postCount: Math.max(0, Number(fresh.connector?.postCount || 0) || 0) + 1,
      updatedAt: now
    },
    refreshed: fresh.refreshed
  };
}
