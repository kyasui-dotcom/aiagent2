import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';

const externalBaseUrl = String(process.env.E2E_BASE_URL || '').trim();
const liveMode = Boolean(externalBaseUrl) && !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(externalBaseUrl);
const canUseEmailAuth = !liveMode || Boolean(process.env.E2E_EMAIL_AUTH_SECRET);
const emailAuthSecret = process.env.E2E_EMAIL_AUTH_SECRET || process.env.SESSION_SECRET || 'playwright-e2e-session-secret';

function emailAuthToken(email, returnTo = '/chat') {
  const payload = {
    kind: 'email-auth',
    email,
    returnTo,
    loginSource: 'playwright_chat_leader_handoff',
    visitorId: `chat_leader_e2e_${Date.now().toString(36)}`,
    exp: Date.now() + 20 * 60 * 1000
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', emailAuthSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

async function openNewChat(page) {
  const email = `chat-leader-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  await page.goto(`/auth/email/verify?token=${encodeURIComponent(emailAuthToken(email))}`, { waitUntil: 'domcontentloaded' });
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#chatThread')).toBeVisible();
  await expect(page.locator('#promptInput')).toBeVisible();
}

test.describe('CAIt leader handoff chat', () => {
  test('keeps pause questions in chat instead of preparing or sending an order', async ({ page }) => {
    test.skip(!canUseEmailAuth, 'Authenticated chat E2E requires E2E_EMAIL_AUTH_SECRET against an external target.');

    await openNewChat(page);

    await page.locator('#promptInput').fill('集客したいです');
    await page.locator('#sendMessageBtn').click();
    await expect(page.locator('#chatThread')).toContainText(/Answer what you can|回答/);
    await expect(page.locator('#chatThread')).toContainText('Nothing has been dispatched yet.');

    await page.locator('#promptInput').fill('pause?');
    await page.locator('#sendMessageBtn').click();
    await expect(page.locator('#chatThread')).toContainText(/No new order was created|発注外の会話/);
    await expect(page.locator('#chatThread')).not.toContainText('User clarification:');
    await expect(page.locator('#chatThread')).not.toContainText('Order accepted.');
  });

  test('hands broad marketing intent to CMO Leader and reaches terminal delivery in chat', async ({ page }) => {
    test.skip(!canUseEmailAuth, 'Authenticated chat E2E requires E2E_EMAIL_AUTH_SECRET against an external target.');
    test.setTimeout(150_000);

    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await openNewChat(page);
    await expect(page.locator('#activeLeaderStatus')).toContainText('CAIt routing');

    await page.locator('#promptInput').fill('集客したいです');
    await page.locator('#sendMessageBtn').click();

    await expect(page.locator('#activeLeaderStatus')).toContainText('Lead: CMO Leader');
    await expect(page.locator('#chatThread')).toContainText('CMO Leader');
    await expect(page.locator('#chatThread')).toContainText(/Answer what you can|回答/);
    await expect(page.locator('#chatThread')).toContainText('Nothing has been dispatched yet.');

    await page.locator('#promptInput').fill([
      '1. autowifi-travel.com https://autowifi-travel.com/ is an eSIM ecommerce site.',
      '2. English-speaking travelers visiting Japan.',
      '3. Purchase Japan eSIMs.',
      '4. No ads. Use SEO and X as research/distribution candidates, but do not externally publish without connector proof.',
      '5. Give a plan and execute the allowed action layers. Return final delivery in chat.'
    ].join('\n'));
    await page.locator('#sendMessageBtn').click();

    await expect(page.locator('#chatThread')).toContainText('Lead: CMO Leader');
    await expect(page.locator('#chatThread')).toContainText('Task: cmo_leader');
    await expect(page.locator('#chatThread')).toContainText('Route: MULTI');
    await expect(page.getByRole('button', { name: 'Send order' })).toBeVisible();

    let capturedCreatePayload = null;
    let releaseCreate = () => {};
    const createSeen = new Promise((resolve) => {
      releaseCreate = resolve;
    });
    let pollCount = 0;
    await page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      capturedCreatePayload = JSON.parse(route.request().postData() || '{}');
      releaseCreate();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          mode: 'workflow',
          status: 'running',
          workflow_job_id: 'e2e-chat-leader-workflow',
          order_strategy_resolved: 'multi',
          child_runs: [
            { id: 'e2e-cmo', taskType: 'cmo_leader', status: 'completed' },
            { id: 'e2e-research', taskType: 'research', status: 'running' },
            { id: 'e2e-growth', taskType: 'growth', status: 'queued' }
          ]
        })
      });
    });
    await page.route('**/api/jobs/e2e-chat-leader-workflow**', async (route) => {
      pollCount += 1;
      const completed = pollCount >= 2;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job: {
            id: 'e2e-chat-leader-workflow',
            jobKind: 'workflow',
            parentAgentId: 'chatux',
            status: completed ? 'completed' : 'running',
            completedAt: completed ? new Date().toISOString() : '',
            workflow: {
              statusCounts: completed
                ? { total: 3, completed: 3, running: 0, queued: 0, blocked: 0, failed: 0 }
                : { total: 3, completed: 1, running: 1, queued: 1, blocked: 0, failed: 0 },
              childRuns: [
                { id: 'e2e-cmo', taskType: 'cmo_leader', status: 'completed' },
                { id: 'e2e-research', taskType: 'research', status: completed ? 'completed' : 'running' },
                { id: 'e2e-growth', taskType: 'growth', status: completed ? 'completed' : 'queued' }
              ]
            },
            output: completed ? {
              summary: 'CMO Leader completed source-backed research, planning, and growth action handoff for autowifi-travel.com.',
              report: {
                summary: 'CMO Leader completed source-backed research, planning, and growth action handoff for autowifi-travel.com.',
                bullets: ['Research passed into growth and SEO layers.', 'No external X publish was claimed without connector approval.'],
                childRuns: [
                  { taskType: 'research', status: 'completed', summary: 'Research used source-backed context.' },
                  { taskType: 'growth', status: 'completed', summary: 'Growth packet used the research handoff.' }
                ],
                nextAction: 'Review the action packet before approving external posting.'
              },
              files: [
                {
                  name: 'cmo-leader-e2e-delivery.md',
                  content: '# CMO Leader E2E Delivery\n\nResearch, growth, SEO, and action handoff are complete.\n\n## Web sources used\n- QA source https://example.test/source\n'
                }
              ]
            } : {}
          }
        })
      });
    });

    await page.getByRole('button', { name: 'Send order' }).click();
    await createSeen;
    expect(capturedCreatePayload?.task_type).toBe('cmo_leader');
    expect(capturedCreatePayload?.order_strategy).toBe('multi');
    expect(capturedCreatePayload?.input?._broker?.conversationOwner?.type).toBe('leader');
    expect(capturedCreatePayload?.input?._broker?.activeLeader?.taskType).toBe('cmo_leader');
    await expect(page.locator('#chatThread')).toContainText('Sending order. I will keep polling and post progress here.');
    await expect(page.locator('#chatThread')).toContainText('Order accepted.');
    await expect(page.locator('#chatThread')).toContainText(/Order ID: [a-z0-9-]+/i);
    await expect(page.locator('#chatThread')).toContainText(/Order [a-z0-9-]{8}: /i);

    await expect(page.locator('#chatThread')).toContainText('Delivery update', { timeout: 120_000 });
    await expect(page.locator('#chatThread')).toContainText(/Download (all MD|MD)/);
    await expect(page.locator('#chatThread')).toContainText(/research|CMO|growth|SEO/i);
    expect(pageErrors).toEqual([]);
  });
});
