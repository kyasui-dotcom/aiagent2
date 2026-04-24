import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function gitTrackedFiles() {
  const output = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8'
  }).trim();
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function loadWhitelist() {
  const file = path.join(root, 'open-core-whitelist.json');
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  assert.ok(files.length > 0, 'open-core-whitelist.json must contain files');
  return files.map((entry) => {
    if (typeof entry === 'string') return { source: entry, target: entry };
    return {
      source: String(entry?.source || '').replace(/\\/g, '/'),
      target: String(entry?.target || '').replace(/\\/g, '/')
    };
  });
}

const trackedFiles = gitTrackedFiles();
const whitelistFiles = loadWhitelist();

const forbiddenTrackedPrefixes = [
  '.playwright-cli/',
  '.wrangler/',
  '.data/',
  'output/',
  'test-results/'
];

const forbiddenTrackedFiles = [
  '.env',
  'server.log',
  'worker.js.old'
];

const suspiciousPatterns = [
  { name: 'OpenAI project key', regex: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Stripe live secret key', regex: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { name: 'Stripe live publishable key', regex: /\bpk_live_[A-Za-z0-9]{20,}\b/g },
  { name: 'GitHub personal access token', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { name: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { name: 'PEM private key', regex: /-----BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/g }
];

const allowList = new Set([
  '.env.example',
  'scripts/stripe-qa.mjs',
  'scripts/worker-api-qa.mjs'
]);

const pathLeakPatterns = [
  /C:\\Users\\/g,
  /\/home\/kyforever\//g
];

for (const prefix of forbiddenTrackedPrefixes) {
  const leaks = trackedFiles.filter((file) => file.startsWith(prefix));
  assert.equal(leaks.length, 0, `tracked artifact path should not be published: ${leaks.join(', ')}`);
}

for (const file of forbiddenTrackedFiles) {
  assert.ok(!trackedFiles.includes(file), `tracked private file should not be published: ${file}`);
}

for (const entry of whitelistFiles) {
  const source = entry.source;
  const target = entry.target;
  assert.ok(source && !path.isAbsolute(source), `whitelist source must be relative: ${JSON.stringify(entry)}`);
  assert.ok(target && !path.isAbsolute(target), `whitelist target must be relative: ${JSON.stringify(entry)}`);
  const sourceExists = existsSync(path.join(root, source));
  const targetExists = existsSync(path.join(root, target));
  assert.ok(sourceExists || targetExists, `whitelist path must exist in source or target form: ${JSON.stringify(entry)}`);
  assert.ok(!forbiddenTrackedPrefixes.some((prefix) => source.startsWith(prefix)), `whitelist source must not point at private artifact path: ${source}`);
  assert.ok(!forbiddenTrackedFiles.includes(source), `whitelist source must not include private file: ${source}`);
  assert.ok(!forbiddenTrackedPrefixes.some((prefix) => target.startsWith(prefix)), `whitelist target must not point at private artifact path: ${target}`);
  assert.ok(!forbiddenTrackedFiles.includes(target), `whitelist target must not include private file: ${target}`);
}

for (const file of trackedFiles) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) continue;
  const text = readFileSync(absolute, 'utf8');

  if (!allowList.has(file)) {
    for (const { name, regex } of suspiciousPatterns) {
      assert.equal(regex.test(text), false, `${name} pattern found in tracked file: ${file}`);
      regex.lastIndex = 0;
    }
  }

  for (const pattern of pathLeakPatterns) {
    assert.equal(pattern.test(text), false, `local machine path leaked into tracked file: ${file}`);
    pattern.lastIndex = 0;
  }
}

console.log('open core qa passed');
