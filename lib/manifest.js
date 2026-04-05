import { normalizeTaskTypes } from './shared.js';

export const MANIFEST_CANDIDATE_PATHS = ['agent.json', 'agent.yaml', '.well-known/agent.json'];
const MANIFEST_AUTH_TYPES = new Set(['none', 'bearer', 'header']);

function normalizeManifestAuth(input) {
  const auth = input && typeof input === 'object' ? input : {};
  const type = String(auth.type || auth.kind || 'none').trim().toLowerCase() || 'none';
  const headerName = String(auth.header_name || auth.headerName || (type === 'bearer' ? 'authorization' : '')).trim();
  const prefix = String(auth.prefix || auth.scheme || (type === 'bearer' ? 'Bearer' : '')).trim();
  const token = String(auth.token || auth.api_key || auth.apiKey || auth.bearer_token || auth.bearerToken || '').trim();
  return {
    type,
    headerName,
    prefix,
    token,
    instructions: String(auth.instructions || '').trim()
  };
}

export function sanitizeManifestForPublic(manifest = {}) {
  if (!manifest || typeof manifest !== 'object') return manifest;
  const clone = structuredClone(manifest);
  if (clone.verification && typeof clone.verification === 'object') {
    delete clone.verification.challengeToken;
    delete clone.verification.challenge_token;
  }
  if (clone.auth && typeof clone.auth === 'object') {
    delete clone.auth.token;
    delete clone.auth.api_key;
    delete clone.auth.apiKey;
    delete clone.auth.bearer_token;
    delete clone.auth.bearerToken;
    delete clone.auth.secret;
    delete clone.auth.value;
  }
  return clone;
}

export function parseManifestContent(text, options = {}) {
  const contentType = String(options.contentType || '').toLowerCase();
  const sourceUrl = String(options.sourceUrl || '');
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Manifest is empty');
  const isYaml = sourceUrl.endsWith('.yaml') || sourceUrl.endsWith('.yml') || /yaml|yml/.test(contentType);
  if (isYaml) throw new Error('YAML manifests are detected but unsupported. Provide JSON manifest.');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Manifest must be valid JSON');
  }
}

export function normalizeManifest(input = {}, options = {}) {
  const taskTypes = normalizeTaskTypes(input.task_types || input.taskTypes || input.tasks || []);
  const pricing = input.pricing && typeof input.pricing === 'object' ? input.pricing : {};
  const verification = input.verification && typeof input.verification === 'object' ? input.verification : {};
  const auth = normalizeManifestAuth(input.auth);
  const manifest = {
    schemaVersion: String(input.schema_version || input.schemaVersion || 'agent-manifest/v1').trim(),
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim(),
    taskTypes,
    premiumRate: Number(input.premium_rate ?? input.premiumRate ?? pricing.premium_rate ?? pricing.premiumRate ?? 0.1),
    basicRate: Number(input.basic_rate ?? input.basicRate ?? pricing.basic_rate ?? pricing.basicRate ?? 0.1),
    successRate: Number(input.success_rate ?? input.successRate ?? 0.9),
    avgLatencySec: Number(input.avg_latency_sec ?? input.avgLatencySec ?? 20),
    owner: input.owner ? String(input.owner).trim() : '',
    healthcheckUrl: String(input.healthcheck_url || input.health_url || input.healthUrl || input?.endpoints?.health || '').trim(),
    verification: {
      challengePath: String(verification.challenge_path || verification.challengePath || '').trim(),
      challengeToken: String(verification.challenge_token || verification.challengeToken || '').trim(),
      challengeUrl: String(verification.challenge_url || verification.challengeUrl || '').trim(),
      method: String(verification.method || 'http-file').trim()
    },
    auth,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    raw: input,
    sourceUrl: options.sourceUrl || null
  };
  return manifest;
}

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest?.schemaVersion) errors.push('manifest.schema_version is required');
  if (manifest?.schemaVersion !== 'agent-manifest/v1') errors.push('manifest.schema_version must be agent-manifest/v1');
  if (!manifest?.name) errors.push('manifest.name is required');
  if (!Array.isArray(manifest?.taskTypes) || !manifest.taskTypes.length) errors.push('manifest.task_types must include at least one task type');
  if (!Number.isFinite(manifest?.premiumRate) || manifest.premiumRate < 0) errors.push('manifest premium_rate must be a non-negative number');
  if (!Number.isFinite(manifest?.basicRate) || manifest.basicRate < 0) errors.push('manifest basic_rate must be a non-negative number');
  if (!Number.isFinite(manifest?.successRate) || manifest.successRate < 0 || manifest.successRate > 1) errors.push('manifest success_rate must be between 0 and 1');
  if (!Number.isFinite(manifest?.avgLatencySec) || manifest.avgLatencySec < 0) errors.push('manifest avg_latency_sec must be a non-negative number');
  if (manifest?.verification?.challengeToken && !manifest?.verification?.challengePath && !manifest?.verification?.challengeUrl) {
    errors.push('manifest.verification challenge requires challenge_path or challenge_url');
  }
  if (!MANIFEST_AUTH_TYPES.has(String(manifest?.auth?.type || 'none'))) {
    errors.push('manifest.auth.type must be one of: none, bearer, header');
  }
  if (['bearer', 'header'].includes(manifest?.auth?.type) && !manifest?.auth?.token) {
    errors.push(`manifest.auth.${manifest?.auth?.type === 'bearer' ? 'token' : 'token'} is required when auth.type=${manifest?.auth?.type}`);
  }
  if (manifest?.auth?.type === 'header' && !manifest?.auth?.headerName) {
    errors.push('manifest.auth.header_name is required when auth.type=header');
  }
  return { ok: errors.length === 0, errors };
}

export function parseAndValidateManifest(text, options = {}) {
  const parsed = parseManifestContent(text, options);
  const manifest = normalizeManifest(parsed, options);
  const validation = validateManifest(manifest);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  return manifest;
}

export function buildManifestCandidateUrls(baseUrl) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  return MANIFEST_CANDIDATE_PATHS.map(path => `${root}/${path}`);
}
