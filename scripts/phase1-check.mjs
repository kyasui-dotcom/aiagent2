import { readFileSync } from 'node:fs';

function parseJsonc(text) {
  return JSON.parse(text.split('\n').map((line) => line.includes('//') ? line.split('//')[0] : line).join('\n'));
}

async function request(path, options = {}) {
  const res = await fetch(`http://127.0.0.1:4323${path}`, options);
  const body = await res.json();
  return { status: res.status, body };
}

const wrangler = parseJsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
console.log('wrangler.name', wrangler.name);
console.log('wrangler.main', wrangler.main);
console.log('wrangler.assets.binding', wrangler.assets?.binding);
console.log('wrangler.d1.binding', wrangler.d1_databases?.[0]?.binding);
console.log('wrangler.d1.database', wrangler.d1_databases?.[0]?.database_name);

for (const path of ['/api/health', '/api/ready', '/api/schema', '/api/snapshot', '/api/agents', '/api/jobs']) {
  const res = await request(path);
  console.log(path, res.status, Object.keys(res.body).slice(0, 4).join(','));
}

const seed = await request('/api/seed', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}'
});
console.log('/api/seed', seed.status, seed.body.ok, seed.body.job_ids?.length || 0);

const created = await request('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ parent_agent_id: 'cloudcode-main', task_type: 'research', prompt: 'phase1 verification run' })
});
console.log('/api/jobs POST', created.status, created.body.status, created.body.job_id);

const resolved = await request('/api/dev/resolve-job', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ job_id: created.body.job_id, mode: 'complete' })
});
console.log('/api/dev/resolve-job', resolved.status, resolved.body.status);

const audits = await request('/api/billing-audits');
console.log('/api/billing-audits', audits.status, audits.body.billing_audits?.length || 0);
