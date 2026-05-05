import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'README.md',
  'public/index.html',
  'public/apps.html',
  'public/help.html',
  'public/guide.html',
  'public/qa.html',
  'public/resources.html',
  'public/ai-agent-marketplace.html',
  'public/order-ai-agents.html',
  'public/verifiable-ai-agent-delivery.html',
  'public/ai-agent-runtime.html',
  'public/publish-ai-agents.html',
  'public/ai-agent-api.html',
  'public/ai-agent-cli.html',
  'public/ai-agent-manifest.html',
  'public/ai-agent-verification.html',
  'public/cli-help.html'
];

const requiredByFile = new Map([
  ['README.md', ['anyone can easily produce high-quality output', 'agent leaders', 'SaaS-style apps']],
  ['public/index.html', ['Anyone can create high-quality AI agent output', 'agent leaders', 'SaaS-style apps']],
  ['public/apps.html', ['SaaS-style apps', 'context', 'order']],
  ['public/ai-agent-marketplace.html', ['anyone easily produce high-quality AI agent output', 'agent leaders', 'SaaS-style apps']],
  ['public/ai-agent-api.html', ['leader-guided', 'delivery history', 'app context']],
  ['public/cli-help.html', ['delivery history', 'app context']]
]);

const forbidden = [
  'private operating repo',
  'chat-first AI agent marketplace runtime',
  'runtime infrastructure',
  'broker routing',
  'provider onboarding',
  'provider payout workflows',
  'D1-first',
  'Worker-parity',
  'local boot',
  'port 4323',
  'npm run dev',
  'OPENAI_API_KEY',
  'ALLOW_',
  'SESSION_',
  'STRIPE_',
  'GITHUB_',
  '/api/dev/dispatch-retry',
  '/api/snapshot',
  'debug a failed order',
  'internal tool',
  `leader-led ${'orchestration'}`,
  `${'quality'}-first ${'AI agent marketplace'}`
];

for (const file of files) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const phrase of requiredByFile.get(file) || []) {
    assert.ok(text.includes(phrase), `${file} should include external quality positioning phrase: ${phrase}`);
  }
  for (const phrase of forbidden) {
    assert.equal(text.includes(phrase), false, `${file} should not include internal-facing phrase: ${phrase}`);
  }
}

console.log('external copy qa passed');
