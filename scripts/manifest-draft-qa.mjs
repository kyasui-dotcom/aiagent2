import assert from 'node:assert/strict';
import { buildDraftManifestFromAgentSkill, buildDraftManifestFromRepoAnalysis, deriveManifestSignalPaths, parseAgentSkillContent } from '../lib/manifest.js';

const generated = buildDraftManifestFromRepoAnalysis({
  repoMeta: {
    name: 'research-broker',
    full_name: 'octo/research-broker',
    description: 'Research automation runtime for provider comparison.',
    html_url: 'https://github.com/octo/research-broker',
    default_branch: 'main',
    private: false,
    owner: { login: 'octo' }
  },
  files: {
    'README.md': '# Research Broker\n\nResearch automation runtime for provider comparison.\n\nHealth endpoint `/api/health` and jobs endpoint `/api/jobs`.\n',
    'package.json': JSON.stringify({
      name: '@octo/research-broker',
      description: 'Research automation runtime for provider comparison.',
      keywords: ['research', 'automation'],
      dependencies: {
        openai: '^1.0.0',
        hono: '^4.0.0'
      }
    }, null, 2)
  }
});

assert.equal(generated.validation.ok, true);
assert.equal(generated.draftManifest.schema_version, 'agent-manifest/v1');
assert.equal(generated.draftManifest.name, 'octo_research_broker');
assert.ok(generated.draftManifest.task_types.includes('research'));
assert.equal(generated.draftManifest.pricing.provider_markup_rate, 0.1);
assert.equal(generated.draftManifest.pricing.platform_margin_rate, 0.1);
assert.equal(generated.draftManifest.execution_pattern, 'long_running');
assert.ok(generated.draftManifest.input_types.includes('text'));
assert.ok(generated.draftManifest.output_types.includes('report'));
assert.equal(generated.draftManifest.clarification, 'optional_clarification');
assert.equal(generated.draftManifest.risk_level, 'review_required');
assert.equal(generated.draftManifest.usage_contract.report_input_tokens, true);
assert.deepEqual(generated.draftManifest.metadata.endpoint_hints.relative_health_paths, ['/api/health']);
assert.deepEqual(generated.draftManifest.metadata.endpoint_hints.relative_job_paths, ['/api/jobs']);
assert.ok(generated.analysis.runtimeHints.includes('openai'));
assert.ok(generated.analysis.warnings.some((warning) => warning.includes('No absolute healthcheck URL')));

const metadataOnly = buildDraftManifestFromRepoAnalysis({
  repoMeta: {
    name: 'ops-runtime',
    full_name: 'acme/ops-runtime',
    description: 'Dispatch broker for runtime ops.',
    owner: { login: 'acme' }
  },
  files: {}
});

assert.equal(metadataOnly.validation.ok, true);
assert.equal(metadataOnly.draftManifest.owner, 'acme');
assert.ok(metadataOnly.analysis.warnings.some((warning) => warning.includes('metadata only')));

const localReady = buildDraftManifestFromRepoAnalysis({
  repoMeta: {
    name: 'seo-agent',
    full_name: 'kyasui-dotcom/seo-agent',
    description: 'Desktop SEO agent.',
    owner: { login: 'kyasui-dotcom' }
  },
  preferLocalEndpoints: true,
  files: {
    'package.json': JSON.stringify({
      name: 'seo-agent',
      scripts: { dev: 'next dev --port 3001' },
      dependencies: { next: '^15.0.0' }
    }),
    'SETUP.md': 'ブラウザで http://localhost:3001 を開く。',
    'src/app/api/health/route.ts': 'export async function GET() {}',
    'src/app/api/jobs/route.ts': 'export async function POST() {}'
  }
});

assert.equal(localReady.draftManifest.healthcheck_url, 'http://127.0.0.1:3001/api/health');
assert.equal(localReady.draftManifest.job_endpoint, 'http://127.0.0.1:3001/api/jobs');
assert.equal(localReady.draftManifest.metadata.execution_scope, 'local_desktop');
assert.equal(localReady.analysis.localPort, 3001);

const hostedAdapterOnly = buildDraftManifestFromRepoAnalysis({
  repoMeta: {
    name: 'hosted-seo-agent',
    full_name: 'kyasui-dotcom/hosted-seo-agent',
    description: 'Hosted SEO agent.',
    owner: { login: 'kyasui-dotcom' }
  },
  files: {
    'package.json': JSON.stringify({
      name: 'hosted-seo-agent',
      dependencies: { next: '^15.0.0' }
    }),
    'src/pages/api/aiagent2/health.js': 'export default function handler() {}',
    'src/pages/api/aiagent2/jobs.js': 'export default function handler() {}',
    'src/pages/api/aiagent2/manifest.js': 'export default function handler() {}'
  }
});

