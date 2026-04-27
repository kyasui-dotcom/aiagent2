import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_NAME } from '../lib/seo-pages.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const indexHtml = read('public/index.html');
const helpHtml = read('public/help.html');
const glossaryHtml = read('public/glossary.html');
const contributeHtml = read('public/contribute.html');
const resourcesHtml = read('public/resources.html');
const agentsHtml = read('public/agents.html');
const siteMapHtml = read('public/site-map.html');
const guideHtml = read('public/guide.html');
const cliHtml = read('public/cli-help.html');
const qaHtml = read('public/qa.html');
const newsHtml = read('public/news.html');
const termsHtml = read('public/terms.html');
const privacyHtml = read('public/privacy.html');
const manifestDoc = read('MANIFEST.md');

for (const [name, html] of [
  ['help', helpHtml],
  ['glossary', glossaryHtml],
  ['contribute', contributeHtml],
  ['resources', resourcesHtml],
  ['agents', agentsHtml],
  ['site-map', siteMapHtml],
  ['guide', guideHtml],
  ['cli', cliHtml],
  ['qa', qaHtml],
  ['news', newsHtml],
  ['terms', termsHtml],
  ['privacy', privacyHtml]
]) {
  assert.ok(html.includes(`<a class="logo logo-link" href="/" aria-label="Back to ${SITE_NAME} start">${SITE_NAME}</a>`), `${name} logo should link back to start`);
}

for (const href of ['/help.html', '/resources.html', '/site-map.html', '/llms.txt', '/rss.xml', '/feed.xml', '/glossary.html', '/contribute.html', '/guide.html', '/cli-help.html', '/qa.html', '/news.html', '/terms.html', '/privacy.html', '/no-api-key-ai-agents.html', '/ai-agent-marketplace.html', '/publish-ai-agents.html', '/ai-agent-runtime.html', '/ai-agent-monetization.html', '/order-ai-agents.html', '/ai-agent-api.html', '/ai-agent-cli.html', '/ai-agent-verification.html', '/ai-agent-manifest.html', '/github-ai-agent-integration.html', '/ai-agent-payouts.html', '/verifiable-ai-agent-delivery.html', '/agents.html', '/agents/prompt-brushup-ai-agent.html', '/agents/seo-gap-ai-agent.html']) {
  assert.ok(indexHtml.includes(href), `index should link ${href}`);
}

assert.ok(helpHtml.includes('HELP CENTER'));
assert.ok(helpHtml.includes('START HERE'));
assert.ok(helpHtml.includes('Work Chat Lifecycle') || helpHtml.includes('WORK CHAT LIFECYCLE'));
assert.ok(helpHtml.includes('BUYER GUIDE'));
assert.ok(helpHtml.includes('PUBLISHER GUIDE'));
assert.ok(helpHtml.includes('SECURITY AND PERMISSIONS'));
assert.ok(helpHtml.includes('TROUBLESHOOTING'));
assert.ok(helpHtml.includes('FIRST-TIME PATHS'));
assert.ok(helpHtml.includes('WORK CHAT COMMANDS'));
assert.ok(helpHtml.includes('/route auto'));
assert.ok(helpHtml.includes('/route specialist'));
assert.ok(helpHtml.includes('/route leader'));
assert.ok(helpHtml.includes('/list-agent'));
assert.ok(helpHtml.includes('Specialist Agent'));
assert.ok(helpHtml.includes('Leader Agent'));
assert.ok(helpHtml.includes('SIGN IN TO ORDER'));
assert.ok(helpHtml.includes('AI GLOSSARY'));
assert.ok(helpHtml.includes('ORDER AN AI AGENT'));
assert.ok(helpHtml.includes('/guide.html'));
assert.ok(helpHtml.includes('/glossary.html'));
assert.ok(helpHtml.includes('/contribute.html'));
assert.ok(helpHtml.includes('/terms.html'));

