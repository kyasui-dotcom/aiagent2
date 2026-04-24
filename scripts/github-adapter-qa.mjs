import assert from 'node:assert/strict';
import { buildGithubAdapterPlan, GITHUB_ADAPTER_MARKER } from '../lib/github-adapter.js';

const nextPlan = buildGithubAdapterPlan({
  repoMeta: {
    name: 'seo-agent',
    full_name: 'kyasui-dotcom/seo-agent',
    html_url: 'https://github.com/kyasui-dotcom/seo-agent',
    homepage: 'https://seo-agent.example.com',
    default_branch: 'main',
    private: false,
    owner: { login: 'kyasui-dotcom' }
  },
  files: {
    'package.json': JSON.stringify({
      name: 'seo-agent',
      description: 'SEO analysis app',
      dependencies: {
        next: '^15.0.0',
        '@anthropic-ai/sdk': '^0.80.0'
      }
    }),
    'src/lib/broker.ts': `
      export function brokerHealth() {
        return { ok: Boolean(process.env.ANTHROPIC_API_KEY), configured: Boolean(process.env.ANTHROPIC_API_KEY) };
      }
      export async function acceptBrokerJob(body) {
        return { accepted: true, status: "accepted", provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY, serp: process.env.SERP_API_KEY, input: body };
      }
    `,
    'README.md': 'SEO analysis app with AI reports.'
  },
  repoTreePaths: [
    'src/app/page.tsx',
    'src/components/app-shell.tsx',
    'src/lib/broker.ts'
  ],
  ownerLogin: 'kyasui-dotcom'
});

assert.equal(nextPlan.supported, true);
assert.equal(nextPlan.framework, 'nextjs-src-pages-api');
assert.equal(nextPlan.adapterStrategy, 'existing_broker_bridge');
assert.equal(nextPlan.filesToWrite.length, 4);
assert.ok(nextPlan.requiredEnv.includes('ANTHROPIC_API_KEY'));
assert.ok(nextPlan.optionalEnv.includes('SERP_API_KEY'));
assert.equal(nextPlan.deploymentBaseUrl, 'https://seo-agent.example.com');
assert.equal(nextPlan.suggestedManifestUrl, 'https://seo-agent.example.com/api/aiagent2/manifest');
assert.ok(nextPlan.filesToWrite.some((file) => file.path === 'src/pages/api/aiagent2/health.js'));
assert.ok(nextPlan.filesToWrite.some((file) => file.path === 'src/pages/api/aiagent2/jobs.js'));
assert.ok(nextPlan.filesToWrite.some((file) => file.path === 'src/pages/api/aiagent2/manifest.js'));
assert.ok(nextPlan.filesToWrite.some((file) => file.path === 'aiagent2/SETUP.md'));
for (const file of nextPlan.filesToWrite) {
  assert.ok(file.content.includes(GITHUB_ADAPTER_MARKER), `missing marker in ${file.path}`);
}
assert.ok(nextPlan.filesToWrite.find((file) => file.path.endsWith('/health.js')).content.includes("import { brokerHealth }"));
assert.ok(nextPlan.filesToWrite.find((file) => file.path.endsWith('/jobs.js')).content.includes("import { acceptBrokerJob }"));
assert.ok(nextPlan.filesToWrite.find((file) => file.path.endsWith('/jobs.js')).content.includes('ANTHROPIC_API_KEY') === false);
assert.ok(nextPlan.filesToWrite.find((file) => file.path.endsWith('/manifest.js')).content.includes('/api/aiagent2/jobs'));
assert.ok(nextPlan.draftManifest.pricing.provider_markup_rate === 0.1);
assert.ok(nextPlan.draftManifest.usage_contract.report_input_tokens);
assert.equal(nextPlan.draftManifest.execution_pattern, 'async');
assert.ok(nextPlan.draftManifest.input_types.includes('text'));
assert.ok(nextPlan.draftManifest.output_types.includes('report'));
assert.equal(nextPlan.draftManifest.risk_level, 'safe');

