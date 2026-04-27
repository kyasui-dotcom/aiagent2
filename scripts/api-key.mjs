import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://aiagent-marketplace.net';
const SESSION_COOKIE_NAME = 'aiagent2_session';

function envValue(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function usage() {
  return `CAIt API key CLI

Issue, list, and revoke CAIt API keys without using the browser key form.

User session mode:
  1. Log in to CAIt in the browser
  2. Copy the ${SESSION_COOKIE_NAME} cookie value from the browser devtools
  3. Run:

PowerShell:
  $env:CAIT_SESSION_COOKIE="${SESSION_COOKIE_NAME}=..."
  npm run cait:key -- create --label codex-desktop
  npm run cait:key -- list
  npm run cait:key -- revoke <key_id>

Operator mode:
  1. Configure CAIT_ADMIN_API_TOKEN on the deployed Worker
  2. Keep the same token only in the operator shell or secret manager
  3. Run:

PowerShell:
  $env:CAIT_ADMIN_API_TOKEN="..."
  npm run cait:key -- create --login user@example.com --label codex-desktop

Commands:
  create                 issue a live CAIt API key
  issue                  alias for create
  list                   list keys for the session user
  revoke <key_id>        revoke a key for the session user

Options:
  --base-url <url>       default: ${DEFAULT_BASE_URL}
  --label <title>        required for create/issue. Example: codex-desktop
  --mode <live|test>     default: live. Public deployment rejects test keys.
  --login <login>        operator mode target account
  --admin-token <token>  operator token, or use CAIT_ADMIN_API_TOKEN
  --cookie <cookie>      session cookie, or use CAIT_SESSION_COOKIE
  --json                 output raw JSON
  --export               also print a PowerShell CAIT_API_KEY export line

Security:
  The raw token is printed once. Store it in a shell/backend secret store, not in chat text or frontend code.
`;
}

export function parseApiKeyArgs(argv = []) {
  const args = [...argv];
  const command = String(args.shift() || 'help').toLowerCase();
  const options = {
    command,
    baseUrl: envValue('CAIT_BASE_URL', DEFAULT_BASE_URL),
    label: envValue('CAIT_KEY_LABEL'),
    mode: envValue('CAIT_KEY_MODE', 'live'),
    login: envValue('CAIT_KEY_LOGIN'),
    adminToken: envValue('CAIT_ADMIN_API_TOKEN') || envValue('CAIT_OPERATOR_TOKEN'),
    sessionCookie: envValue('CAIT_SESSION_COOKIE') || envValue('CAIT_COOKIE'),
    json: false,
    printExport: false,
    targetId: ''
  };
  while (args.length) {
    const arg = String(args.shift() || '');
    if (arg === '--base-url' || arg === '--base') {
      options.baseUrl = String(args.shift() || '').trim() || options.baseUrl;
    } else if (arg === '--label') {
      options.label = String(args.shift() || '').trim() || options.label;
    } else if (arg === '--mode') {
      options.mode = String(args.shift() || '').trim() || options.mode;
    } else if (arg === '--login' || arg === '--account') {
      options.login = String(args.shift() || '').trim();
    } else if (arg === '--admin-token' || arg === '--operator-token') {
      options.adminToken = String(args.shift() || '').trim();
    } else if (arg === '--cookie' || arg === '--session-cookie') {
      options.sessionCookie = String(args.shift() || '').trim();
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--export') {
      options.printExport = true;
    } else if (!options.targetId) {
      options.targetId = arg.trim();
    }
  }
  options.baseUrl = options.baseUrl.replace(/\/+$/, '') || DEFAULT_BASE_URL;
  options.mode = String(options.mode || 'live').toLowerCase();
  return options;
}

function normalizeIssueLabel(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function requireIssueLabel(options) {
  const label = normalizeIssueLabel(options.label);
  if (!label) {
    throw new Error('--label is required when creating a CAIt API key. Example: npm run cait:key -- create --label codex-desktop');
  }
  if (label.length > 80) {
    throw new Error('--label must be 80 characters or fewer.');
  }
  options.label = label;
}

function normalizeCookie(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('=')) return raw;
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(raw)}`;
}

function originFor(baseUrl = '') {
  return new URL(baseUrl).origin;
}

async function requestJson(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!response.ok) {
    const message = body?.error || body?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function sessionAuthHeaders(options) {
  const cookie = normalizeCookie(options.sessionCookie);
  if (!cookie) {
    throw new Error('CAIT_SESSION_COOKIE is required for session mode. Use --cookie or set CAIT_SESSION_COOKIE.');
  }
  const status = await requestJson(options.baseUrl, '/auth/status', {
    method: 'GET',
    headers: { cookie }
  });
  if (!status?.loggedIn || !status?.csrfToken) {
    throw new Error('Session cookie is not logged in or does not include a CSRF token.');
  }
  return {
    cookie,
    login: status.accountLogin || status.login || '',
    headers: {
      cookie,
      origin: originFor(options.baseUrl),
      'x-aiagent2-csrf': status.csrfToken
    }
  };
}

async function createWithAdminToken(options) {
  if (!options.login) throw new Error('--login is required for operator mode.');
  if (!options.adminToken) throw new Error('CAIT_ADMIN_API_TOKEN is required for operator mode.');
  return requestJson(options.baseUrl, '/api/admin/api-keys', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.adminToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      login: options.login,
      label: options.label,
      mode: options.mode
    })
  });
}

async function createWithAdminSession(options) {
  if (!options.login) throw new Error('--login is required for admin session mode.');
  const auth = await sessionAuthHeaders(options);
  return requestJson(options.baseUrl, '/api/admin/api-keys', {
    method: 'POST',
    headers: {
      ...auth.headers,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      login: options.login,
      label: options.label,
      mode: options.mode
    })
  });
}

async function createWithUserSession(options) {
  const auth = await sessionAuthHeaders(options);
  return requestJson(options.baseUrl, '/api/settings/api-keys', {
    method: 'POST',
    headers: {
      ...auth.headers,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      label: options.label,
      mode: options.mode
    })
  });
}

async function listWithUserSession(options) {
  const auth = await sessionAuthHeaders(options);
  return requestJson(options.baseUrl, '/api/settings/api-keys', {
    method: 'GET',
    headers: { cookie: auth.cookie }
  });
}

async function revokeWithUserSession(options) {
  const keyId = String(options.targetId || '').trim();
  if (!keyId) throw new Error('key_id is required. Example: npm run cait:key -- revoke key_...');
  const auth = await sessionAuthHeaders(options);
  return requestJson(options.baseUrl, `/api/settings/api-keys/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
    headers: auth.headers
  });
}

