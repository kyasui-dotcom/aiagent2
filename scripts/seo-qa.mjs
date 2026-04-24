import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glossaryTerms, newsPosts, seoLandingPages, SITE_NAME, SITE_SHORT_NAME, SITE_URL } from '../lib/seo-pages.js';
import { DEFAULT_AGENT_SEEDS, DEPRECATED_AGENT_SEED_IDS } from '../lib/shared.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const exists = (file) => statSync(path.join(root, file)).isFile();
const brandText = (value) => String(value ?? '')
  .replace(/AIAGENT2/g, SITE_NAME.toUpperCase())
  .replace(/AIagent²/g, SITE_SHORT_NAME)
  .replace(/AIagent2/g, SITE_NAME);

function assertSeoPage(file, canonicalPath, expectedText) {
  assert.ok(exists(file), `${file} should exist`);
  const html = read(file);
  assert.ok(html.includes('<title>'), `${file} should have title`);
  assert.ok(html.includes('<meta name="description"'), `${file} should have description`);
  assert.ok(html.includes(`<link rel="canonical" href="${SITE_URL}${canonicalPath}"`), `${file} should have canonical`);
  assert.ok(html.includes(`<link rel="alternate" type="application/rss+xml" title="${SITE_NAME} News RSS" href="/rss.xml"`), `${file} should expose RSS discovery`);
  assert.ok(html.includes(`<link rel="alternate" type="application/atom+xml" title="${SITE_NAME} News Atom" href="/feed.xml"`), `${file} should expose Atom discovery`);
  assert.ok(html.includes('application/ld+json'), `${file} should have JSON-LD`);
  assert.ok(html.includes('"@type":"BreadcrumbList"'), `${file} should have breadcrumb schema`);
  assert.ok(html.includes(`<a class="logo logo-link" href="/" aria-label="Back to ${SITE_NAME} start">${SITE_NAME}</a>`), `${file} should have linked logo`);
  assert.ok(html.includes('ORDER AN AI AGENT'), `${file} should have order CTA`);
  assert.ok(html.includes('LIST YOUR AGENT'), `${file} should have agent CTA`);
  assert.ok(html.includes(brandText(expectedText)), `${file} should include ${brandText(expectedText)}`);
  return html;
}

function agentKind(agent) {
  return String(agent?.metadata?.category || agent?.metadata?.manifest?.metadata?.category || agent?.kind || '').trim();
}

function agentPageSlug(agent) {
  return `${agentKind(agent).replace(/_/g, '-')}-ai-agent`;
}

const glossary = read('public/glossary.html');
assert.ok(glossary.includes(`AI Glossary: AI, LLM, RAG, AI Agents, and ${SITE_NAME} Terms`));
assert.ok(glossary.includes('/glossary/artificial-intelligence.html'));
assert.ok(glossary.includes('/glossary/prompt-injection.html'));
assert.ok(glossary.includes('/glossary/ai-agent.html'));
assert.ok(glossary.includes('/glossary/ai-agent-marketplace.html'));

const home = read('public/index.html');
assert.ok(home.includes(`${SITE_NAME} | Chat-first AI Agent Marketplace`), 'home should have descriptive SEO title');
assert.ok(home.includes('AI agents without API keys'), 'home should include no API key positioning keyword');
assert.ok(home.includes('<meta name="description"'), 'home should have meta description');
assert.ok(home.includes('<link rel="canonical" href="https://aiagent-marketplace.net/"'), 'home should have canonical');
assert.ok(home.includes(`<link rel="alternate" type="application/rss+xml" title="${SITE_NAME} News RSS" href="/rss.xml"`), 'home should expose RSS discovery');
assert.ok(home.includes(`<link rel="alternate" type="application/atom+xml" title="${SITE_NAME} News Atom" href="/feed.xml"`), 'home should expose Atom discovery');
assert.ok(home.includes('"@type": "SoftwareApplication"'), 'home should have app schema');
assert.ok(home.includes('"@type": "FAQPage"'), 'home should have FAQ schema');
assert.ok(home.includes('AI AGENT MARKETPLACE FAQ'), 'home should include crawlable FAQ content');
assert.ok(home.includes('/resources.html'), 'home should link resources hub');
assert.ok(home.includes('/llms.txt'), 'home should link llms.txt');
assert.ok(home.includes('/site-map.html'), 'home should link HTML site map');
assert.ok(home.includes('/demo.html'), 'home should link to demo page');
assert.ok(home.includes('/agents.html'), 'home should link to built-in agent catalog');
assert.ok(home.includes('/agents/prompt-brushup-ai-agent.html'), 'home should link prompt brushup agent page');
assert.ok(home.includes('/agents/seo-gap-ai-agent.html'), 'home should link SEO gap agent page');
for (const landingPage of seoLandingPages) {
  assert.ok(home.includes(`/${landingPage.slug}.html`), `home should link ${landingPage.slug}`);
}

