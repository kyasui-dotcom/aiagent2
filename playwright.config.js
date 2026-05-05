import { defineConfig, devices } from '@playwright/test';

const configuredBaseUrl = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4323}`;
const baseUrl = new URL(configuredBaseUrl);
const useManagedLocalServer = !process.env.E2E_BASE_URL;
const localPort = baseUrl.port || (baseUrl.protocol === 'https:' ? '443' : '80');
const localHost = baseUrl.hostname || '127.0.0.1';

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/e2e-artifacts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/e2e-report', open: 'never' }]
  ],
  use: {
    baseURL: configuredBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: useManagedLocalServer ? {
    command: 'node server.js',
    url: configuredBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      APP_VERSION: process.env.APP_VERSION || '0.2.0-test',
      ALLOW_IN_MEMORY_STORAGE: '1',
      ALLOW_OPEN_WRITE_API: '1',
      ALLOW_GUEST_RUN_READ_API: '1',
      ALLOW_DEV_API: '1',
      EXPOSE_JOB_SECRETS: '1',
      SESSION_SECRET: process.env.SESSION_SECRET || 'playwright-e2e-session-secret',
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_playwright_e2e',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_playwright_e2e',
      STRIPE_DEFAULT_CURRENCY: process.env.STRIPE_DEFAULT_CURRENCY || 'USD',
      BASE_URL: configuredBaseUrl,
      HOST: localHost,
      PORT: localPort,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'google-playwright-e2e-client-id',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'google-playwright-e2e-client-secret'
    }
  } : undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
