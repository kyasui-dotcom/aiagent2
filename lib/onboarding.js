import { isBuiltInSampleAgent, isBuiltInSampleJobEndpoint, resolveHealthcheckUrl, verifyAgentByHealthcheck } from './verify.js';

function manifestOf(agent) {
  return agent?.metadata?.manifest && typeof agent.metadata.manifest === 'object'
    ? agent.metadata.manifest
    : {};
}

function repositoryOf(agent) {
  const repository = manifestOf(agent)?.metadata?.repository;
  return repository && typeof repository === 'object' ? repository : {};
}

function endpointHintsOf(agent) {
  const endpointHints = manifestOf(agent)?.metadata?.endpoint_hints;
  return endpointHints && typeof endpointHints === 'object' ? endpointHints : {};
}

function executionScopeOf(agent) {
  return String(manifestOf(agent)?.metadata?.execution_scope || '').trim() || 'public_or_unknown';
}

function firstValue(candidates = []) {
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
}

function resolveJobEndpoint(agent) {
  const manifest = manifestOf(agent);
  const manifestMetadata = manifest.metadata && typeof manifest.metadata === 'object' ? manifest.metadata : {};
  const rootMetadata = agent?.metadata && typeof agent.metadata === 'object' ? agent.metadata : {};
  const endpoints = manifest.endpoints && typeof manifest.endpoints === 'object' ? manifest.endpoints : {};
  const metadataEndpoints = rootMetadata.endpoints && typeof rootMetadata.endpoints === 'object' ? rootMetadata.endpoints : {};
  return firstValue([
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
  ]);
}

function parseUrl(value) {
  try {
    return new URL(String(value || '').trim());
  } catch {
    return null;
  }
}

function isLocalHostname(hostname) {
  const value = String(hostname || '').trim().toLowerCase();
  if (!value) return false;
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(value) || value.endsWith('.local');
}

function isLocalUrl(value) {
  const parsed = parseUrl(value);
  return parsed ? isLocalHostname(parsed.hostname) : false;
}

function toneFor(status) {
  if (status === 'pass' || status === 'ready') return 'ok';
  if (status === 'warn' || status === 'local_only') return 'warn';
  if (status === 'info') return 'info';
  return 'error';
}

function buildCheck(key, status, title, detail, extra = {}) {
  return { key, status, tone: toneFor(status), title, detail, ...extra };
}

async function probeEndpoint(url, options = {}) {
  const target = String(url || '').trim();
  if (!target) {
    return {
      status: 'fail',
      tone: 'error',
      httpStatus: null,
      routeExists: false,
      detail: 'No endpoint URL configured.'
    };
  }
  try {
    const response = await fetch(target, {
      method: options.method || 'GET',
      headers: {
        accept: 'application/json, text/plain;q=0.8, */*;q=0.5',
        ...(options.headers || {})
      }
    });
    const status = Number(response.status || 0);
    if (status === 404 || status === 410) {
      return {
        status: 'fail',
        tone: 'error',
        httpStatus: status,
        routeExists: false,
        detail: `${target} returned HTTP ${status}.`
      };
    }
    if (status >= 500) {
      return {
        status: 'fail',
        tone: 'error',
        httpStatus: status,
        routeExists: true,
        detail: `${target} is reachable but returned HTTP ${status}.`
      };
    }
    if ([200, 201, 202, 204, 400, 401, 403, 405, 409, 415, 422, 429].includes(status)) {
      const behavior = status >= 400 ? 'exists and rejected the probe request' : 'responded to the probe request';
      return {
        status: 'pass',
        tone: 'ok',
        httpStatus: status,
        routeExists: true,
        detail: `${target} ${behavior} with HTTP ${status}.`
      };
    }
    return {
      status: 'warn',
      tone: 'warn',
      httpStatus: status,
      routeExists: true,
      detail: `${target} returned HTTP ${status}.`
    };
  } catch (error) {
    return {
      status: 'fail',
      tone: 'error',
      httpStatus: null,
      routeExists: false,
      detail: `${target} could not be reached: ${error.message}`
    };
  }
}

