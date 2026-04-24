import { BUILT_IN_KINDS } from './builtin-agents.js';
import { nowIso } from './shared.js';

const BUILT_IN_SAMPLE_KINDS = new Set(BUILT_IN_KINDS);

function deriveFallbackHealthcheckUrl(manifestUrl) {
  if (!manifestUrl) return '';
  try {
    const parsed = new URL(manifestUrl);
    return `${parsed.origin}/api/health`;
  } catch {
    return '';
  }
}

export function resolveHealthcheckUrl(agent) {
  const explicit = String(
    agent?.metadata?.manifest?.healthcheckUrl
    || agent?.metadata?.manifest?.health_url
    || agent?.metadata?.manifest?.healthUrl
    || ''
  ).trim();
  if (explicit) return explicit;
  return deriveFallbackHealthcheckUrl(agent?.manifestUrl);
}

function resolveOwnershipChallenge(agent) {
  const verification = agent?.metadata?.manifest?.verification || {};
  const challengeUrl = String(verification.challengeUrl || verification.challenge_url || '').trim();
  const challengePath = String(verification.challengePath || verification.challenge_path || '').trim();
  const challengeToken = String(verification.challengeToken || verification.challenge_token || '').trim();
  if (!challengeToken) return null;
  if (challengeUrl) return { url: challengeUrl, token: challengeToken, method: verification.method || 'http-file' };
  if (!challengePath) return null;
  try {
    const base = new URL(agent?.manifestUrl || agent?.metadata?.manifestUrl || agent?.metadata?.manifest?.sourceUrl || '');
    return { url: new URL(challengePath.replace(/^\//, ''), `${base.origin}/`).toString(), token: challengeToken, method: verification.method || 'http-file' };
  } catch {
    return null;
  }
}

function manifestOf(agent) {
  return agent?.metadata?.manifest && typeof agent.metadata.manifest === 'object'
    ? agent.metadata.manifest
    : {};
}

function rootMetadataOf(agent) {
  return agent?.metadata && typeof agent.metadata === 'object'
    ? agent.metadata
    : {};
}

function manifestMetadataOf(agent) {
  const manifest = manifestOf(agent);
  return manifest.metadata && typeof manifest.metadata === 'object'
    ? manifest.metadata
    : {};
}

function sampleKindFromUrl(value, type = 'any') {
  const raw = String(value || '').trim();
  const directMatch = raw.match(/^\/mock\/([^/]+)\/(health|jobs)$/i);
  if (directMatch) {
    const kind = String(directMatch[1] || '').trim().toLowerCase();
    const urlType = String(directMatch[2] || '').trim().toLowerCase();
    if (!BUILT_IN_SAMPLE_KINDS.has(kind)) return '';
    if (type !== 'any' && urlType !== type) return '';
    return kind;
  }
  try {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(/^\/mock\/([^/]+)\/(health|jobs)$/i);
    if (!match) return '';
    const kind = String(match[1] || '').trim().toLowerCase();
    const urlType = String(match[2] || '').trim().toLowerCase();
    if (!BUILT_IN_SAMPLE_KINDS.has(kind)) return '';
    if (type !== 'any' && urlType !== type) return '';
    return kind;
  } catch {
    return '';
  }
}

export function sampleKindFromAgent(agent) {
  const manifest = manifestOf(agent);
  const rootMetadata = rootMetadataOf(agent);
  const manifestMetadata = manifestMetadataOf(agent);
  const fallbackName = String(agent?.name || '').trim().toLowerCase();
  const taggedSample = Boolean(
    rootMetadata.sample === true
    || manifestMetadata.sample === true
    || manifest.sample === true
  );
  const nameTaggedSample = fallbackName.includes('sample_research') || fallbackName.includes('sample_writer') || fallbackName.includes('sample_code');
  if (!taggedSample && !nameTaggedSample) return '';
  const explicitKind = String(
    rootMetadata.category
    || manifestMetadata.category
    || manifest.category
    || ''
  ).trim().toLowerCase();
  if (taggedSample && BUILT_IN_SAMPLE_KINDS.has(explicitKind)) return explicitKind;
  const healthKind = sampleKindFromUrl(
    manifest.healthcheckUrl || manifest.healthcheck_url || manifest.healthUrl || '',
    'health'
  );
  if (healthKind) return healthKind;
  const jobKind = sampleKindFromUrl(
    manifest.jobEndpoint
      || manifest.job_endpoint
      || manifest.jobsUrl
      || manifest.jobs_url
      || manifestMetadata.job_endpoint
      || manifestMetadata.jobEndpoint
      || '',
    'jobs'
  );
  if (jobKind) return jobKind;
  for (const kind of BUILT_IN_SAMPLE_KINDS) {
    if (fallbackName.includes(`sample_${kind}`)) return kind;
  }
  return '';
}

export function isBuiltInSampleAgent(agent) {
  return Boolean(sampleKindFromAgent(agent));
}

export function isBuiltInSampleHealthcheckUrl(value) {
  return Boolean(sampleKindFromUrl(value, 'health'));
}

export function isBuiltInSampleJobEndpoint(value) {
  return Boolean(sampleKindFromUrl(value, 'jobs'));
}

async function verifyOwnershipChallenge(agent, options = {}) {
  const challenge = resolveOwnershipChallenge(agent);
  if (!challenge) return { ok: true, skipped: true, reason: 'No ownership challenge configured' };
  try {
    const response = await fetch(challenge.url, {
      method: 'GET',
      headers: { accept: 'text/plain, application/json;q=0.8', ...(options.headers || {}) }
    });
    if (!response.ok) {
      return { ok: false, reason: `Ownership challenge failed with status ${response.status}`, challengeUrl: challenge.url };
    }
    const text = await response.text();
    if (!String(text || '').includes(challenge.token)) {
      return { ok: false, reason: 'Ownership challenge token not found at challenge URL', challengeUrl: challenge.url };
    }
    return { ok: true, challengeUrl: challenge.url, method: challenge.method };
  } catch (error) {
    return { ok: false, reason: error.message, challengeUrl: challenge.url };
  }
}

export async function verifyAgentByHealthcheck(agent, options = {}) {
  const healthcheckUrl = resolveHealthcheckUrl(agent);
  const checkedAt = nowIso();
  const sampleKind = sampleKindFromAgent(agent);
  if (!healthcheckUrl) {
    return {
      ok: false,
      status: 'verification_failed',
      checkedAt,
      code: 'missing_healthcheck_url',
      category: 'manifest_configuration',
      reason: 'No healthcheck URL found in manifest and no fallback could be derived',
      details: {
        ownershipChallenge: 'skipped',
        service: null
      }
    };
  }
  if (sampleKind && isBuiltInSampleHealthcheckUrl(healthcheckUrl)) {
    return {
      ok: true,
      status: 'verified',
      checkedAt,
      healthcheckUrl,
      details: {
        statusCode: 200,
        service: `sample_${sampleKind}_agent`,
        ownershipChallenge: 'skipped',
        challengeUrl: null,
        verificationMode: 'built_in'
      }
    };
  }
  try {
    const response = await fetch(healthcheckUrl, {
      method: 'GET',
      headers: { accept: 'application/json', ...(options.headers || {}) }
    });
    if (!response.ok) {
      return {
        ok: false,
        status: 'verification_failed',
        checkedAt,
        healthcheckUrl,
        code: 'healthcheck_http_error',
        category: 'healthcheck_http',
        reason: `Healthcheck failed with status ${response.status}`,
        details: {
          statusCode: response.status,
          ownershipChallenge: 'skipped',
          service: null
        }
      };
    }
    const body = await response.json().catch(() => ({}));
    const healthy = body?.ok === true || response.status === 200;
    if (!healthy) {
      return {
        ok: false,
        status: 'verification_failed',
        checkedAt,
        healthcheckUrl,
        code: 'healthcheck_unhealthy_body',
        category: 'healthcheck_response',
        reason: 'Healthcheck response did not indicate ok=true',
        details: {
          statusCode: response.status,
          service: body?.service || null,
          responseOk: body?.ok ?? null,
          ownershipChallenge: 'skipped'
        }
      };
    }
    const ownership = await verifyOwnershipChallenge(agent, options);
    if (!ownership.ok) {
      return {
        ok: false,
        status: 'verification_failed',
        checkedAt,
        healthcheckUrl,
        code: 'ownership_challenge_failed',
        category: 'ownership_verification',
        reason: ownership.reason,
        challengeUrl: ownership.challengeUrl || null,
        details: {
          statusCode: response.status,
          service: body?.service || null,
          ownershipChallenge: 'failed',
          challengeUrl: ownership.challengeUrl || null
        }
      };
    }
    return {
      ok: true,
      status: 'verified',
      checkedAt,
      healthcheckUrl,
      details: {
        statusCode: response.status,
        service: body?.service || null,
        ownershipChallenge: ownership.skipped ? 'skipped' : 'passed',
        challengeUrl: ownership.challengeUrl || null
      }
    };
  } catch (error) {
    return {
      ok: false,
      status: 'verification_failed',
      checkedAt,
      healthcheckUrl,
      code: 'healthcheck_fetch_error',
      category: 'network',
      reason: error.message,
      details: {
        ownershipChallenge: 'skipped',
        service: null
      }
    };
  }
}
