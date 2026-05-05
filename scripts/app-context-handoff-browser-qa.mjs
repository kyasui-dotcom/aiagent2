import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const port = Number(process.env.APP_CONTEXT_QA_PORT || 4335);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: process.env.NODE_ENV || 'test',
    ALLOW_IN_MEMORY_STORAGE: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverLog = '';
let browser = null;
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`server did not start\n${serverLog}`);
}

async function createContext(context) {
  const response = await fetch(`${base}/api/app-contexts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app_id: context.source_app, context })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function openAppWithContext(page, path, context) {
  const record = await createContext(context);
  const url = new URL(path, base);
  url.searchParams.set('cait_app_context_id', record.app_context_id);
  url.searchParams.set('cait_app_context_token', record.app_context_token);
  await page.goto(url.toString());
  return record;
}

try {
  await waitForHealth();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${base}/analytics-console.html`);
  await page.waitForSelector('#primaryTable');
  if (!(await page.textContent('#primaryTable')).includes('No server-side app context is loaded yet.')) throw new Error('analytics empty state was not rendered');

  await page.goto(`${base}/publisher-approval.html`);
  await page.waitForSelector('#contentList');
  if (!(await page.textContent('#contentList')).includes('No approval packet loaded')) throw new Error('publisher empty state was not rendered');

  await page.goto(`${base}/lead-ops.html`);
  await page.waitForSelector('#leadTable');
  if (!(await page.textContent('#leadTable')).includes('No lead rows loaded.')) throw new Error('lead empty state was not rendered');

  await page.goto(`${base}/delivery-manager.html`);
  await page.waitForSelector('#deliveryList');
  if (!(await page.textContent('#deliveryList')).includes('No server delivery loaded')) throw new Error('delivery empty state was not rendered');

  await openAppWithContext(page, '/analytics-console.html', {
    schema: 'cait-app-context/v1',
    source_app: 'qa_analytics',
    source_app_label: 'QA Analytics',
    title: 'Imported analytics packet',
    summary: 'Imported analytics summary',
    metrics: [{ label: 'organic_sessions', value: 321 }],
    artifacts: [
      {
        type: 'search_queries',
        rows: [{ query: 'imported japan esim', clicks: 88, position: 3.2, conversions: 4, note: 'imported note' }]
      }
    ],
    handoff_targets: ['seo_gap']
  });
  await page.waitForSelector('#primaryTable');
  if (!(await page.textContent('#primaryTable')).includes('imported japan esim')) throw new Error('analytics context was not rendered');
  if (!(await page.textContent('#sessionsMetric')).includes('321')) throw new Error('analytics metric was not rendered');

  await openAppWithContext(page, '/publisher-approval.html', {
    schema: 'cait-app-context/v1',
    source_app: 'qa_publisher',
    source_app_label: 'QA Publisher',
    title: 'Imported publisher packet',
    summary: 'Imported publisher summary',
    artifacts: [
      {
        type: 'page',
        title: 'Imported landing update',
        slug: '/imported-page',
        meta: 'Imported meta',
        body: 'Imported body',
        status: 'needs approval'
      }
    ],
    approval_requests: [{ id: 'approval-1', title: 'Imported approval request', action_type: 'publish_change', status: 'needs approval' }]
  });
  await page.waitForSelector('#contentList');
  if (!(await page.textContent('#contentList')).includes('Imported landing update')) throw new Error('publisher context was not rendered');

  await openAppWithContext(page, '/lead-ops.html', {
    schema: 'cait-app-context/v1',
    source_app: 'qa_leads',
    source_app_label: 'QA Leads',
    title: 'Imported lead packet',
    artifacts: [
      {
        type: 'lead_rows',
        rows: [
          {
            id: 'lead-x',
            company: 'Imported Travel Partner',
            segment: 'Travel media',
            evidenceUrl: 'https://example.com/source',
            status: 'review',
            nextAction: 'Review imported row'
          }
        ]
      },
      { type: 'email_draft', lead_id: 'lead-x', subject: 'Imported subject', body: 'Imported body', status: 'draft' }
    ]
  });
  await page.waitForSelector('#leadTable');
  if (!(await page.textContent('#leadTable')).includes('Imported Travel Partner')) throw new Error('lead context was not rendered');
  if (!(await page.inputValue('#emailSubjectInput')).includes('Imported subject')) throw new Error('lead email draft was not rendered');

  await openAppWithContext(page, '/delivery-manager.html', {
    schema: 'cait-app-context/v1',
    source_app: 'qa_delivery',
    source_app_label: 'QA Delivery',
    title: 'Imported delivery packet',
    summary: 'Imported delivery summary',
    delivery_files: [{ name: 'imported-delivery.md', type: 'markdown', content: '# Imported delivery' }]
  });
  await page.waitForSelector('#deliveryList');
  if (!(await page.textContent('#deliveryList')).includes('Imported delivery packet')) throw new Error('delivery context was not rendered');
  if (!(await page.textContent('#fileTable')).includes('imported-delivery.md')) throw new Error('delivery file was not rendered');

  await browser.close();
  console.log('app context handoff browser qa passed');
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