function healthFailureAction(verification) {
  const code = String(verification?.code || '').trim();
  if (code === 'missing_healthcheck_url') {
    return {
      title: 'Add a public healthcheck URL',
      body: 'Expose /api/health on the deployed agent and set healthcheck_url in the manifest before verify.'
    };
  }
  if (code === 'healthcheck_http_error') {
    return {
      title: 'Return HTTP 200 from healthcheck',
      body: `The configured healthcheck returned HTTP ${verification?.details?.statusCode ?? 'non-200'}. Fix the deployed route and re-run onboarding.`
    };
  }
  if (code === 'healthcheck_unhealthy_body') {
    return {
      title: 'Return ok=true from healthcheck',
      body: 'The endpoint responded but did not prove health. Return JSON with ok=true and retry.'
    };
  }
  if (code === 'ownership_challenge_failed') {
    return {
      title: 'Fix the ownership challenge',
      body: `Publish the challenge token at ${verification?.challengeUrl || 'the configured challenge URL'}, then retry verification.`
    };
  }
  return {
    title: 'Restore healthcheck reachability',
    body: verification?.reason || 'Make the health endpoint publicly reachable, then retry verification.'
  };
}

export async function runAgentOnboardingCheck(agent, options = {}) {
  const checkedAt = new Date().toISOString();
  const runtimeOrigin = String(options.runtimeOrigin || '').trim();
  const runtimeHost = parseUrl(runtimeOrigin)?.hostname || '';
  const runtimeIsLocal = isLocalHostname(runtimeHost);
  const repository = repositoryOf(agent);
  const endpointHints = endpointHintsOf(agent);
  const executionScope = executionScopeOf(agent);
  const healthcheckUrl = resolveHealthcheckUrl(agent);
  const jobEndpoint = resolveJobEndpoint(agent);
  const localHealthcheckUrl = String(endpointHints.local_healthcheck_url || '').trim();
  const localJobEndpoint = String(endpointHints.local_job_endpoint || '').trim();
  const localBaseUrl = String(endpointHints.local_base_url || '').trim();
  const repoLabel = repository.full_name || agent?.manifestUrl || agent?.name || 'this agent';
  const checks = [];
  const actions = [];
  const addAction = (title, body, priority = 50, tone = 'warn') => {
    actions.push({ title, body, priority, tone });
  };

  const taskTypes = Array.isArray(agent?.taskTypes) ? agent.taskTypes.filter(Boolean) : [];
  const taskTypesReady = taskTypes.length > 0;
  checks.push(
    taskTypesReady
      ? buildCheck('task_types', 'pass', 'Task types declared', taskTypes.join(', '))
      : buildCheck('task_types', 'fail', 'Task types missing', 'Declare at least one task type in the manifest.', {
          fix: 'Add task_types to the manifest, re-import the agent, then rerun onboarding.'
        })
  );
  if (!taskTypesReady) {
    addAction('Declare task types', 'Add task_types to the manifest so the router can match work to this agent.', 10, 'error');
  }

  if (repository.full_name) {
    checks.push(buildCheck('repository', 'pass', 'Repository linked', `${repository.full_name}${repository.private ? ' (private)' : ''}`));
  } else {
    checks.push(buildCheck('repository', 'info', 'Repository link not attached', 'The agent can still work, but GitHub-backed onboarding hints are unavailable.'));
  }

  const healthcheckIsLocalOnly = Boolean(healthcheckUrl) && isLocalUrl(healthcheckUrl) && !runtimeIsLocal;
  const jobEndpointIsLocalOnly = Boolean(jobEndpoint) && isLocalUrl(jobEndpoint) && !runtimeIsLocal;
  const hasLocalDesktopHints = Boolean(localHealthcheckUrl || localJobEndpoint || executionScope === 'local_desktop');

  let verification = null;
  if (!healthcheckUrl) {
    const detail = hasLocalDesktopHints && localHealthcheckUrl
      ? `No public healthcheck is configured. Local route detected at ${localHealthcheckUrl}.`
      : 'No healthcheck URL is configured.';
    const fix = hasLocalDesktopHints
      ? `Use local AIagent2 against ${localBaseUrl || 'the local agent host'}, or deploy /api/health publicly and regenerate the manifest for ${repoLabel}.`
      : `Expose /api/health publicly for ${repoLabel}, then set healthcheck_url in the manifest and rerun onboarding.`;
    checks.push(buildCheck('healthcheck', 'fail', 'Healthcheck missing', detail, { fix }));
    addAction(
      hasLocalDesktopHints ? 'Choose local or public healthcheck' : 'Add a public healthcheck URL',
      fix,
      20,
      hasLocalDesktopHints ? 'warn' : 'error'
    );
  } else if (healthcheckIsLocalOnly) {
    const fix = `This agent currently verifies only on a local machine. Either use the local desktop runtime at http://127.0.0.1:4323 or deploy a public /api/health endpoint and update the manifest for ${repoLabel}.`;
    checks.push(buildCheck('healthcheck', 'fail', 'Healthcheck is local-only', `${healthcheckUrl} points to localhost, so the public runtime cannot verify it.`, { fix }));
    addAction(
      'Use local AIagent2 or deploy publicly',
      fix,
      20,
      'warn'
    );
  } else {
    verification = await verifyAgentByHealthcheck(agent);
    if (verification.ok) {
      checks.push(buildCheck('healthcheck', 'pass', 'Healthcheck verified', `${healthcheckUrl} returned ok=true.`));
    } else {
      const action = healthFailureAction(verification);
      checks.push(buildCheck('healthcheck', 'fail', 'Healthcheck failed', verification.reason || `Healthcheck failed for ${healthcheckUrl}.`, {
        code: verification.code || null,
        fix: action.body
      }));
      addAction(action.title, action.body, 20, 'error');
    }
  }

  let jobProbe = null;
  if (!jobEndpoint) {
    const detail = hasLocalDesktopHints && localJobEndpoint
      ? `No public job endpoint is configured. Local route detected at ${localJobEndpoint}.`
      : 'No job endpoint is configured.';
    const fix = hasLocalDesktopHints
      ? `Deploy /api/jobs publicly for ${repoLabel}, or keep using the local desktop runtime against ${localBaseUrl || localJobEndpoint}.`
      : `Expose /api/jobs publicly for ${repoLabel} and set job_endpoint in the manifest before dispatch.`;
    checks.push(buildCheck('job_endpoint', 'fail', 'Job endpoint missing', detail, { fix }));
    addAction(
      hasLocalDesktopHints ? 'Expose a public job endpoint or stay local' : 'Add a public job endpoint',
      fix,
      30,
      hasLocalDesktopHints ? 'warn' : 'error'
    );
  } else if (jobEndpointIsLocalOnly) {
    const fix = `This agent currently dispatches only to localhost. Use local AIagent2 at http://127.0.0.1:4323 or deploy a public /api/jobs endpoint and update the manifest for ${repoLabel}.`;
    checks.push(buildCheck('job_endpoint', 'fail', 'Job endpoint is local-only', `${jobEndpoint} points to localhost, so the public runtime cannot dispatch to it.`, { fix }));
    addAction(
      'Choose local or public dispatch',
      fix,
      30,
      'warn'
    );
  } else {
    jobProbe = isBuiltInSampleAgent(agent) && isBuiltInSampleJobEndpoint(jobEndpoint)
      ? {
          status: 'pass',
          tone: 'ok',
          httpStatus: 200,
          routeExists: true,
          detail: `${jobEndpoint} is handled by the built-in runtime.`
        }
      : await probeEndpoint(jobEndpoint, { method: 'GET' });
    const jobFix = jobProbe.status === 'fail'
      ? (jobProbe.httpStatus === 404 || jobProbe.httpStatus === 410
          ? `${jobEndpoint} is missing on the deployed host. Deploy /api/jobs or update job_endpoint in the manifest for ${repoLabel}.`
          : `Make ${jobEndpoint} reachable without HTTP 5xx or network failure, then rerun onboarding.`)
      : '';
    checks.push(
      buildCheck(
        'job_endpoint',
        jobProbe.status,
        jobProbe.status === 'pass' ? 'Job endpoint reachable' : 'Job endpoint blocked',
        jobProbe.detail,
        { httpStatus: jobProbe.httpStatus, ...(jobFix ? { fix: jobFix } : {}) }
      )
    );
    if (jobProbe.status === 'fail') {
      addAction(
        jobProbe.httpStatus === 404 || jobProbe.httpStatus === 410 ? 'Deploy the job route' : 'Fix the job endpoint',
        jobFix,
        30,
        'error'
      );
    }
  }

  const onlineReady = Boolean(agent?.online);
  checks.push(
    onlineReady
      ? buildCheck('availability', 'pass', 'Agent marked online', 'The broker can consider this agent for routing.')
      : buildCheck('availability', 'fail', 'Agent marked offline', 'Turn the agent online after deploy so it can receive work.', {
          fix: 'Turn the agent online after the deploy is healthy, then rerun onboarding.'
        })
  );
  if (!onlineReady) {
    addAction('Mark the agent online', 'Turn the agent online after the deploy is healthy so the router can pick it.', 40, 'warn');
  }

  const verificationReady = Boolean(verification?.ok || agent?.verificationStatus === 'verified');
  const jobReady = Boolean(jobEndpoint && !jobEndpointIsLocalOnly && jobProbe?.routeExists && jobProbe?.status !== 'fail');
  const overallReady = taskTypesReady && verificationReady && jobReady && onlineReady;
  const localOnly = !overallReady && hasLocalDesktopHints && !runtimeIsLocal && (!healthcheckUrl || !jobEndpoint || healthcheckIsLocalOnly || jobEndpointIsLocalOnly);

  checks.push(
    overallReady
      ? buildCheck('dispatch_readiness', 'pass', 'Dispatch ready', 'Verification and job endpoint checks passed. This agent is ready for first run dispatch.')
      : buildCheck(
          'dispatch_readiness',
          localOnly ? 'warn' : 'fail',
          localOnly ? 'Dispatch blocked on public runtime' : 'Dispatch not ready',
          localOnly
            ? 'The repo exposes local-only hints, but the public runtime still needs public endpoints.'
            : 'At least one required onboarding step is still failing.',
          {
            fix: localOnly
              ? 'Deploy public /api/health and /api/jobs endpoints, or use the local desktop runtime for this agent.'
              : 'Resolve the failed checks above, then rerun onboarding until dispatch readiness becomes pass.'
          }
        )
  );

  if (overallReady) {
    addAction('Create the first run', 'Open WORK and create a run, or pin this agent from AGENTS and dispatch immediately.', 99, 'ok');
  }

  const orderedActions = actions.sort((left, right) => left.priority - right.priority);
  const nextAction = orderedActions[0] || {
    title: 'Review the agent configuration',
    body: 'Run the onboarding check again after the next manifest or deploy change.',
    tone: 'info'
  };
  const overallStatus = overallReady ? 'ready' : (localOnly ? 'local_only' : 'action_required');
  const summary = overallReady
    ? 'The agent is dispatchable.'
    : nextAction.body;

  return {
    checkedAt,
    status: overallStatus,
    tone: toneFor(overallStatus),
    summary,
    explain: {
      verify: 'Verify checks the public healthcheck and optional ownership challenge only.',
      onboarding: 'Onboarding check adds job endpoint reachability, online status, and dispatch readiness.'
    },
    nextAction: { title: nextAction.title, body: nextAction.body, tone: nextAction.tone || toneFor(overallStatus) },
    actions: orderedActions.map(({ priority, ...action }) => action),
    checks,
    endpoints: {
      healthcheckUrl,
      jobEndpoint,
      localHealthcheckUrl,
      localJobEndpoint,
      localBaseUrl
    },
    repository: {
      fullName: String(repository.full_name || '').trim(),
      htmlUrl: String(repository.html_url || '').trim(),
      isPrivate: Boolean(repository.private)
    },
    executionScope,
    runtime: {
      origin: runtimeOrigin,
      isLocal: runtimeIsLocal
    }
  };
}