assert.ok(glossaryHtml.includes(`AI Glossary: AI, LLM, RAG, AI Agents, and ${SITE_NAME} Terms`));
assert.ok(glossaryHtml.includes('Artificial Intelligence'));
assert.ok(glossaryHtml.includes('Machine Learning'));
assert.ok(glossaryHtml.includes('Generative AI'));
assert.ok(glossaryHtml.includes('Prompt Injection'));
assert.ok(glossaryHtml.includes('Vector Database'));
assert.ok(glossaryHtml.includes('Tool Calling'));
assert.ok(glossaryHtml.includes('ORDER AN AI AGENT'));
assert.ok(glossaryHtml.includes('LIST YOUR AGENT'));
assert.ok(glossaryHtml.includes('/?tab=work'));
assert.ok(glossaryHtml.includes('/?tab=agents'));

assert.ok(contributeHtml.includes('Contribute AI Agent Field Notes'));
assert.ok(contributeHtml.includes('OPEN GITHUB ISSUES'));
assert.ok(contributeHtml.includes('LIST YOUR AGENT'));

assert.ok(resourcesHtml.includes('AI AGENT RESOURCE HUB'));
assert.ok(resourcesHtml.includes('/no-api-key-ai-agents.html'));
assert.ok(resourcesHtml.includes('/sitemap.xml'));
assert.ok(resourcesHtml.includes('/site-map.html'));
assert.ok(resourcesHtml.includes('/llms.txt'));
assert.ok(resourcesHtml.includes('/rss.xml'));
assert.ok(resourcesHtml.includes('/feed.xml'));
assert.ok(resourcesHtml.includes('/agents/prompt-brushup-ai-agent.html'));
assert.ok(resourcesHtml.includes('/glossary/ai-agent.html'));

assert.ok(agentsHtml.includes('CORE SPECIALIST AGENTS'));
assert.ok(agentsHtml.includes('LEADER AGENTS'));
assert.ok(agentsHtml.includes('CHANNEL AND DATA SPECIALISTS'));
assert.ok(agentsHtml.includes('/help.html#agent-briefing'));
assert.ok(agentsHtml.indexOf('CORE SPECIALIST AGENTS') < agentsHtml.indexOf('LEADER AGENTS'));
assert.ok(agentsHtml.indexOf('LEADER AGENTS') < agentsHtml.indexOf('CHANNEL AND DATA SPECIALISTS'));

assert.ok(siteMapHtml.includes('HTML SITE MAP'));
assert.ok(siteMapHtml.includes('AI Agent Guides'));
assert.ok(siteMapHtml.includes('/no-api-key-ai-agents.html'));
assert.ok(siteMapHtml.includes('Built-In Agent Pages'));
assert.ok(siteMapHtml.includes('AI Glossary Definitions'));
assert.ok(siteMapHtml.includes('/ai-agent-marketplace.html'));
assert.ok(siteMapHtml.includes('/agents/prompt-brushup-ai-agent.html'));
assert.ok(siteMapHtml.includes('/news/demo-video-provider-flow.html'));
assert.ok(siteMapHtml.includes('/glossary/ai-agent.html'));

assert.ok(guideHtml.includes('FIRST RUN GUIDE'));
assert.ok(guideHtml.includes('npm run dev'));
assert.ok(guideHtml.includes('127.0.0.1:4323'));
assert.ok(guideHtml.includes('/api/jobs'));

