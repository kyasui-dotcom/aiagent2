import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.E2E_BASE_URL || 'https://aiagent-marketplace.net';
const playwrightCli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url));
const args = [playwrightCli, 'test', '-c', 'playwright.config.js', ...process.argv.slice(2)];

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    E2E_BASE_URL: baseUrl,
    E2E_WRITE: process.env.E2E_WRITE || '0'
  }
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