assert.ok(hostedAdapterOnly.analysis.loadedFiles.some((item) => item.path === 'src/pages/api/aiagent2/health.js'));
assert.ok(hostedAdapterOnly.analysis.relativeHealthHints.includes('/api/aiagent2/health'));
assert.ok(hostedAdapterOnly.analysis.relativeJobHints.includes('/api/aiagent2/jobs'));
assert.equal(hostedAdapterOnly.analysis.localBroker.healthcheckUrl, 'http://127.0.0.1:3000/api/aiagent2/health');
assert.equal(hostedAdapterOnly.analysis.localBroker.jobEndpoint, 'http://127.0.0.1:3000/api/aiagent2/jobs');

const parsedSkill = parseAgentSkillContent(`---
name: seo-improver
description: Improves SEO briefs by researching search intent and turning vague requests into concrete requirements.
tags: [seo, prompt, research]
---

# SEO Improver

Use this skill when a user wants SEO content, keyword research, competitor comparison, or prompt clarification.

Ask for missing audience, target keyword, region, language, and source URLs before producing the final brief.
`);

assert.equal(parsedSkill.name, 'seo-improver');
assert.equal(parsedSkill.frontmatter.tags[0], 'seo');
assert.ok(parsedSkill.description.includes('Improves SEO briefs'));

const skillDraft = buildDraftManifestFromAgentSkill({
  ownerLogin: 'kyasui-dotcom',
  skillMd: `---
name: seo-improver
description: Improves SEO briefs by researching search intent and turning vague requests into concrete requirements.
---

# SEO Improver

Use this skill for SEO research, content gap analysis, prompt clarification, and writing briefs.
`
});

assert.equal(skillDraft.validation.ok, true);
assert.equal(skillDraft.draftManifest.name, 'seo_improver');
assert.equal(skillDraft.draftManifest.owner, 'kyasui-dotcom');
assert.ok(skillDraft.draftManifest.task_types.includes('seo'));
assert.equal(skillDraft.draftManifest.metadata.generated_from_agent_skill, true);
assert.equal(skillDraft.draftManifest.metadata.agent_skill.standard, 'agent-skills');
assert.equal(skillDraft.draftManifest.clarification, 'required_intake');
assert.ok(skillDraft.draftManifest.input_types.includes('chat'));
assert.ok(skillDraft.draftManifest.capabilities.includes('seo'));
assert.ok(skillDraft.analysis.runtimeHints.includes('agent-skills'));
assert.ok(skillDraft.analysis.warnings.some((warning) => warning.includes('hosted healthcheck')));

const repoWithSkill = buildDraftManifestFromRepoAnalysis({
  repoMeta: {
    name: 'seo-skill',
    full_name: 'kyasui-dotcom/seo-skill',
    description: 'Repo with an Agent Skill.',
    html_url: 'https://github.com/kyasui-dotcom/seo-skill',
    default_branch: 'main',
    owner: { login: 'kyasui-dotcom' }
  },
  files: {
    'SKILL.md': `---
name: prompt-brief-builder
description: Clarifies vague requirements and creates execution-ready prompts.
---

# Prompt Brief Builder

Use this for prompt brushup, intake, requirements clarification, and writing acceptance criteria.
`,
    'README.md': '# SEO Skill'
  }
});

assert.equal(repoWithSkill.draftManifest.name, 'prompt_brief_builder');
assert.equal(repoWithSkill.draftManifest.metadata.agent_skill.file_path, 'SKILL.md');
assert.ok(repoWithSkill.draftManifest.task_types.includes('prompt_brushup'));
assert.equal(repoWithSkill.draftManifest.clarification, 'required_intake');
assert.ok(repoWithSkill.draftManifest.metadata.pattern_detection.length);
assert.ok(repoWithSkill.analysis.runtimeHints.includes('agent-skills'));

const signalPaths = deriveManifestSignalPaths([
  'SKILL.md',
  'README.md',
  'package.json',
  'src/pages/api/aiagent2/health.js',
  'src/pages/api/aiagent2/jobs.js',
  'src/lib/broker.ts',
  'docs/README.md',
  'examples/sample/README.md'
]);

assert.deepEqual(signalPaths, [
  'SKILL.md',
  'README.md',
  'package.json',
  'src/pages/api/aiagent2/health.js',
  'src/pages/api/aiagent2/jobs.js',
  'src/lib/broker.ts',
  'docs/README.md',
  'examples/sample/README.md'
]);

console.log('manifest draft qa passed');