const workerPlan = buildGithubAdapterPlan({
  repoMeta: {
    name: 'python-agent',
    full_name: 'example/python-agent',
    owner: { login: 'example' }
  },
  files: {
    'requirements.txt': 'fastapi==0.115.0\nopenai==1.70.0'
  },
  repoTreePaths: []
});

assert.equal(workerPlan.supported, true);
assert.equal(workerPlan.adapterStrategy, 'standalone_worker_adapter');
assert.equal(workerPlan.deploymentMode, 'separate_worker');
assert.equal(workerPlan.framework, 'fastapi-compatible-worker-adapter');
assert.ok(workerPlan.requiredEnv.includes('OPENAI_API_KEY'));
assert.ok(workerPlan.filesToWrite.some((file) => file.path === 'aiagent2/worker-adapter.js'));
assert.ok(workerPlan.filesToWrite.some((file) => file.path === 'aiagent2/wrangler.example.jsonc'));
assert.ok(workerPlan.filesToWrite.find((file) => file.path === 'aiagent2/worker-adapter.js').content.includes('aiagent2-standalone-cloudflare-worker'));
assert.ok(workerPlan.filesToWrite.find((file) => file.path === 'aiagent2/SETUP.md').content.includes('Deploy the standalone Worker'));

const openAiPlan = buildGithubAdapterPlan({
  repoMeta: {
    name: 'generic-next',
    full_name: 'example/generic-next',
    owner: { login: 'example' }
  },
  files: {
    'package.json': JSON.stringify({
      name: 'generic-next',
      dependencies: {
        next: '^15.0.0',
        openai: '^5.0.0'
      }
    })
  },
  repoTreePaths: ['pages/index.tsx']
});

assert.equal(openAiPlan.supported, true);
assert.equal(openAiPlan.adapterStrategy, 'generic_openai');
assert.ok(openAiPlan.requiredEnv.includes('OPENAI_API_KEY'));
assert.ok(openAiPlan.optionalEnv.includes('AIAGENT2_INPUT_PRICE_PER_MTOK'));
assert.ok(openAiPlan.optionalEnv.includes('AIAGENT2_OUTPUT_PRICE_PER_MTOK'));
assert.ok(openAiPlan.filesToWrite.find((file) => file.path.endsWith('/jobs.js')).content.includes('/responses'));
assert.ok(openAiPlan.filesToWrite.find((file) => file.path.endsWith('/jobs.js')).content.includes('AIAGENT2_INPUT_PRICE_PER_MTOK'));

const customPlan = buildGithubAdapterPlan({
  repoMeta: {
    name: 'custom-next',
    full_name: 'example/custom-next',
    owner: { login: 'example' }
  },
  files: {
    'package.json': JSON.stringify({
      name: 'custom-next',
      dependencies: {
        next: '^15.0.0'
      }
    }),
    'README.md': 'Uses ACME_LLM_API_KEY and SERP_API_KEY for generation and search.'
  },
  repoTreePaths: ['pages/index.tsx']
});

assert.equal(customPlan.supported, true);
assert.equal(customPlan.adapterStrategy, 'generic_custom');
assert.ok(customPlan.requiredEnv.includes('ACME_LLM_API_KEY'));
assert.ok(customPlan.optionalEnv.includes('AIAGENT2_OPENAI_COMPATIBLE_BASE_URL'));
assert.ok(customPlan.filesToWrite.find((file) => file.path.endsWith('/health.js')).content.includes('AIAGENT2_OPENAI_COMPATIBLE_BASE_URL'));
assert.ok(customPlan.filesToWrite.find((file) => file.path.endsWith('/jobs.js')).content.includes('AIAGENT2_OPENAI_COMPATIBLE_BASE_URL'));
assert.ok(customPlan.filesToWrite.find((file) => file.path.endsWith('/jobs.js')).content.includes('process.env[API_KEY_ENV]'));

console.log('github adapter qa passed');