const resources = assertSeoPage('public/resources.html', '/resources.html', `${SITE_NAME} resources`);
assert.ok(resources.includes('"@type":"CollectionPage"'), 'resources should have CollectionPage schema');
assert.ok(resources.includes('"@type":"ItemList"'), 'resources should have ItemList schema');
assert.ok(resources.includes('aria-label="Breadcrumb"'), 'resources should have visible breadcrumbs');
assert.ok(resources.includes('/no-api-key-ai-agents.html'), 'resources should link no API key guide');
assert.ok(resources.includes('/ai-agent-marketplace.html'), 'resources should link core guide');
assert.ok(resources.includes('/ai-agent-api.html'), 'resources should link workflow guide');
assert.ok(resources.includes('/agents/prompt-brushup-ai-agent.html'), 'resources should link agent pages');
assert.ok(resources.includes('/glossary/ai-agent.html'), 'resources should link glossary terms');
assert.ok(resources.includes('/llms.txt'), 'resources should link llms.txt');
assert.ok(resources.includes('/site-map.html'), 'resources should link HTML site map');
assert.ok(resources.includes('/rss.xml'), 'resources should link RSS feed');
assert.ok(resources.includes('/feed.xml'), 'resources should link Atom feed');

const siteMap = assertSeoPage('public/site-map.html', '/site-map.html', 'HTML SITE MAP');
assert.ok(siteMap.includes('"@type":"CollectionPage"'), 'HTML site map should have CollectionPage schema');
assert.ok(siteMap.includes('"@type":"ItemList"'), 'HTML site map should have ItemList schema');
assert.ok(siteMap.includes('AI Agent Guides'), 'HTML site map should group guide links');
assert.ok(siteMap.includes('Built-In Agent Pages'), 'HTML site map should group agent links');
assert.ok(siteMap.includes('News And Field Notes'), 'HTML site map should group news links');
assert.ok(siteMap.includes('AI Glossary Definitions'), 'HTML site map should group glossary links');
assert.ok(siteMap.includes('/no-api-key-ai-agents.html'), 'HTML site map should link no API key guide');
assert.ok(siteMap.includes('/ai-agent-marketplace.html'), 'HTML site map should link guide pages');
assert.ok(siteMap.includes('/agents/prompt-brushup-ai-agent.html'), 'HTML site map should link agent pages');
assert.ok(siteMap.includes('/news/demo-video-provider-flow.html'), 'HTML site map should link news pages');
assert.ok(siteMap.includes('/glossary/ai-agent.html'), 'HTML site map should link glossary pages');
assert.ok(siteMap.includes('/sitemap.xml'), 'HTML site map should link XML sitemap');

const agentCatalog = assertSeoPage('public/agents.html', '/agents.html', 'Built-In AI Agent Catalog');
assert.ok(agentCatalog.includes('"@type":"ItemList"'), 'agent catalog should have ItemList schema');
assert.ok(agentCatalog.includes('/agents/prompt-brushup-ai-agent.html'), 'agent catalog should link prompt brushup page');
assert.ok(agentCatalog.includes('/agents/seo-gap-ai-agent.html'), 'agent catalog should link SEO gap page');
assert.ok(agentCatalog.includes('/agents/landing-ai-agent.html'), 'agent catalog should link landing critique page');

const publicAgentSeeds = DEFAULT_AGENT_SEEDS.filter((agent) => !DEPRECATED_AGENT_SEED_IDS.includes(agent.id));

for (const agent of publicAgentSeeds) {
  const slug = agentPageSlug(agent);
  const html = assertSeoPage(`public/agents/${slug}.html`, `/agents/${slug}.html`, `Built-in ${SITE_NAME} agent`);
  assert.ok(html.includes('"@type":"SoftwareApplication"'), `${slug} should have SoftwareApplication schema`);
  assert.ok(html.includes('"@type":"FAQPage"'), `${slug} should have FAQ schema`);
  assert.ok(html.includes('"@type":"BreadcrumbList"'), `${slug} should have breadcrumb schema`);
  assert.ok(html.includes('Expected delivery'), `${slug} should explain delivery`);
}

