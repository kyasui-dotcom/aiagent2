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

function connectorTokenKeyRaw(env = {}) {
  return normalizeString(
    env?.CONNECTOR_TOKEN_ENCRYPTION_KEY
    || env?.ACCOUNT_CONNECTOR_ENCRYPTION_KEY
    || env?.X_TOKEN_ENCRYPTION_KEY
    || env?.TWITTER_TOKEN_ENCRYPTION_KEY
  );
}

export function connectorTokenEncryptionConfigured(env = {}) {
  const raw = connectorTokenKeyRaw(env);
  if (!raw) return false;
  try {
    return base64Decode(raw).byteLength === 32;
  } catch {
    return false;
  }
}

async function connectorTokenCryptoKey(env = {}) {
  const raw = connectorTokenKeyRaw(env);
  if (!raw) throw new Error('CONNECTOR_TOKEN_ENCRYPTION_KEY is not configured.');
  if (tokenKeyCache.has(raw)) return tokenKeyCache.get(raw);
  const keyBytes = base64Decode(raw);
  if (keyBytes.byteLength !== 32) throw new Error('CONNECTOR token encryption key must be base64 for exactly 32 bytes.');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  tokenKeyCache.set(raw, key);
  return key;
}

export async function encryptConnectorSecret(env = {}, value = '') {
  const text = normalizeString(value);
  if (!text) return '';
  const key = await connectorTokenCryptoKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
  return `v1:${base64UrlEncode(iv)}:${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

export async function decryptConnectorSecret(env = {}, encrypted = '') {
  const raw = normalizeString(encrypted);
  if (!raw) return '';
  const [version, ivPart, dataPart] = raw.split(':');
  if (version !== 'v1' || !ivPart || !dataPart) throw new Error('Invalid encrypted connector secret format.');
  const key = await connectorTokenCryptoKey(env);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlDecode(ivPart) }, key, base64UrlDecode(dataPart));
  return Buffer.from(decrypted).toString('utf8');
}

export async function githubConnectorFromOAuthToken(env = {}, identity = {}, token = {}, scopes = [], existing = {}) {
  const now = new Date().toISOString();
  return {
    ...(existing || {}),
    provider: 'github-oauth',
    connected: true,
    providerUserId: normalizeString(identity?.providerUserId || identity?.id || existing?.providerUserId),
    login: normalizeString(identity?.login || existing?.login),
    name: normalizeString(identity?.name || existing?.name),
    email: normalizeString(identity?.email || existing?.email),
    profileUrl: normalizeString(identity?.profileUrl || existing?.profileUrl),
    avatarUrl: normalizeString(identity?.avatarUrl || existing?.avatarUrl),
    scopes: Array.isArray(scopes) ? scopes.map((item) => normalizeString(item)).filter(Boolean).join(' ') : normalizeString(scopes || existing?.scopes),
    accessTokenEnc: await encryptConnectorSecret(env, token?.access_token || ''),
    connectedAt: normalizeString(existing?.connectedAt, now),
    updatedAt: now
  };
}

export async function googleConnectorFromOAuthToken(env = {}, identity = {}, token = {}, existing = {}) {
  const now = new Date().toISOString();
  const expiresIn = Number(token?.expires_in || 0);
  return {
    ...(existing || {}),
    provider: 'google-oauth',
    connected: true,
    providerUserId: normalizeString(identity?.providerUserId || identity?.id || existing?.providerUserId),
    email: normalizeString(identity?.email || existing?.email),
    name: normalizeString(identity?.name || existing?.name),
    profileUrl: normalizeString(identity?.profileUrl || existing?.profileUrl),
    avatarUrl: normalizeString(identity?.avatarUrl || existing?.avatarUrl),
    scopes: normalizeString(token?.scope || existing?.scopes),
    accessTokenEnc: await encryptConnectorSecret(env, token?.access_token || ''),
    refreshTokenEnc: token?.refresh_token
      ? await encryptConnectorSecret(env, token.refresh_token)
      : normalizeString(existing?.refreshTokenEnc),
    tokenExpiresAt: expiresIn > 0
      ? new Date(Date.now() + (expiresIn * 1000)).toISOString()
      : normalizeString(existing?.tokenExpiresAt),
    connectedAt: normalizeString(existing?.connectedAt, now),
    updatedAt: now
  };
}
