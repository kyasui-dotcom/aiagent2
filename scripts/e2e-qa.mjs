import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const scripts = packageJson.scripts || {};

assert.equal(scripts['qa:e2e-contract'], 'node scripts/e2e-qa.mjs');
assert.ok(String(scripts['qa:e2e'] || '').includes('playwright test -c playwright.config.js'));
assert.ok(String(scripts['qa:e2e:live'] || '').includes('scripts/e2e-live.mjs'));
assert.ok(packageJson.devDependencies?.['@playwright/test'], '@playwright/test must be declared for reproducible E2E installs');

const configPath = join(root, 'playwright.config.js');
assert.ok(existsSync(configPath), 'playwright.config.js is required');
const configSource = readFileSync(configPath, 'utf8');
assert.ok(configSource.includes("testDir: './e2e'"), 'Playwright must only pick the maintained e2e specs by default');
assert.ok(configSource.includes('E2E_BASE_URL'), 'config must support live target override');
assert.ok(configSource.includes('webServer'), 'config must launch the local server automatically');
assert.ok(configSource.includes('ALLOW_IN_MEMORY_STORAGE'), 'local E2E must use isolated in-memory storage');
assert.ok(configSource.includes('ALLOW_OPEN_WRITE_API'), 'local write-flow E2E must be explicitly enabled only in test runtime');

const e2eDir = join(root, 'e2e');
assert.ok(existsSync(e2eDir), 'e2e directory is required');
const specs = readdirSync(e2eDir).filter((name) => name.endsWith('.spec.js'));
assert.ok(specs.length >= 2, 'at least API and UI E2E specs are required');
const specSource = specs.map((name) => readFileSync(join(e2eDir, name), 'utf8')).join('\n');

assert.ok(specSource.includes('/api/health'), 'E2E must cover health');
assert.ok(specSource.includes('/api/ready'), 'E2E must cover readiness');
assert.ok(specSource.includes('/api/agents'), 'E2E must cover agent supply');
assert.ok(specSource.includes('/api/jobs'), 'E2E must cover order creation/readback');
assert.ok(specSource.includes('#chatThread'), 'E2E must cover Chat rendering');
assert.ok(specSource.includes('#promptInput'), 'E2E must cover Chat input');
assert.ok(/Send order|SEND ORDER/.test(specSource), 'E2E must assert the chat-to-order phase boundary');
assert.ok(specSource.includes('/auth/email/verify'), 'Chat E2E must authenticate instead of relying on guest-only UI');
assert.ok(specSource.includes('E2E_EMAIL_AUTH_SECRET'), 'external authenticated UI E2E must require an explicit auth secret');

console.log('E2E QA passed');