const news = assertSeoPage('public/news.html', '/news.html', 'NEWS / FIELD NOTES');
assert.ok(news.includes('aria-label="Breadcrumb"'), 'news should have visible breadcrumbs');
assert.ok(news.includes('/news/buyer-orders-without-api-key-setup.html'));
assert.ok(news.includes('Buyers can order built-in AI agents without API key setup'));
assert.ok(news.includes('/news/demo-video-provider-flow.html'));
assert.ok(news.includes(`Watch the ${SITE_NAME} chat-first marketplace demo video`));
assert.ok(news.includes('/news/landing-page-focuses-on-agent-earnings.html'));
assert.ok(news.includes('START now leads with Work Chat and keeps provider earning one step away'));
assert.ok(news.includes('/news/codex-field-note-why-aiagent2-matters.html'));
assert.ok(news.includes(`A Codex field note on why ${SITE_NAME} matters`));
assert.ok(news.includes('/news/why-ai-agents-need-a-runtime.html'));
assert.ok(news.includes('Contributed Field Note'));
assert.ok(news.includes('/news/order-natural-language-request.html'));
assert.ok(news.includes('/news/agent-listing-visible-during-registration.html'));
assert.ok(news.includes('/news/open-core-repo-easier-to-evaluate.html'));

for (const post of newsPosts) {
  const html = assertSeoPage(`public/news/${post.slug}.html`, `/news/${post.slug}.html`, post.title);
  assert.ok(html.includes('"@type":"BlogPosting"'), `${post.slug} should use BlogPosting schema`);
  assert.ok(html.includes('"mainEntityOfPage"'), `${post.slug} should identify the main entity page`);
  assert.ok(html.includes(`"articleSection":"${brandText(post.kind || 'AIagent2 News')}"`), `${post.slug} should include article section`);
  assert.ok(html.includes(`property="article:published_time" content="${post.date}T00:00:00.000Z"`), `${post.slug} should have article published time`);
  assert.ok(html.includes(`property="article:modified_time" content="${post.date}T00:00:00.000Z"`), `${post.slug} should have article modified time`);
  assert.ok(html.includes(`property="article:author" content="${brandText(post.author || 'AIagent2')}"`), `${post.slug} should have article author meta`);
  assert.ok(html.includes('aria-label="Breadcrumb"'), `${post.slug} should have visible breadcrumbs`);
  if (post.author) assert.ok(html.includes(brandText(post.author)), `${post.slug} should include author`);
}

const terms = glossaryTerms();
assert.ok(terms.length >= 80, 'glossary should cover broad AI terminology');
for (const term of terms) {
  assertSeoPage(`public/glossary/${term.slug}.html`, `/glossary/${term.slug}.html`, `What is ${term.term}?`);
}

assertSeoPage('public/contribute.html', '/contribute.html', 'Contribute AI Agent Field Notes');

for (const landingPage of seoLandingPages) {
  const html = assertSeoPage(`public/${landingPage.slug}.html`, `/${landingPage.slug}.html`, landingPage.title);
  assert.ok(html.includes('"@type":"FAQPage"'), `${landingPage.slug} should have FAQ schema`);
  assert.ok(html.includes('"@type":"BreadcrumbList"'), `${landingPage.slug} should have breadcrumb schema`);
  assert.ok(html.includes(landingPage.keyword), `${landingPage.slug} should include target keyword`);
  assert.ok(html.includes(`What ${SITE_NAME} gives you`), `${landingPage.slug} should include product fit section`);
  if ([
    'no-api-key-ai-agents',
    'publish-ai-agents',
    'ai-agent-runtime',
    'ai-agent-monetization',
    'order-ai-agents',
    'ai-agent-api',
    'ai-agent-cli',
    'ai-agent-verification',
    'ai-agent-manifest',
    'github-ai-agent-integration',
    'ai-agent-payouts',
    'verifiable-ai-agent-delivery'
  ].includes(landingPage.slug)) {
    assert.ok(html.includes('"@type":"HowTo"'), `${landingPage.slug} should have HowTo schema`);
    assert.ok(html.includes('Implementation steps'), `${landingPage.slug} should show visible HowTo steps`);
  }
}

const demo = assertSeoPage('public/demo.html', '/demo.html', `${SITE_NAME.toUpperCase()} DEMO`);
assert.ok(demo.includes('"@type":"VideoObject"'), 'demo should have VideoObject schema');
assert.ok(demo.includes('/videos/cait-marketplace-demo-20260417.mp4'), 'demo should include mp4 video');
assert.ok(demo.includes('/videos/cait-marketplace-demo-thumbnail-20260417.jpg'), 'demo should include thumbnail');
assert.ok(statSync(path.join(root, 'public/videos/cait-marketplace-demo-20260417.mp4')).size > 100000, 'demo mp4 should exist');
assert.ok(statSync(path.join(root, 'public/videos/cait-marketplace-demo-thumbnail-20260417.jpg')).size > 10000, 'demo thumbnail should exist');

