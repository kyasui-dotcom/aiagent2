import { expect, test } from '@playwright/test';

const externalBaseUrl = String(process.env.E2E_BASE_URL || '').trim();
const liveMode = Boolean(externalBaseUrl) && !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(externalBaseUrl);
const allowWrite = process.env.E2E_WRITE === '1' || !liveMode;

test.describe('public API contract', () => {
  test('health and readiness endpoints expose deploy state', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.status()).toBe(200);
    const healthBody = await health.json();
    expect(healthBody).toMatchObject({ ok: true, service: 'aiagent2' });
    expect(String(healthBody.version || '')).not.toHaveLength(0);
    expect(String(healthBody.deploy_target || '')).not.toHaveLength(0);

    const ready = await request.get('/api/ready');
    expect(ready.status()).toBe(200);
    const readyBody = await ready.json();
    expect(readyBody).toMatchObject({ ok: true, ready: true });
    expect(readyBody.storage).toBeTruthy();
  });

  test('agents endpoint exposes searchable built-in supply', async ({ request }) => {
    const response = await request.get('/api/agents');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.agents.length).toBeGreaterThan(0);

    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).toContain('research');
    expect(serialized).toContain('cmo');
  });

  test('local write flow creates and reads a built-in order', async ({ request }) => {
    test.skip(!allowWrite, 'Write-flow E2E is local-only by default. Set E2E_WRITE=1 to run it against an external target.');

    const uniquePrompt = [
      `E2E smoke ${Date.now()}: research CAIt onboarding execution flow.`,
      'Return concrete findings, do not use placeholders, and include the next action.'
    ].join(' ');
    const createResponse = await request.post('/api/jobs', {
      data: {
        parent_agent_id: 'playwright-e2e',
        task_type: 'research',
        prompt: uniquePrompt,
        budget_cap: 150,
        skip_intake: true,
        order_strategy: 'single',
        input: {
          _broker: {
            intake: { confirmed: true },
            requester: { login: 'playwright-e2e', accountId: 'acct:playwright-e2e' }
          }
        }
      }
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    expect(created.order_strategy_resolved).toBe('single');
    expect(created.job_id || created.job?.id).toBeTruthy();
    expect(['completed', 'dispatched', 'queued', 'running', 'claimed']).toContain(String(created.status || created.job?.status || ''));

    const jobId = created.job_id || created.job.id;
    const readResponse = await request.get(`/api/jobs/${jobId}`);
    expect(readResponse.status()).toBe(200);
    const job = await readResponse.json();
    expect(job.id).toBe(jobId);
    expect(job.prompt).toContain('E2E smoke');
    expect(['completed', 'dispatched', 'queued', 'running', 'claimed']).toContain(String(job.status || ''));
    expect(job.assignedAgentId || job.workflow).toBeTruthy();
  });
});