assert.ok(cliHtml.includes('CLI HELP'));
assert.ok(cliHtml.includes('curl.exe'));
assert.ok(cliHtml.includes('npx wrangler dev'));
assert.ok(cliHtml.includes('npm run qa:all'));
assert.ok(cliHtml.includes('PUBLIC CAIt API KEY'));
assert.ok(cliHtml.includes('AGENT REGISTRATION WITH CAIt API KEY'));
assert.ok(cliHtml.includes('ONE CAIt API KEY'));
assert.ok(cliHtml.includes('npm run cait:key -- create --label codex-desktop'));
assert.ok(cliHtml.includes('CAIT_ADMIN_API_TOKEN'));
assert.ok(cliHtml.includes('https://aiagent-marketplace.net/api/jobs'));
assert.ok(cliHtml.includes('needs_input'));
assert.ok(cliHtml.includes('skip_intake'));
assert.ok(cliHtml.includes('https://aiagent-marketplace.net/api/agents/import-manifest'));
assert.ok(cliHtml.includes('Authorization: Bearer'));
assert.ok(cliHtml.includes('/api/settings/api-keys'));
assert.ok(cliHtml.includes('/api/admin/api-keys'));
assert.ok(cliHtml.includes('/api/agents/<agent_id>/verify') || cliHtml.includes('/api/agents/&lt;agent_id&gt;/verify'));
assert.ok(cliHtml.includes('saved-card month-end billing and plan rules'));

assert.ok(qaHtml.includes('Q&A'));
assert.ok(qaHtml.includes('cost basis + creator fee 10% + marketplace fee 10%'));
assert.ok(qaHtml.includes('GitHub App'));

assert.ok(newsHtml.includes('NEWS / FIELD NOTES'));
assert.ok(newsHtml.includes('Product updates, design decisions, and operating notes'));
assert.ok(newsHtml.includes('Buyers can order built-in AI agents without API key setup'));
assert.ok(newsHtml.includes('START now leads with Work Chat and keeps provider earning one step away'));
assert.ok(newsHtml.includes(`A Codex field note on why ${SITE_NAME} matters`));
assert.ok(newsHtml.includes('Why AI agents need a runtime, not just another chat box'));
assert.ok(newsHtml.includes('Contributed Field Note'));
assert.ok(newsHtml.includes('Work Chat now turns rough intent into order-ready briefs'));
assert.ok(newsHtml.includes('Agent listing stays visible while providers register'));
assert.ok(newsHtml.includes('Each update has its own page for search'));

assert.ok(termsHtml.includes('TERMS OF SERVICE'));
assert.ok(termsHtml.includes('2026-04-19'));
assert.ok(termsHtml.includes('FEES, BILLING, AND PROVIDER PAYOUTS'));

assert.ok(privacyHtml.includes('PRIVACY POLICY'));
assert.ok(privacyHtml.includes('Cloudflare'));
assert.ok(privacyHtml.includes('GitHub'));

assert.ok(manifestDoc.includes('kind`: `agent` (default), `composite_agent`, or `agent_group`'));
assert.ok(manifestDoc.includes('Default: register each AI agent separately'));
assert.ok(manifestDoc.includes('Composite manifest example'));
assert.ok(manifestDoc.includes('Agent group example'));
assert.ok(manifestDoc.includes('In `composition.components`, use `agent_id`'));
assert.ok(manifestDoc.includes('"agent_id": "architecture_review_agent"'));
assert.ok(manifestDoc.includes('private/local runner'));
assert.ok(manifestDoc.includes('`requirements`: optional non-secret requirements'));
assert.ok(manifestDoc.includes('CAIt acts as the requirement hub'));
assert.ok(manifestDoc.includes('Coding agents should normally use GitHub repo access'));

const overview = execFileSync(process.execPath, [path.join(root, 'scripts/help.mjs')], { encoding: 'utf8' });
const cliHelp = execFileSync(process.execPath, [path.join(root, 'scripts/help.mjs'), 'cli'], { encoding: 'utf8' });
const qaHelp = execFileSync(process.execPath, [path.join(root, 'scripts/help.mjs'), 'qa'], { encoding: 'utf8' });

assert.ok(overview.includes('npm run help:cli'));
assert.ok(overview.includes('/privacy.html'));
assert.ok(cliHelp.includes('/api/jobs'));
assert.ok(cliHelp.includes('Invoke-RestMethod'));
assert.ok(qaHelp.includes('npm run qa:docs'));
assert.ok(qaHelp.includes('Recommended order'));

console.log('docs qa passed');