const sitemap = read('public/sitemap.xml');
assert.ok(sitemap.includes(`${SITE_URL}/sitemap.xml`) === false, 'sitemap should contain page URLs, not itself');
assert.ok(sitemap.includes(`${SITE_URL}/resources.html`), 'sitemap should include resources hub');
assert.ok(sitemap.includes(`${SITE_URL}/site-map.html`), 'sitemap should include HTML site map');
for (const landingPage of seoLandingPages) {
  assert.ok(sitemap.includes(`${SITE_URL}/${landingPage.slug}.html`), `sitemap should include ${landingPage.slug}`);
}
assert.ok(sitemap.includes(`${SITE_URL}/agents.html`));
for (const agent of publicAgentSeeds) {
  assert.ok(sitemap.includes(`${SITE_URL}/agents/${agentPageSlug(agent)}.html`), `sitemap should include ${agentPageSlug(agent)}`);
}
assert.ok(sitemap.includes(`${SITE_URL}/demo.html`));
assert.ok(sitemap.includes(`${SITE_URL}/glossary.html`));
assert.ok(sitemap.includes(`${SITE_URL}/contribute.html`));
assert.ok(sitemap.includes(`${SITE_URL}/news/demo-video-provider-flow.html`));
assert.ok(sitemap.includes(`${SITE_URL}/news/buyer-orders-without-api-key-setup.html`));
assert.ok(sitemap.includes(`${SITE_URL}/news/order-natural-language-request.html`));
assert.ok(sitemap.includes(`${SITE_URL}/glossary/artificial-intelligence.html`));
assert.ok(sitemap.includes(`${SITE_URL}/glossary/ai-agent.html`));
assert.ok(sitemap.includes(`${SITE_URL}/glossary/ai-agent-marketplace.html`));

const robots = read('public/robots.txt');
assert.ok(robots.includes('User-agent: *'));
assert.ok(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`));

const llms = read('public/llms.txt');
assert.ok(llms.includes(`# ${SITE_NAME}`), 'llms should have title');
assert.ok(llms.includes(`${SITE_URL}/resources.html`), 'llms should link resources hub');
assert.ok(llms.includes(`${SITE_URL}/site-map.html`), 'llms should link HTML site map');
assert.ok(llms.includes(`${SITE_URL}/ai-agent-marketplace.html`), 'llms should link core guides');
assert.ok(llms.includes(`${SITE_URL}/agents/prompt-brushup-ai-agent.html`), 'llms should link agent pages');
assert.ok(llms.includes(`${SITE_URL}/glossary/ai-agent.html`), 'llms should link glossary pages');
assert.ok(llms.includes(`${SITE_URL}/rss.xml`), 'llms should link RSS feed');
assert.ok(llms.includes(`${SITE_URL}/feed.xml`), 'llms should link Atom feed');

const rss = read('public/rss.xml');
assert.ok(rss.includes('<rss version="2.0"'), 'rss should be RSS 2.0');
assert.ok(rss.includes('<channel>'), 'rss should have a channel');
assert.ok(rss.includes(`<title>${SITE_NAME} News and Field Notes</title>`), 'rss should have feed title');
assert.ok(rss.includes(`<link>${SITE_URL}/news.html</link>`), 'rss should link news index');
assert.ok(rss.includes(`<atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />`), 'rss should have self link');

const atom = read('public/feed.xml');
assert.ok(atom.includes('<feed xmlns="http://www.w3.org/2005/Atom">'), 'atom should have Atom namespace');
assert.ok(atom.includes(`<title>${SITE_NAME} News and Field Notes</title>`), 'atom should have feed title');
assert.ok(atom.includes(`<link href="${SITE_URL}/feed.xml" rel="self" />`), 'atom should have self link');
assert.ok(atom.includes(`<link href="${SITE_URL}/news.html" rel="alternate" />`), 'atom should link news index');
for (const post of newsPosts) {
  assert.ok(rss.includes(`<title>${brandText(post.title)}</title>`), `rss should include ${post.slug}`);
  assert.ok(rss.includes(`<link>${SITE_URL}/news/${post.slug}.html</link>`), `rss should link ${post.slug}`);
  assert.ok(atom.includes(`<title>${brandText(post.title)}</title>`), `atom should include ${post.slug}`);
  assert.ok(atom.includes(`<link href="${SITE_URL}/news/${post.slug}.html" rel="alternate" />`), `atom should link ${post.slug}`);
}

console.log('seo qa passed');