function printIssuedKey(result = {}, options = {}) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const key = result.api_key || result.apiKey || {};
  const account = result.account || {};
  process.stdout.write([
    'CAIt API key issued',
    `account: ${account.login || result.login || options.login || '-'}`,
    `label: ${key.label || options.label || '-'}`,
    `mode: ${key.mode || options.mode || '-'}`,
    `key_id: ${key.id || '-'}`,
    'token:',
    key.token || ''
  ].join('\n'));
  process.stdout.write('\n');
  if (options.printExport && key.token) {
    process.stdout.write(`$env:CAIT_API_KEY="${key.token}"\n`);
  }
}

function printList(result = {}, options = {}) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const keys = Array.isArray(result.api_keys) ? result.api_keys : [];
  if (!keys.length) {
    process.stdout.write('No CAIt API keys.\n');
    return;
  }
  for (const key of keys) {
    const status = key.revokedAt ? 'revoked' : (key.active === false ? 'inactive' : 'active');
    process.stdout.write(`${key.id} | ${key.label || '-'} | ${key.mode || 'live'} | ${status} | prefix=${key.prefix || '-'} | last_used=${key.lastUsedAt || '-'}\n`);
  }
}

function printGeneric(result = {}, options = {}) {
  process.stdout.write(`${JSON.stringify(result, null, options.json ? 2 : 0)}\n`);
}

export async function runApiKeyCli(argv = process.argv.slice(2)) {
  const options = parseApiKeyArgs(argv);
  if (['help', '--help', '-h'].includes(options.command)) {
    process.stdout.write(usage());
    return;
  }
  if (options.command === 'create' || options.command === 'issue') {
    requireIssueLabel(options);
    const result = options.login
      ? (options.adminToken ? await createWithAdminToken(options) : await createWithAdminSession(options))
      : await createWithUserSession(options);
    printIssuedKey(result, options);
    return;
  }
  if (options.command === 'list') {
    printList(await listWithUserSession(options), options);
    return;
  }
  if (options.command === 'revoke') {
    printGeneric(await revokeWithUserSession(options), options);
    return;
  }
  throw new Error(`Unknown API key command: ${options.command}\n\n${usage()}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runApiKeyCli().catch((error) => {
    process.stderr.write(`CAIt API key CLI error: ${error.message}\n`);
    if (error.body) process.stderr.write(`${JSON.stringify(error.body, null, 2)}\n`);
    process.exitCode = 1;
  });
}
