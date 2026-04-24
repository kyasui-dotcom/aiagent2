import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contributionPage, glossaryCategories, glossaryTerms, newsPosts, seoLandingPages, SITE_NAME, SITE_SHORT_NAME, SITE_URL } from '../lib/seo-pages.js';
import { DEFAULT_AGENT_SEEDS, DEPRECATED_AGENT_SEED_IDS } from '../lib/shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

function brandPublicText(value) {
  return String(value ?? '')
    .replace(/AIAGENT2/g, SITE_NAME.toUpperCase())
    .replace(/AIagent²/g, SITE_SHORT_NAME)
    .replace(/AIagent2/g, SITE_NAME);
}

const AGENT_SEO_DETAILS = {
  prompt_brushup: {
    keyword: 'prompt improver AI agent',
    title: 'Prompt Brushup AI Agent for Clear Work Orders',
    searchIntent: 'people who have a rough request and need a better prompt, missing-question checklist, or order brief before paying for agent work',
    bestFor: ['turning vague requests into executable briefs', 'asking clarifying questions before work starts', 'preparing Web UI, CLI, and API order prompts'],
    delivery: ['refined prompt', 'missing information checklist', 'clarifying questions', 'acceptance criteria']
  },
  research: {
    keyword: 'research AI agent',
    title: 'Research AI Agent for Decision-Ready Briefs',
    searchIntent: 'buyers who need practical research, comparison, assumptions, risks, and a next-step recommendation from one work order',
    bestFor: ['market research', 'product comparison', 'business question triage'],
    delivery: ['short answer first', 'assumptions', 'analysis', 'risks', 'recommended next step']
  },
  writer: {
    keyword: 'AI writing agent',
    title: 'AI Writing Agent for SEO Copy and Landing Page Drafts',
    searchIntent: 'founders and marketers who need structured copy, headline options, SEO-aware drafts, and conversion-focused messaging',
    bestFor: ['landing page copy', 'SEO article outlines', 'launch copy variants'],
    delivery: ['audience angle', 'headline options', 'supporting copy', 'CTA ideas', 'revision notes']
  },
  code: {
    keyword: 'AI coding agent',
    title: 'AI Coding Agent for Implementation and Debugging Guidance',
    searchIntent: 'developers who need a coding agent to reason through bugs, implementation options, validation steps, and rollout notes',
    bestFor: ['bug diagnosis', 'implementation planning', 'API and worker debugging'],
    delivery: ['reproduction notes', 'likely causes', 'proposed implementation', 'validation plan', 'rollout notes']
  },
  pricing: {
    keyword: 'pricing strategy AI agent',
    title: 'Pricing Strategy AI Agent for Packaging and Monetization',
    searchIntent: 'builders deciding how to price software, services, subscriptions, or usage-based products without generic monetization advice',
    bestFor: ['SaaS pricing', 'package design', 'paid-plan launch planning'],
    delivery: ['buyer segment', 'packaging options', 'recommended price points', 'rationale', 'rollout risk']
  },
  teardown: {
    keyword: 'competitor analysis AI agent',
    title: 'Competitor Teardown AI Agent for Positioning Analysis',
    searchIntent: 'teams comparing competitors and looking for product, pricing, positioning, go-to-market gaps, and strategic implications',
    bestFor: ['competitor teardown', 'positioning work', 'market-entry research'],
    delivery: ['comparison grid', 'strategic gaps', 'threats', 'opportunities', 'next action']
  },
  landing: {
    keyword: 'landing page critique AI agent',
    title: 'Landing Page Critique AI Agent for Conversion Review',
    searchIntent: 'founders and marketers who want a fast landing page review focused on clarity, trust, CTA, hierarchy, and conversion friction',
    bestFor: ['first-view review', 'CTA critique', 'conversion copy diagnosis'],
    delivery: ['what works', 'friction points', 'copy fixes', 'structure fixes', 'CTA rewrites']
  },
  validation: {
    keyword: 'app idea validation AI agent',
    title: 'App Idea Validation AI Agent for Market Testing',
    searchIntent: 'founders who want to test an app idea with target user, alternatives, wedge, validation tests, and disproof criteria',
    bestFor: ['startup idea validation', 'MVP scope review', 'distribution wedge analysis'],
    delivery: ['target user', 'problem fit', 'alternatives', 'wedge', 'validation tests']
  },
  growth: {
    keyword: 'growth strategy AI agent',
    title: 'Growth Operator AI Agent for Acquisition Experiments',
    searchIntent: 'founders and operators who want executable growth experiments for user acquisition, conversion, activation, pricing, retention, and revenue',
    bestFor: ['growth sprint planning', 'community launch follow-up', 'conversion and signup diagnosis'],
    delivery: ['bottleneck diagnosis', 'ICP and offer rewrite', 'channel priority', '7-day experiment plan', 'success and stop metrics']
  },
  acquisition_automation: {
    keyword: 'customer acquisition automation AI agent',
    title: 'Acquisition Automation AI Agent for Safe Growth Workflows',
    searchIntent: 'founders who want consent-aware acquisition automation, CRM handoffs, outreach workflows, reply handling, and measurement without spam or fake engagement',
    bestFor: ['customer acquisition automation', 'CRM and follow-up workflow design', 'safe outreach and conversion handoff planning'],
    delivery: ['ICP and trigger', 'allowed-channel map', 'automation flow', 'message sequence', 'handoff rules', 'measurement checklist']
  },
  directory_submission: {
    keyword: 'directory submission AI agent',
    title: 'Directory Submission AI Agent for Free Product Listings',
    searchIntent: 'founders looking for free launch directories, AI tool directories, SaaS listings, reusable product copy, UTM tracking, and submission status management',
    bestFor: ['free directory listing', 'AI tool directory submission', 'startup launch directories', 'reusable listing copy', 'UTM tracking'],
    delivery: ['prioritized listing queue', 'submission rules', 'copy packet', 'per-site field map', 'status tracker']
  },
  agent_team_leader: {
    keyword: 'AI agent team leader',
    title: 'Agent Team Leader for Multi-Agent Work Orchestration',
    searchIntent: 'teams and founders who want one objective split across multiple AI agents with a clear leader, handoffs, and final synthesis',
    bestFor: ['multi-agent planning', 'workstream decomposition', 'final delivery synthesis'],
    delivery: ['shared objective', 'team roster', 'work split', 'dependencies', 'integration criteria']
  },
  launch_team_leader: {
    keyword: 'AI launch team agent',
    title: 'Launch Team Leader for Cross-Channel AI Agent Campaigns',
    searchIntent: 'founders who want one launch brief converted into coordinated growth, competitor, landing page, social, community, and analytics work',
    bestFor: ['product launches', 'cross-channel announcements', 'marketing agent team coordination'],
    delivery: ['positioning promise', 'channel work split', 'posting sequence', 'measurement plan', 'final launch package']
  },
  research_team_leader: {
    keyword: 'AI research team leader',
    title: 'Research Team Leader for Multi-Agent Decision Memos',
    searchIntent: 'operators who need market, competitor, diligence, data, and summary agents coordinated into one decision-ready research memo',
    bestFor: ['decision research', 'competitor analysis teams', 'data-backed diligence'],
    delivery: ['research questions', 'evidence plan', 'specialist work split', 'confidence criteria', 'decision memo contract']
  },
  build_team_leader: {
    keyword: 'AI coding team leader',
    title: 'Build Team Leader for AI Coding Agent Workflows',
    searchIntent: 'developers who need coding, debugging, ops, automation, and test agents coordinated safely around implementation work',
    bestFor: ['multi-agent coding work', 'debug and implementation planning', 'GitHub-oriented delivery coordination'],
    delivery: ['implementation objective', 'owner boundaries', 'dependencies', 'validation plan', 'rollback notes']
  },
  cmo_leader: {
    keyword: 'AI CMO agent',
    title: 'CMO Team Leader AI Agent for Marketing Strategy',
    searchIntent: 'founders who want CMO-level positioning, launch planning, channel strategy, acquisition experiments, and marketing agent coordination',
    bestFor: ['marketing strategy', 'launch planning', 'channel coordination'],
    delivery: ['ICP', 'positioning', 'channel plan', 'specialist team split', 'success metrics']
  },
  cto_leader: {
    keyword: 'AI CTO agent',
    title: 'CTO Team Leader AI Agent for Technical Strategy',
    searchIntent: 'builders who want CTO-level architecture, implementation planning, technical risk, operations, security, and QA coordination',
    bestFor: ['technical architecture', 'implementation planning', 'engineering risk review'],
    delivery: ['technical objective', 'architecture decision', 'work split', 'security notes', 'validation plan']
  },
  cpo_leader: {
    keyword: 'AI CPO agent',
    title: 'CPO Team Leader AI Agent for Product Strategy',
    searchIntent: 'founders who want CPO-level product strategy, roadmap tradeoffs, UX, onboarding, user problems, and feature prioritization',
    bestFor: ['product strategy', 'roadmap prioritization', 'UX and onboarding review'],
    delivery: ['user problem', 'jobs-to-be-done', 'roadmap options', 'prioritization', 'validation plan']
  },
  cfo_leader: {
    keyword: 'AI CFO agent',
    title: 'CFO Team Leader AI Agent for Pricing and Unit Economics',
    searchIntent: 'operators who want CFO-level pricing, unit economics, revenue model, billing risk, cash flow, and margin analysis',
    bestFor: ['pricing review', 'unit economics', 'financial model tradeoffs'],
    delivery: ['revenue model', 'unit economics', 'pricing scenarios', 'margin risks', 'financial metrics']
  },
  legal_leader: {
    keyword: 'AI legal review agent',
    title: 'Legal Team Leader AI Agent for Compliance and Risk Review',
    searchIntent: 'founders who need legal issue spotting for terms, privacy, compliance, billing, provider responsibility, and platform policy before counsel review',
    bestFor: ['legal issue spotting', 'terms and privacy review', 'platform risk review'],
    delivery: ['legal scope', 'key risks', 'missing facts', 'counsel questions', 'operational mitigations']
  },
  instagram: {
    keyword: 'Instagram launch AI agent',
    title: 'Instagram Launch AI Agent for Reels, Stories, and Carousels',
    searchIntent: 'founders and marketers who need Instagram-native launch content from a product or campaign brief',
    bestFor: ['Instagram launch posts', 'carousel planning', 'reel and story angles'],
    delivery: ['visual hook', 'carousel slides', 'reel idea', 'story sequence', 'caption and CTA']
  },
  x_post: {
    keyword: 'X automation AI agent',
    title: 'X Ops Connector AI Agent for OAuth-Safe Posts and Replies',
    searchIntent: 'founders who need concise X posts, threads, reply candidates, approval checkpoints, and OAuth-safe publishing from a connected X account',
    bestFor: ['X posts', 'launch threads', 'reply-driven distribution', 'OAuth-confirmed publishing'],
    delivery: ['short posts', 'thread outline', 'reply hooks', 'approval checklist', 'connector handoff']
  },
  reddit: {
    keyword: 'Reddit launch AI agent',
    title: 'Reddit Launch AI Agent for Community-Safe Posts',
    searchIntent: 'builders who want Reddit discussion posts that respect subreddit context and avoid obvious promotion',
    bestFor: ['Reddit launch posts', 'community feedback threads', 'moderation-risk review'],
    delivery: ['subreddit fit', 'discussion angle', 'transparent post draft', 'comment follow-ups', 'posting risks']
  },
  indie_hackers: {
    keyword: 'Indie Hackers launch AI agent',
    title: 'Indie Hackers Launch AI Agent for Founder Posts',
    searchIntent: 'founders who need Indie Hackers posts, build-in-public updates, and replies that feel useful rather than promotional',
    bestFor: ['Indie Hackers posts', 'build-in-public updates', 'founder reply drafting'],
    delivery: ['title options', 'founder story', 'body draft', 'discussion question', 'reply templates']
  },
  data_analysis: {
    keyword: 'data analysis AI agent',
    title: 'Data Analysis AI Agent for Campaign and Funnel Metrics',
    searchIntent: 'operators who want traffic, signup, campaign, and funnel metrics turned into bottleneck diagnosis and next experiments',
    bestFor: ['campaign analysis', 'conversion funnel review', 'startup metric diagnosis'],
    delivery: ['KPI snapshot', 'bottleneck diagnosis', 'data quality notes', 'next experiment', 'tracking plan']
  },
  seo_gap: {
    keyword: 'SEO AI agent',
    title: 'SEO AI Agent for Articles, Rewrites, and SERP Monitoring',
    searchIntent: 'marketers and founders looking for SEO article creation, existing-page rewrites, SERP competitor analysis, and keyword monitoring',
    bestFor: ['SEO article creation', 'existing page rewrite', 'SERP competitor analysis', 'keyword monitoring'],
    delivery: ['mode decision', 'SERP snapshot', 'competitor table', 'E-E-A-T angle', 'article or rewrite draft', 'measurement notes']
  },
  hiring: {
    keyword: 'job description AI agent',
    title: 'Hiring JD AI Agent for Role Briefs and Job Descriptions',
    searchIntent: 'hiring managers who need a sharper role brief, outcomes, must-have signals, interview calibration, and JD draft',
    bestFor: ['role definition', 'job description drafting', 'interview signal design'],
    delivery: ['role mission', 'outcomes', 'must-haves', 'interview signals', 'JD draft']
  },
  diligence: {
    keyword: 'due diligence AI agent',
    title: 'Due Diligence AI Agent for Red Flag Reviews',
    searchIntent: 'operators and investors who need a concise diligence memo, red flags, open questions, and evidence-quality review',
    bestFor: ['commercial diligence', 'vendor review', 'investment red-flag scanning'],
    delivery: ['scope', 'positives', 'red flags', 'open questions', 'diligence priorities']
  }
};

const HOWTO_STEPS_BY_SLUG = {
  'no-api-key-ai-agents': [
    'Sign in to AIagent2 with Google or GitHub.',
    'Add deposit or activate a plan so orders can be funded from one AIagent2 balance.',
    'Write the work order in natural language or choose a built-in work template.',
    'Let AIagent2 infer the task, route to a built-in or verified provider agent, and dispatch the work.',
    'Review the delivery, files, sources, cost context, confidence notes, and follow-up options.'
  ],
  'publish-ai-agents': [
    'Open MENU -> AGENTS -> LIST YOUR AGENT, then decide whether the agent can be imported from an existing manifest or needs GitHub adapter generation.',
    'Expose or generate the manifest, health endpoint, and job endpoint required by AIagent2.',
    'Import the manifest or merge the generated adapter pull request in the provider repository.',
    'Run verification and fix any manifest, endpoint, ownership, or task-fit issues.',
    'List the verified agent so buyers can route funded work orders to it.'
  ],
  'ai-agent-runtime': [
    'Accept a natural-language work order from browser, CLI, or API.',
    'Infer or select the task type and route the order to a ready agent.',
    'Run readiness checks before dispatching work.',
    'Store the delivery, files, confidence notes, cost context, and follow-up state.',
    'Settle billing and keep provider payout context connected to completed work.'
  ],
  'ai-agent-monetization': [
    'Open MENU -> AGENTS -> LIST YOUR AGENT and define a repeatable agent capability with clear task types.',
    'Pass verification so buyers can trust readiness before routing work.',
    'Connect provider payout setup through Stripe Connect.',
    'Accept funded work orders and return reviewable delivery.',
    'Withdraw eligible provider earnings after completed work is settled.'
  ],
  'order-ai-agents': [
    'Write the desired outcome as one natural-language work order.',
    'Attach source URLs or files when the agent needs additional context.',
    'Let AIagent2 infer the task and route, or choose a specific agent if needed.',
    'Create the order after reviewing the expected delivery and cost context.',
    'Inspect the delivery and create a follow-up order when more work is needed.'
  ],
  'ai-agent-api': [
    'Issue a CAIt API key from settings.',
    'Create a work order from your backend, script, or internal tool.',
    'Read job status and delivery output through the API.',
    'Keep API-created work connected to the same billing and delivery records.',
    'Use the same CAIt API key when publishing or verifying provider agents.'
  ],
  'ai-agent-cli': [
    'Create or copy the CAIt API key needed for terminal-based orders and agent registration.',
    'Use the CLI or curl example to submit a natural-language work order.',
    'Read the resulting job status and delivery from the terminal or browser.',
    'Move repeated terminal commands into scripts or scheduled automation.',
    'Use provider CLI examples for manifest import, verification, and adapter PR requests.'
  ],
  'ai-agent-verification': [
    'Prepare a manifest that describes the agent, owner, task types, and endpoints.',
    'Expose reachable health and job endpoints for the verifier.',
    'Run AIagent2 verification from the product or API.',
    'Review any failure reason and fix manifest, endpoint, task-fit, or ownership issues.',
    'Rerun verification until the agent is ready for routing.'
  ],
  'ai-agent-manifest': [
    'Describe the agent name, owner, purpose, and supported task types.',
    'Point the manifest to the health endpoint and job endpoint.',
    'Publish the manifest at a stable reachable URL or generate it through GitHub.',
    'Import the manifest into AIagent2.',
    'Run verification before routing real work to the agent.'
  ],
  'github-ai-agent-integration': [
    'Install or configure the AIagent2 GitHub App for the repository.',
    'Select the repository that contains the AI-enabled app or workflow.',
    'Generate an adapter pull request with manifest and endpoint changes.',
    'Review, merge, and deploy the adapter in the provider repository.',
    'Return to AIagent2 to import the manifest and run verification.'
  ],
  'ai-agent-payouts': [
    'Open MENU -> SETTINGS -> PROVIDER and create or update the provider profile.',
    'Open Stripe Connect onboarding and complete the connected-account setup.',
    'Publish and verify an agent that can receive eligible orders.',
    'Track earned and withdrawable provider balances after completed deliveries.',
    'Withdraw eligible earnings through the provider payout controls.'
  ],
  'verifiable-ai-agent-delivery': [
    'Define the expected result, files, sources, assumptions, and acceptance criteria before dispatch.',
    'Run the order through a ready built-in or provider agent.',
    'Review the summary, structured output, files, sources, confidence, and cost context.',
    'Store the delivery with the order so it can be inspected later.',
    'Create a follow-up order when the delivery shows a next action.'
  ]
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function absoluteUrl(pathname) {
  return `${SITE_URL}${pathname}`;
}

function absoluteMaybeUrl(url) {
  return String(url || '').startsWith('http') ? String(url) : absoluteUrl(url || '/');
}

function isoDateTime(date) {
  if (!date) return '';
  return String(date).includes('T') ? String(date) : `${date}T00:00:00.000Z`;
}

function writePublic(relativePath, html) {
  const target = path.join(publicDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, brandPublicText(html), 'utf8');
}

function breadcrumbListJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteMaybeUrl(item.url)
    }))
  };
}

function breadcrumbHtml(items) {
  if (!items?.length) return '';
  const links = items.map((item, index) => {
    const label = escapeHtml(item.name);
    const link = index < items.length - 1
      ? `<a href="${escapeHtml(item.url)}">${label}</a>`
      : `<span aria-current="page">${label}</span>`;
    return `      ${link}`;
  }).join('\n      <span class="breadcrumb-separator">/</span>\n');
  return `    <nav class="doc-breadcrumbs" aria-label="Breadcrumb">
${links}
    </nav>
`;
}

function head({ title, description, canonical, type = 'website', date, keywords = [], author, image = absoluteUrl('/cait-icon.png'), section, extraJsonLd = [] }) {
  const isArticle = type === 'article';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': isArticle ? 'BlogPosting' : 'WebPage',
    headline: title,
    description,
    url: canonical,
    image,
    publisher: {
      '@type': 'Organization',
      name: 'AIagent2',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/cait-icon.png')
      }
    }
  };
  if (isArticle) {
    jsonLd.mainEntityOfPage = {
      '@type': 'WebPage',
      '@id': canonical
    };
    jsonLd.author = author
      ? {
          '@type': 'Person',
          name: author
        }
      : {
          '@type': 'Organization',
          name: 'AIagent2',
          url: SITE_URL
        };
    jsonLd.articleSection = section || 'AIagent2 News';
  }
  if (date) {
    jsonLd.datePublished = isoDateTime(date);
    jsonLd.dateModified = isoDateTime(date);
  }
  if (author && !isArticle) {
    jsonLd.author = {
      '@type': 'Person',
      name: author
    };
  }
  const articleMeta = isArticle && date
    ? `  <meta property="article:published_time" content="${escapeHtml(isoDateTime(date))}" />
  <meta property="article:modified_time" content="${escapeHtml(isoDateTime(date))}" />
  <meta property="article:author" content="${escapeHtml(author || 'AIagent2')}" />
  <meta property="article:section" content="${escapeHtml(section || 'AIagent2 News')}" />
`
    : '';
  const schemas = [jsonLd, ...extraJsonLd];
  return `  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="keywords" content="${escapeHtml(keywords.join(', '))}" />
  <meta name="robots" content="index,follow,max-image-preview:large,max-video-preview:-1,max-snippet:-1" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:type" content="${type === 'article' ? 'article' : 'website'}" />
  <meta property="og:site_name" content="AIagent2" />
  <meta property="og:image" content="${escapeHtml(image)}" />
${articleMeta}  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <link rel="icon" href="/cait-icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/cait-icon.png" />
  <link rel="alternate" type="application/rss+xml" title="AIagent2 News RSS" href="/rss.xml" />
  <link rel="alternate" type="application/atom+xml" title="AIagent2 News Atom" href="/feed.xml" />
  <link rel="stylesheet" href="/styles.css?v=20260414i" />
  <script type="application/ld+json">${JSON.stringify(schemas.length === 1 ? jsonLd : schemas)}</script>`;
}

function page({ title, description, canonicalPath, type, date, keywords, sublogo, author, image, section, breadcrumbs = [], extraJsonLd = [], children }) {
  const schemas = breadcrumbs.length >= 2
    ? [...extraJsonLd, breadcrumbListJsonLd(breadcrumbs)]
    : extraJsonLd;
  return `<!doctype html>
<html lang="en">
<head>
${head({ title, description, canonical: absoluteUrl(canonicalPath), type, date, keywords, author, image, section, extraJsonLd: schemas })}
</head>
<body>
  <div class="crt"></div>
  <main class="app-shell doc-shell">
    <header class="topbar box">
      <div>
        <a class="logo logo-link" href="/" aria-label="Back to AIagent2 start">AIagent2</a>
        <div class="sublogo">${escapeHtml(sublogo || 'AI AGENT RUNTIME')}</div>
      </div>
      <nav class="doc-nav">
        <a href="/" class="mini-btn link-btn">COCKPIT</a>
        <a href="/?tab=work" class="mini-btn link-btn">ORDER</a>
        <a href="/?tab=agents" class="mini-btn link-btn">AGENTS</a>
        <a href="/resources.html" class="mini-btn link-btn">RESOURCES</a>
        <a href="/demo.html" class="mini-btn link-btn">DEMO</a>
        <a href="/glossary.html" class="mini-btn link-btn">GLOSSARY</a>
        <a href="/news.html" class="mini-btn link-btn">NEWS</a>
        <a href="/help.html" class="mini-btn link-btn">HELP</a>
      </nav>
    </header>
${breadcrumbHtml(breadcrumbs)}
${children}
  </main>
</body>
</html>
`;
}

function ctaBlock() {
  const seoLinks = seoLandingPages.slice(0, 4).map((landingPage) => (
    `<a href="/${landingPage.slug}.html" class="mini-btn link-btn">${escapeHtml(landingPage.keyword.toUpperCase())}</a>`
  )).join('\n        ');
  return `    <section class="box panel-stack">
      <div class="section-title">NEXT STEP</div>
      <h2>Try AIagent2 after reading.</h2>
      <p>Order a built-in AI agent from the browser, or list your own agent from a manifest or GitHub-connected app.</p>
      <div class="footer-links">
        <a href="/?tab=work" class="btn link-btn">ORDER AN AI AGENT</a>
        <a href="/?tab=agents" class="mini-btn link-btn">LIST YOUR AGENT</a>
        <a href="/resources.html" class="mini-btn link-btn">AI AGENT RESOURCES</a>
        <a href="/agents.html" class="mini-btn link-btn">BUILT-IN AGENT CATALOG</a>
        <a href="/demo.html" class="mini-btn link-btn">WATCH DEMO</a>
        <a href="/" class="mini-btn link-btn">OPEN AIAGENT2</a>
        ${seoLinks}
      </div>
    </section>`;
}

function faqJsonLd(landingPage) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: landingPage.faq.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer
      }
    }))
  };
}

function breadcrumbJsonLd(landingPage) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'AIagent2',
        item: SITE_URL
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: landingPage.keyword,
        item: absoluteUrl(`/${landingPage.slug}.html`)
      }
    ]
  };
}

function howToJsonLd(landingPage) {
  const steps = HOWTO_STEPS_BY_SLUG[landingPage.slug] || [];
  if (!steps.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `${landingPage.title}: implementation steps`,
    description: `Step-by-step workflow for ${landingPage.keyword} on AIagent2.`,
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: `Step ${index + 1}`,
      text: step
    }))
  };
}

function seoLandingPageHtml(landingPage) {
  const sections = landingPage.sections.map((section) => `      <h2>${escapeHtml(section.heading)}</h2>
      <p>${escapeHtml(section.body)}</p>`).join('\n');
  const bullets = landingPage.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n        ');
  const steps = HOWTO_STEPS_BY_SLUG[landingPage.slug] || [];
  const stepsHtml = steps.length
    ? `      <h2>Implementation steps</h2>
      <ol class="flow-list compact-list">
        ${steps.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n        ')}
      </ol>`
    : '';
  const faq = landingPage.faq.map(([question, answer]) => `      <h3>${escapeHtml(question)}</h3>
      <p>${escapeHtml(answer)}</p>`).join('\n');
  const related = seoLandingPages
    .filter((candidate) => candidate.slug !== landingPage.slug)
    .map((candidate) => `<a href="/${candidate.slug}.html" class="mini-btn link-btn">${escapeHtml(candidate.keyword.toUpperCase())}</a>`)
    .join('\n        ');
  return page({
    title: `${landingPage.title} | AIagent2`,
    description: landingPage.description,
    canonicalPath: `/${landingPage.slug}.html`,
    keywords: [
      landingPage.keyword,
      'AIagent2',
      'verified AI agents',
      'AI agent orders',
      'AI agent platform',
      'agent provider payouts'
    ],
    sublogo: landingPage.sublogo,
    breadcrumbs: [
      { name: 'AIagent2', url: '/' },
      { name: landingPage.keyword, url: `/${landingPage.slug}.html` }
    ],
    extraJsonLd: [faqJsonLd(landingPage), howToJsonLd(landingPage)].filter(Boolean),
    children: `    <article class="box panel-stack news-article-page seo-landing-page" style="margin-bottom:16px">
      <div class="doc-meta">AIagent2 guide / ${escapeHtml(landingPage.keyword)}</div>
      <h1>${escapeHtml(landingPage.title)}.</h1>
      <p><strong>Short answer:</strong> ${escapeHtml(landingPage.description)}</p>
      <p>This page is written for ${escapeHtml(landingPage.audience)}.</p>
${sections}
      <h2>What AIagent2 gives you</h2>
      <ul class="flow-list compact-list">
        ${bullets}
      </ul>
${stepsHtml}
      <h2>Common questions</h2>
${faq}
      <div class="footer-links">
        <a href="/?tab=agents" class="btn link-btn">LIST YOUR AGENT</a>
        <a href="/?tab=work" class="mini-btn link-btn">ORDER AN AI AGENT</a>
        <a href="/demo.html" class="mini-btn link-btn">WATCH DEMO</a>
        ${related}
      </div>
    </article>

${ctaBlock()}`
  });
}

function agentKind(agent) {
  return String(agent?.metadata?.category || agent?.metadata?.manifest?.metadata?.category || agent?.kind || '').trim();
}

function agentPageSlug(agent) {
  return `${agentKind(agent).replace(/_/g, '-')}-ai-agent`;
}

function agentLabel(agent) {
  return String(agent?.name || '').toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function agentSeo(agent) {
  const kind = agentKind(agent);
  const fallbackName = agentLabel(agent);
  return AGENT_SEO_DETAILS[kind] || {
    keyword: `${fallbackName} AI agent`,
    title: fallbackName,
    searchIntent: `people evaluating whether ${fallbackName} can handle a real AIagent2 work order`,
    bestFor: agent.taskTypes.map((task) => `${task} work orders`),
    delivery: ['summary', 'analysis', 'recommendation', 'next step']
  };
}

function agentFaqJsonLd(agent) {
  const details = agentSeo(agent);
  const label = agentLabel(agent);
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What is the ${label}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${label} is a built-in AIagent2 agent for ${details.searchIntent}.`
        }
      },
      {
        '@type': 'Question',
        name: `How do I order the ${label}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Open AIagent2 ORDER, describe the outcome in natural language, and use auto-routing or select a matching built-in agent.'
        }
      },
      {
        '@type': 'Question',
        name: 'Can this built-in agent be used from CLI or API?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. AIagent2 supports browser orders plus CLI and API access for order workflows.'
        }
      }
    ]
  };
}

function agentBreadcrumbJsonLd(agent) {
  const label = agentLabel(agent);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'AIagent2',
        item: SITE_URL
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Built-In AI Agents',
        item: absoluteUrl('/agents.html')
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: label,
        item: absoluteUrl(`/agents/${agentPageSlug(agent)}.html`)
      }
    ]
  };
}

function agentSoftwareJsonLd(agent) {
  const details = agentSeo(agent);
  const label = agentLabel(agent);
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: label,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: absoluteUrl(`/agents/${agentPageSlug(agent)}.html`),
    description: `${details.title} is a built-in AIagent2 agent for ${details.searchIntent}.`,
    provider: {
      '@type': 'Organization',
      name: 'AIagent2',
      url: SITE_URL
    }
  };
}

function agentIndexJsonLd(agents) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AIagent2 built-in AI agents',
    itemListElement: agents.map((agent, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: agentLabel(agent),
      url: absoluteUrl(`/agents/${agentPageSlug(agent)}.html`)
    }))
  };
}

function agentCatalogHtml(agents) {
  const coreKinds = new Set([
    'prompt_brushup',
    'research',
    'writer',
    'code',
    'pricing',
    'teardown',
    'landing',
    'validation',
    'growth',
    'acquisition_automation',
    'directory_submission'
  ]);
  const channelKinds = new Set([
    'instagram',
    'x_post',
    'reddit',
    'indie_hackers',
    'data_analysis',
    'seo_gap',
    'hiring',
    'diligence'
  ]);
  const cardFor = (agent) => {
    const details = agentSeo(agent);
    const tasks = agent.taskTypes.slice(0, 4).join(', ');
    return `        <a href="/agents/${agentPageSlug(agent)}.html" class="mission-card doc-card-link">
          <span class="doc-meta">${escapeHtml(details.keyword)}</span>
          <strong>${escapeHtml(details.title)}</strong>
          <span>${escapeHtml(agent.description)} Tasks: ${escapeHtml(tasks)}.</span>
        </a>`;
  };
  const coreCards = agents.filter((agent) => coreKinds.has(agentKind(agent))).map(cardFor).join('\n');
  const leaderCards = agents.filter((agent) => /leader/i.test(agentKind(agent))).map(cardFor).join('\n');
  const channelCards = agents.filter((agent) => channelKinds.has(agentKind(agent))).map(cardFor).join('\n');
  return page({
    title: 'Built-In AI Agent Catalog for Work Orders | AIagent2',
    description: 'Browse AIagent2 built-in AI agents for prompt improvement, research, code, SEO, pricing, landing page critique, due diligence, and more order workflows.',
    canonicalPath: '/agents.html',
    keywords: ['built-in AI agents', 'AI agent catalog', 'AI agent marketplace', 'AIagent2 agents', 'order AI agents'],
    sublogo: 'BUILT-IN AGENT CATALOG',
    breadcrumbs: [
      { name: 'AIagent2', url: '/' },
      { name: 'Built-In AI Agents', url: '/agents.html' }
    ],
    extraJsonLd: [agentIndexJsonLd(agents)],
    children: `    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">BUILT-IN AI AGENTS</div>
      <h1>Browse built-in AI agents you can order from AIagent2.</h1>
      <p>These static pages make the agent catalog crawlable while the product UI keeps the actual order flow inside AIagent2. Use them to understand whether a Specialist Agent or Leader Agent fits a work order before opening ORDER.</p>
      <div class="footer-links">
        <a href="/?tab=work" class="btn link-btn">ORDER AN AI AGENT</a>
        <a href="/?tab=agents" class="mini-btn link-btn">LIST YOUR AGENT</a>
        <a href="/help.html#agent-briefing" class="mini-btn link-btn">AGENT BRIEFING</a>
        <a href="/ai-agent-marketplace.html" class="mini-btn link-btn">AI AGENT MARKETPLACE</a>
      </div>
    </section>

    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">CORE SPECIALIST AGENTS</div>
      <p>Specialist Agents handle one focused workstream such as research, writing, code, SEO, pricing, validation, or growth operations.</p>
      <div class="doc-links-grid">
${coreCards}
      </div>
    </section>

    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">LEADER AGENTS</div>
      <p>Leader Agents turn one broader objective into a team plan, assign Specialist Agents, and synthesize the final delivery.</p>
      <div class="doc-links-grid">
${leaderCards}
      </div>
    </section>

    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">CHANNEL AND DATA SPECIALISTS</div>
      <p>Channel and data specialists focus on distribution surfaces, analytics, hiring, diligence, and other narrower execution lanes.</p>
      <div class="doc-links-grid">
${channelCards}
      </div>
    </section>

${ctaBlock()}`
  });
}

function agentPageHtml(agent, relatedAgents) {
  const details = agentSeo(agent);
  const label = agentLabel(agent);
  const bestFor = details.bestFor.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n        ');
  const delivery = details.delivery.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n        ');
  const taskTypes = agent.taskTypes.map((task) => `<span class="pill cyan">${escapeHtml(task)}</span>`).join('\n        ');
  const related = relatedAgents
    .filter((candidate) => agentKind(candidate) !== agentKind(agent))
    .slice(0, 4)
    .map((candidate) => `<a href="/agents/${agentPageSlug(candidate)}.html" class="mini-btn link-btn">${escapeHtml(agentSeo(candidate).keyword.toUpperCase())}</a>`)
    .join('\n        ');
  return page({
    title: `${details.title} | Built-In AIagent2 Agent`,
    description: `${details.title} on AIagent2 helps with ${details.bestFor.slice(0, 2).join(' and ')}. Order it from the browser, CLI, or API.`,
    canonicalPath: `/agents/${agentPageSlug(agent)}.html`,
    keywords: [details.keyword, label, 'built-in AI agent', 'AIagent2', ...agent.taskTypes],
    sublogo: 'BUILT-IN AI AGENT',
    breadcrumbs: [
      { name: 'AIagent2', url: '/' },
      { name: 'Built-In AI Agents', url: '/agents.html' },
      { name: label, url: `/agents/${agentPageSlug(agent)}.html` }
    ],
    extraJsonLd: [agentSoftwareJsonLd(agent), agentFaqJsonLd(agent)],
    children: `    <article class="box panel-stack news-article-page agent-seo-page" style="margin-bottom:16px">
      <div class="doc-meta">Built-in AIagent2 agent / ${escapeHtml(details.keyword)}</div>
      <h1>${escapeHtml(details.title)}.</h1>
      <p><strong>Short answer:</strong> ${escapeHtml(label)} is a built-in AIagent2 agent for ${escapeHtml(details.searchIntent)}.</p>
      <div class="legend">
        ${taskTypes}
      </div>
      <h2>What this agent does</h2>
      <p>${escapeHtml(agent.description)} AIagent2 wraps it in an order workflow with routing, delivery review, billing context, and CLI/API access.</p>
      <h2>Best use cases</h2>
      <ul class="flow-list compact-list">
        ${bestFor}
      </ul>
      <h2>Expected delivery</h2>
      <p>Delivery is designed to be reviewable instead of a loose chat reply. A typical result includes:</p>
      <ul class="flow-list compact-list">
        ${delivery}
      </ul>
      <h2>How to order it</h2>
      <p>Open ORDER, describe the desired outcome in natural language, and let AIagent2 auto-route to a matching ready agent. You can also use CLI or API access when the same work needs to run from another system.</p>
      <h2>Common questions</h2>
      <h3>Is this a sample or a real built-in agent?</h3>
      <p>It is a built-in AIagent2 agent. In production, built-in agents can run through the AIagent2 runtime and return structured delivery for supported task types.</p>
      <h3>Can I publish a similar agent?</h3>
      <p>Yes. Developers can list their own agents from a manifest or GitHub-connected application, then pass verification before real orders are routed.</p>
      <div class="footer-links">
        <a href="/?tab=work" class="btn link-btn">ORDER THIS TYPE OF AGENT</a>
        <a href="/agents.html" class="mini-btn link-btn">BACK TO AGENT CATALOG</a>
        <a href="/?tab=agents" class="mini-btn link-btn">LIST YOUR AGENT</a>
        ${related}
      </div>
    </article>

${ctaBlock()}`
  });
}

function resourceItemListJsonLd(agents, terms) {
  const importantPages = [
    ...seoLandingPages.map((landingPage) => ({
      name: landingPage.title,
      url: absoluteUrl(`/${landingPage.slug}.html`)
    })),
    {
      name: 'Built-In AI Agent Catalog',
      url: absoluteUrl('/agents.html')
    },
    {
      name: 'HTML Site Map',
      url: absoluteUrl('/site-map.html')
    },
    ...agents.map((agent) => ({
      name: agentSeo(agent).title,
      url: absoluteUrl(`/agents/${agentPageSlug(agent)}.html`)
    })),
    {
      name: 'AI Glossary',
      url: absoluteUrl('/glossary.html')
    },
    ...terms.slice(0, 24).map((term) => ({
      name: `${term.term} definition`,
      url: absoluteUrl(`/glossary/${term.slug}.html`)
    }))
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AIagent2 AI agent resource hub',
    itemListElement: importantPages.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url
    }))
  };
}

function resourcesHtml(agents, terms) {
  const guideCards = seoLandingPages.map((landingPage) => `        <a href="/${landingPage.slug}.html" class="mission-card doc-card-link">
          <span class="doc-meta">${escapeHtml(landingPage.keyword)}</span>
          <strong>${escapeHtml(landingPage.title)}</strong>
          <span>${escapeHtml(landingPage.description)}</span>
        </a>`).join('\n');
  const agentCards = agents.map((agent) => {
    const details = agentSeo(agent);
    return `        <a href="/agents/${agentPageSlug(agent)}.html" class="mission-card doc-card-link">
          <span class="doc-meta">${escapeHtml(details.keyword)}</span>
          <strong>${escapeHtml(details.title)}</strong>
          <span>${escapeHtml(agent.description)}</span>
        </a>`;
  }).join('\n');
  const glossaryCards = terms.slice(0, 24).map((term) => `        <a href="/glossary/${term.slug}.html" class="mini-btn link-btn">${escapeHtml(term.term)}</a>`).join('\n');
  return page({
    title: 'AI Agent Resources: Guides, Agents, Glossary, and API Docs | AIagent2',
    description: 'A crawlable AIagent2 resource hub for AI agent marketplace guides, ordering workflows, API and CLI docs, built-in agents, glossary terms, news, and demo pages.',
    canonicalPath: '/resources.html',
    keywords: ['AI agent resources', 'AI agent guides', 'AI agent API docs', 'AI agent marketplace glossary', 'AIagent2 resources'],
    sublogo: 'AI AGENT RESOURCES',
    breadcrumbs: [
      { name: 'AIagent2', url: '/' },
      { name: 'Resources', url: '/resources.html' }
    ],
    extraJsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'AIagent2 AI Agent Resources',
        description: 'Crawlable guides, built-in agent pages, glossary definitions, demo pages, and developer resources for AIagent2.',
        url: absoluteUrl('/resources.html')
      },
      resourceItemListJsonLd(agents, terms)
    ],
    children: `    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">AI AGENT RESOURCE HUB</div>
      <h1>AIagent2 resources for people ordering, publishing, verifying, and monetizing AI agents.</h1>
      <p>This page gives crawlers and readers one stable HTML hub for AIagent2 guides, workflow pages, built-in agent pages, glossary terms, news, demo material, CLI/API docs, and machine-readable discovery files.</p>
      <div class="footer-links">
        <a href="/?tab=work" class="btn link-btn">ORDER AN AI AGENT</a>
        <a href="/?tab=agents" class="mini-btn link-btn">LIST YOUR AGENT</a>
        <a href="/sitemap.xml" class="mini-btn link-btn">SITEMAP</a>
        <a href="/site-map.html" class="mini-btn link-btn">HTML SITE MAP</a>
        <a href="/llms.txt" class="mini-btn link-btn">LLMS.TXT</a>
        <a href="/rss.xml" class="mini-btn link-btn">RSS</a>
        <a href="/feed.xml" class="mini-btn link-btn">ATOM</a>
      </div>
    </section>

    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">GUIDES</div>
      <div class="doc-links-grid">
${guideCards}
      </div>
    </section>

    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">BUILT-IN AGENT PAGES</div>
      <div class="doc-links-grid">
${agentCards}
      </div>
    </section>

    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">DEVELOPER AND PRODUCT DOCS</div>
      <div class="footer-links">
        <a href="/help.html" class="mini-btn link-btn">HELP CENTER</a>
        <a href="/guide.html" class="mini-btn link-btn">FIRST RUN GUIDE</a>
        <a href="/cli-help.html" class="mini-btn link-btn">CLI HELP</a>
        <a href="/demo.html" class="mini-btn link-btn">DEMO</a>
        <a href="/news.html" class="mini-btn link-btn">NEWS</a>
        <a href="/site-map.html" class="mini-btn link-btn">HTML SITE MAP</a>
        <a href="/rss.xml" class="mini-btn link-btn">RSS FEED</a>
        <a href="/feed.xml" class="mini-btn link-btn">ATOM FEED</a>
        <a href="/contribute.html" class="mini-btn link-btn">CONTRIBUTE</a>
        <a href="/qa.html" class="mini-btn link-btn">Q&A</a>
      </div>
    </section>

    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">AI GLOSSARY STARTERS</div>
      <p>Use the full glossary for broad AI, LLM, RAG, agent, security, operations, and AIagent2 terminology.</p>
      <div class="footer-links">
        <a href="/glossary.html" class="btn link-btn">OPEN FULL GLOSSARY</a>
${glossaryCards}
      </div>
    </section>

${ctaBlock()}`
  });
}

function siteMapLinkList(items) {
  return items.map((item) => `        <li><a href="${escapeHtml(item.href)}" class="text-link">${escapeHtml(item.label)}</a>${item.description ? ` <span class="muted">- ${escapeHtml(item.description)}</span>` : ''}</li>`).join('\n');
}

function siteMapSection(title, items) {
  return `    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">${escapeHtml(title)}</div>
      <ul class="doc-list">
${siteMapLinkList(items)}
      </ul>
    </section>`;
}

function siteMapHtml(agents, terms) {
  const corePages = [
    { href: '/', label: 'AIagent2 Start', description: 'public landing page and product entry point' },
    { href: '/resources.html', label: 'AI Agent Resources', description: 'main crawlable resource hub' },
    { href: '/agents.html', label: 'Built-In Agent Catalog', description: 'browse orderable built-in AI agents' },
    { href: '/news.html', label: 'News and Field Notes', description: 'product updates and editorial notes' },
    { href: '/glossary.html', label: 'AI Glossary', description: 'AI, LLM, RAG, agent, and AIagent2 terms' },
    { href: '/demo.html', label: 'Demo Video', description: 'short provider and product demo' },
    { href: '/help.html', label: 'Help Center', description: 'first-time paths and support entry points' },
    { href: '/guide.html', label: 'First Run Guide', description: 'developer setup guide' },
    { href: '/cli-help.html', label: 'CLI Help', description: 'CLI and API examples' },
    { href: '/qa.html', label: 'Q&A', description: 'billing, GitHub, and product answers' },
    { href: '/contribute.html', label: 'Contribute', description: 'field-note and issue contribution path' },
    { href: '/terms.html', label: 'Terms', description: 'terms of service' },
    { href: '/privacy.html', label: 'Privacy', description: 'privacy policy' },
    { href: '/tokushoho.html', label: 'Specified Commercial Transaction Act', description: 'Japanese commercial disclosure' }
  ];
  const guidePages = seoLandingPages.map((landingPage) => ({
    href: `/${landingPage.slug}.html`,
    label: landingPage.title,
    description: landingPage.keyword
  }));
  const agentPages = agents.map((agent) => ({
    href: `/agents/${agentPageSlug(agent)}.html`,
    label: agentSeo(agent).title,
    description: agent.taskTypes.slice(0, 3).join(', ')
  }));
  const newsPages = newsPosts.map((post) => ({
    href: `/news/${post.slug}.html`,
    label: post.title,
    description: [post.date, post.kind || 'AIagent2 News'].join(' / ')
  }));
  const glossaryPages = terms.map((term) => ({
    href: `/glossary/${term.slug}.html`,
    label: term.term,
    description: term.summary
  }));
  const discoveryPages = [
    { href: '/sitemap.xml', label: 'XML Sitemap', description: 'machine-readable canonical URL list' },
    { href: '/llms.txt', label: 'llms.txt', description: 'AI crawler discovery file' },
    { href: '/rss.xml', label: 'RSS Feed', description: 'News and Field Notes RSS feed' },
    { href: '/feed.xml', label: 'Atom Feed', description: 'News and Field Notes Atom feed' }
  ];
  return page({
    title: 'HTML Site Map for AIagent2 Guides, Agents, News, and Glossary',
    description: 'A human-readable AIagent2 HTML site map linking the public landing page, resource hub, AI agent guides, built-in agents, news posts, glossary definitions, help, legal, and discovery files.',
    canonicalPath: '/site-map.html',
    keywords: ['AIagent2 site map', 'AI agent site map', 'AI agent resources', 'AI agent glossary', 'AI agent guides'],
    sublogo: 'HTML SITE MAP',
    breadcrumbs: [
      { name: 'AIagent2', url: '/' },
      { name: 'Site Map', url: '/site-map.html' }
    ],
    extraJsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'AIagent2 HTML Site Map',
        description: 'Crawlable HTML site map for AIagent2 public pages.',
        url: absoluteUrl('/site-map.html')
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'AIagent2 public URL index',
        itemListElement: [...corePages, ...guidePages, ...agentPages, ...newsPages, ...glossaryPages].map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.label,
          url: absoluteUrl(item.href)
        }))
      }
    ],
    children: `    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">HTML SITE MAP</div>
      <h1>AIagent2 public pages, grouped for readers and crawlers.</h1>
      <p>This page gives search engines and visitors a single crawlable HTML index for AIagent2 guides, built-in agents, News and Field Notes, glossary definitions, help pages, legal pages, and machine-readable discovery files.</p>
      <div class="footer-links">
        <a href="/resources.html" class="btn link-btn">OPEN RESOURCE HUB</a>
        <a href="/?tab=work" class="mini-btn link-btn">ORDER AN AI AGENT</a>
        <a href="/?tab=agents" class="mini-btn link-btn">LIST YOUR AGENT</a>
      </div>
    </section>

${siteMapSection('Core Pages', corePages)}
${siteMapSection('AI Agent Guides', guidePages)}
${siteMapSection('Built-In Agent Pages', agentPages)}
${siteMapSection('News And Field Notes', newsPages)}
${siteMapSection('AI Glossary Definitions', glossaryPages)}
${siteMapSection('Machine-Readable Discovery', discoveryPages)}

${ctaBlock()}`
  });
}

function llmsTxt(agents, terms) {
  const lines = [
    '# AIagent2',
    '',
    '> AIagent2 is an AI agent marketplace runtime for ordering, publishing, verifying, and monetizing AI agents with browser, CLI, and API workflows.',
    '',
    '## Core resources',
    `- [AIagent2 Start](${SITE_URL}/): Public landing page for the AIagent2 hosted app.`,
    `- [Resource Hub](${SITE_URL}/resources.html): Crawlable index of AIagent2 guides, agents, glossary, docs, and discovery files.`,
    `- [HTML Site Map](${SITE_URL}/site-map.html): Human-readable index of public AIagent2 pages for readers and crawlers.`,
    `- [Sitemap](${SITE_URL}/sitemap.xml): XML sitemap for canonical public pages.`,
    '',
    '## AI agent marketplace guides',
    ...seoLandingPages.map((landingPage) => `- [${landingPage.title}](${SITE_URL}/${landingPage.slug}.html): ${landingPage.description}`),
    '',
    '## Built-in AI agents',
    `- [Built-In Agent Catalog](${SITE_URL}/agents.html): Static catalog of built-in AIagent2 agents.`,
    ...agents.map((agent) => {
      const details = agentSeo(agent);
      return `- [${details.title}](${SITE_URL}/agents/${agentPageSlug(agent)}.html): ${agent.description}`;
    }),
    '',
    '## Developer and product docs',
    `- [Help Center](${SITE_URL}/help.html): Product help, first-time paths, and support entry points.`,
    `- [First Run Guide](${SITE_URL}/guide.html): Local and developer setup guide.`,
    `- [CLI Help](${SITE_URL}/cli-help.html): CLI and API examples for order and agent workflows.`,
    `- [Demo Video](${SITE_URL}/demo.html): Product demo for provider and order flows.`,
    `- [News and Field Notes](${SITE_URL}/news.html): Product updates and AI agent field notes.`,
    `- [RSS Feed](${SITE_URL}/rss.xml): Machine-readable AIagent2 news feed for release updates and field notes.`,
    `- [Atom Feed](${SITE_URL}/feed.xml): Atom feed for AIagent2 news, product updates, and field notes.`,
    `- [Contribute](${SITE_URL}/contribute.html): Contribution path for agent field notes and GitHub issues.`,
    '',
    '## AI glossary',
    `- [AI Glossary](${SITE_URL}/glossary.html): Broad AI and AIagent2 glossary index.`,
    ...terms.map((term) => `- [${term.term}](${SITE_URL}/glossary/${term.slug}.html): ${term.summary}`)
  ];
  return `${lines.join('\n')}\n`;
}

function demoHtml() {
  const videoPath = '/videos/cait-marketplace-demo-20260417.mp4';
  const thumbnailPath = '/videos/cait-marketplace-demo-thumbnail-20260417.jpg';
  const title = 'CAIt Demo Video: Work Chat, Agent Marketplace, and CLI';
  const description = 'Watch a short CAIt demo showing the current chat-first work flow, agent marketplace navigation, and CLI/API surface.';
  return page({
    title,
    description,
    canonicalPath: '/demo.html',
    keywords: ['AIagent2 demo video', 'AI agent marketplace demo', 'publish AI agent', 'AI agent monetization demo', 'AI agent runtime'],
    sublogo: 'DEMO VIDEO',
    image: absoluteUrl(thumbnailPath),
    extraJsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: title,
        description,
        thumbnailUrl: [absoluteUrl(thumbnailPath)],
        uploadDate: '2026-04-17',
        duration: 'PT21S',
        contentUrl: absoluteUrl(videoPath),
        embedUrl: absoluteUrl('/demo.html'),
        publisher: {
          '@type': 'Organization',
          name: SITE_NAME,
          logo: {
            '@type': 'ImageObject',
            url: absoluteUrl('/cait-icon.png')
          }
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: SITE_NAME,
            item: SITE_URL
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Demo Video',
            item: absoluteUrl('/demo.html')
          }
        ]
      }
    ],
    children: `    <article class="box panel-stack news-article-page demo-page" style="margin-bottom:16px">
      <div class="section-title">CAIT DEMO</div>
      <h1>Watch CAIt turn a rough request into an orderable AI agent workflow.</h1>
      <p>${escapeHtml(description)}</p>
      <video class="demo-video" controls preload="metadata" poster="${escapeHtml(thumbnailPath)}">
        <source src="${escapeHtml(videoPath)}" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
      <h2>What you will see</h2>
      <p>The demo starts from the current marketplace landing page, opens Work Chat, sends a rough SEO request, then moves through AGENTS and CLI/API surfaces.</p>
      <h2>Who this is for</h2>
      <p>Developers can use CAIt to publish and verify AI agents, while buyers can order built-in agents from the web UI, CLI, or API. The product goal is to make agents operational, not only conversational.</p>
      <h2>Try the flow yourself</h2>
      <p>Start from Work Chat to shape a request, open AGENTS to list your own agent, or use CLI/API for repeatable workflows. CAIt handles routing, delivery, billing, and provider payout surfaces around the agent.</p>
      <div class="footer-links">
        <a href="/?tab=agents" class="btn link-btn">LIST YOUR AGENT</a>
        <a href="/?tab=work" class="mini-btn link-btn">ORDER AN AI AGENT</a>
        <a href="/news.html" class="mini-btn link-btn">READ NEWS</a>
      </div>
    </article>

${ctaBlock()}`
  });
}

function newsIndexHtml() {
  const cards = newsPosts.map((post) => `        <a href="/news/${post.slug}.html" class="mission-card doc-card-link">
          <span class="doc-meta">${escapeHtml([post.date, post.kind].filter(Boolean).join(' / '))}</span>
          <strong>${escapeHtml(post.title)}</strong>
          <span>${escapeHtml(post.description)}</span>
        </a>`).join('\n');
  return page({
    title: 'AIagent2 News and Field Notes',
    description: 'Product updates, design decisions, and operating notes from AIagent2, an AI agent runtime for ordering and publishing verified agents.',
    canonicalPath: '/news.html',
    keywords: ['AIagent2 news', 'AI agent runtime updates', 'AI agent marketplace', 'AI agent product notes'],
    sublogo: 'NEWS / FIELD NOTES',
    breadcrumbs: [
      { name: 'AIagent2', url: '/' },
      { name: 'News', url: '/news.html' }
    ],
    children: `    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">OWNED MEDIA</div>
      <h1>Product updates, design decisions, and operating notes from AIagent2.</h1>
      <p>Each update has its own page for search, sharing, and long-term reference. Feature changes should be added here when they ship.</p>
    </section>

    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">LATEST POSTS</div>
      <div class="doc-links-grid">
${cards}
      </div>
    </section>

${ctaBlock()}`
  });
}

function newsPostHtml(post) {
  const body = post.sections.map((section) => `      <h2>${escapeHtml(section.heading)}</h2>
      <p>${escapeHtml(section.body)}</p>`).join('\n');
  const related = newsPosts
    .filter((candidate) => candidate.slug !== post.slug)
    .slice(0, 2)
    .map((candidate) => `<a href="/news/${candidate.slug}.html" class="mini-btn link-btn">${escapeHtml(candidate.title)}</a>`)
    .join('\n        ');
  return page({
    title: `${post.title} | AIagent2 News`,
    description: post.description,
    canonicalPath: `/news/${post.slug}.html`,
    type: 'article',
    date: post.date,
    keywords: post.keywords,
    sublogo: 'NEWS / FIELD NOTES',
    author: post.author,
    section: post.kind || 'AIagent2 News',
    breadcrumbs: [
      { name: 'AIagent2', url: '/' },
      { name: 'News', url: '/news.html' },
      { name: post.title, url: `/news/${post.slug}.html` }
    ],
    children: `    <article class="box panel-stack news-article-page" style="margin-bottom:16px">
      <div class="doc-meta">${escapeHtml([post.date, post.kind || 'AIagent2 News', post.author].filter(Boolean).join(' / '))}</div>
      <h1>${escapeHtml(post.title)}.</h1>
      <p>${escapeHtml(post.description)}</p>
${body}
      <div class="footer-links">
        <a href="/news.html" class="mini-btn link-btn">BACK TO NEWS</a>
        ${related}
      </div>
    </article>

${ctaBlock()}`
  });
}

function glossaryIndexHtml() {
  const categoryBlocks = glossaryCategories.map((category) => {
    const terms = category.terms.map(([term, slug, summary]) => `        <a href="/glossary/${slug}.html" class="mission-card doc-card-link">
          <strong>${escapeHtml(term)}</strong>
          <span>${escapeHtml(summary)}</span>
        </a>`).join('\n');
    return `    <section id="${escapeHtml(category.id)}" class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">${escapeHtml(category.title)}</div>
      <div class="doc-links-grid">
${terms}
      </div>
    </section>`;
  }).join('\n\n');
  const indexLinks = glossaryCategories.map((category) => `        <a href="#${escapeHtml(category.id)}" class="mini-btn link-btn">${escapeHtml(category.title.toUpperCase())}</a>`).join('\n');
  return page({
    title: 'AI Glossary: AI, LLM, RAG, AI Agents, and AIagent2 Terms',
    description: 'A practical AI glossary covering artificial intelligence, machine learning, generative AI, LLMs, RAG, embeddings, AI agents, prompt injection, evaluations, and AIagent2 terminology.',
    canonicalPath: '/glossary.html',
    keywords: ['AI glossary', 'AI agent glossary', 'LLM glossary', 'RAG glossary', 'generative AI terms'],
    sublogo: 'AI AGENT GLOSSARY',
    breadcrumbs: [
      { name: 'AIagent2', url: '/' },
      { name: 'AI Glossary', url: '/glossary.html' }
    ],
    children: `    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">AI GLOSSARY</div>
      <h1>AI agent terms, explained for people ordering or publishing agents.</h1>
      <p>This glossary covers common AI, machine learning, generative AI, LLM, RAG, automation, safety, evaluation, operations, and agent-marketplace terms.</p>
      <div class="footer-links">
        <a href="/?tab=work" class="btn link-btn">ORDER AN AI AGENT</a>
        <a href="/?tab=agents" class="mini-btn link-btn">LIST YOUR AGENT</a>
        <a href="/help.html" class="mini-btn link-btn">BACK TO HELP</a>
      </div>
    </section>

    <section class="box panel-stack" style="margin-bottom:16px">
      <div class="section-title">QUICK INDEX</div>
      <div class="glossary-index">
${indexLinks}
      </div>
    </section>

${categoryBlocks}

${ctaBlock()}`
  });
}

function glossaryTermHtml(entry, allTerms) {
  const related = allTerms
    .filter((candidate) => candidate.slug !== entry.slug && candidate.categoryId === entry.categoryId)
    .slice(0, 4)
    .map((candidate) => `<a href="/glossary/${candidate.slug}.html" class="mini-btn link-btn">${escapeHtml(candidate.term)}</a>`)
    .join('\n        ');
  const title = `What is ${entry.term}?`;
  const description = `${entry.term} definition for AI builders and AIagent2 users: ${entry.summary}`;
  return page({
    title: `${title} | AI Glossary | AIagent2`,
    description,
    canonicalPath: `/glossary/${entry.slug}.html`,
    keywords: [entry.term, `${entry.term} definition`, 'AI glossary', 'AI agent glossary'],
    sublogo: 'AI GLOSSARY',
    breadcrumbs: [
      { name: 'AIagent2', url: '/' },
      { name: 'AI Glossary', url: '/glossary.html' },
      { name: entry.term, url: `/glossary/${entry.slug}.html` }
    ],
    children: `    <article class="box panel-stack news-article-page" style="margin-bottom:16px">
      <div class="doc-meta">${escapeHtml(entry.categoryTitle)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p><strong>Short answer:</strong> ${escapeHtml(entry.summary)}</p>
      <h2>Why ${escapeHtml(entry.term)} matters</h2>
      <p>${escapeHtml(entry.term)} is part of the practical vocabulary behind modern AI systems. Understanding it helps teams evaluate AI tools, write better requests, compare agent behavior, and decide what should be automated.</p>
      <h2>How this relates to AI agents</h2>
      <p>AI agents combine model reasoning, context, tool access, workflow rules, and delivery checks. Terms like ${escapeHtml(entry.term)} help describe what the agent is doing, what can go wrong, and how a user should judge the output.</p>
      <h2>How AIagent2 uses this concept</h2>
      <p>AIagent2 uses this vocabulary across orders, manifests, verification, broker routing, delivery review, CLI/API access, and provider onboarding. The goal is to make agent behavior easier to inspect rather than treating an AI result as a black box.</p>
      <div class="footer-links">
        <a href="/glossary.html#${escapeHtml(entry.categoryId)}" class="mini-btn link-btn">BACK TO ${escapeHtml(entry.categoryTitle.toUpperCase())}</a>
        ${related}
      </div>
    </article>

${ctaBlock()}`
  });
}

function contributeHtml() {
  const sections = contributionPage.sections.map((section) => `      <h2>${escapeHtml(section.heading)}</h2>
      <p>${escapeHtml(section.body)}</p>`).join('\n');
  return page({
    title: `${contributionPage.title} | AIagent2`,
    description: contributionPage.description,
    canonicalPath: '/contribute.html',
    keywords: ['contribute AI agent article', 'AI agent field notes', 'AIagent2 contribution', 'AI agent marketplace feedback'],
    sublogo: 'CONTRIBUTE',
    breadcrumbs: [
      { name: 'AIagent2', url: '/' },
      { name: 'Contribute', url: '/contribute.html' }
    ],
    children: `    <article class="box panel-stack news-article-page" style="margin-bottom:16px">
      <div class="section-title">CONTRIBUTE</div>
      <h1>${escapeHtml(contributionPage.title)}.</h1>
      <p>${escapeHtml(contributionPage.description)}</p>
${sections}
      <div class="footer-links">
        <a href="https://github.com/kyasui-dotcom/aiagent2-core/issues" class="btn link-btn">OPEN GITHUB ISSUES</a>
        <a href="/?tab=agents" class="mini-btn link-btn">LIST YOUR AGENT</a>
        <a href="/news.html" class="mini-btn link-btn">READ NEWS</a>
      </div>
    </article>

${ctaBlock()}`
  });
}

function postUrl(post) {
  return absoluteUrl(`/news/${post.slug}.html`);
}

function postDate(post) {
  return new Date(`${post.date}T00:00:00.000Z`);
}

function postSummary(post) {
  return [
    post.description,
    ...(post.sections || []).map((section) => `${section.heading}: ${section.body}`)
  ].filter(Boolean).join('\n\n');
}

function rssXml() {
  const latestDate = newsPosts.map(postDate).sort((a, b) => b - a)[0] || new Date();
  const items = newsPosts.map((post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(postUrl(post))}</link>
      <guid isPermaLink="true">${escapeXml(postUrl(post))}</guid>
      <description>${escapeXml(post.description)}</description>
      <pubDate>${postDate(post).toUTCString()}</pubDate>
      ${post.author ? `<dc:creator>${escapeXml(post.author)}</dc:creator>` : ''}
      ${(post.keywords || []).map((keyword) => `<category>${escapeXml(keyword)}</category>`).join('\n      ')}
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>AIagent2 News and Field Notes</title>
    <link>${escapeXml(`${SITE_URL}/news.html`)}</link>
    <description>Product updates, design decisions, and operating notes from AIagent2.</description>
    <language>en</language>
    <lastBuildDate>${latestDate.toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${SITE_URL}/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

function atomXml() {
  const latestDate = newsPosts.map(postDate).sort((a, b) => b - a)[0] || new Date();
  const entries = newsPosts.map((post) => `  <entry>
    <title>${escapeXml(post.title)}</title>
    <link href="${escapeXml(postUrl(post))}" rel="alternate" />
    <id>${escapeXml(postUrl(post))}</id>
    <published>${postDate(post).toISOString()}</published>
    <updated>${postDate(post).toISOString()}</updated>
    ${post.author ? `<author><name>${escapeXml(post.author)}</name></author>` : '<author><name>AIagent2</name></author>'}
    <summary>${escapeXml(post.description)}</summary>
    <content type="text">${escapeXml(postSummary(post))}</content>
  </entry>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>AIagent2 News and Field Notes</title>
  <link href="${escapeXml(`${SITE_URL}/feed.xml`)}" rel="self" />
  <link href="${escapeXml(`${SITE_URL}/news.html`)}" rel="alternate" />
  <id>${escapeXml(`${SITE_URL}/news.html`)}</id>
  <updated>${latestDate.toISOString()}</updated>
  <subtitle>Product updates, design decisions, and operating notes from AIagent2.</subtitle>
${entries}
</feed>
`;
}

function sitemapXml(allTerms, agents) {
  const urls = [
    '/',
    '/resources.html',
    '/site-map.html',
    ...seoLandingPages.map((landingPage) => `/${landingPage.slug}.html`),
    '/agents.html',
    ...agents.map((agent) => `/agents/${agentPageSlug(agent)}.html`),
    '/help.html',
    '/demo.html',
    '/glossary.html',
    '/news.html',
    '/contribute.html',
    '/guide.html',
    '/cli-help.html',
    '/qa.html',
    ...newsPosts.map((post) => `/news/${post.slug}.html`),
    ...allTerms.map((term) => `/glossary/${term.slug}.html`)
  ];
  const lastmodFor = (url) => (url === '/demo.html' ? '2026-04-17' : '2026-04-14');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${escapeHtml(absoluteUrl(url))}</loc>
    <lastmod>${lastmodFor(url)}</lastmod>
  </url>`).join('\n')}
</urlset>
`;
}

function build() {
  const terms = glossaryTerms();
  const deprecatedAgentIds = new Set(DEPRECATED_AGENT_SEED_IDS);
  const agents = DEFAULT_AGENT_SEEDS.filter((agent) => !deprecatedAgentIds.has(agent.id));
  rmSync(path.join(publicDir, 'news'), { recursive: true, force: true });
  rmSync(path.join(publicDir, 'glossary'), { recursive: true, force: true });
  rmSync(path.join(publicDir, 'agents'), { recursive: true, force: true });
  writePublic('news.html', newsIndexHtml());
  for (const post of newsPosts) writePublic(path.join('news', `${post.slug}.html`), newsPostHtml(post));
  for (const landingPage of seoLandingPages) writePublic(`${landingPage.slug}.html`, seoLandingPageHtml(landingPage));
  writePublic('resources.html', resourcesHtml(agents, terms));
  writePublic('agents.html', agentCatalogHtml(agents));
  for (const agent of agents) writePublic(path.join('agents', `${agentPageSlug(agent)}.html`), agentPageHtml(agent, agents));
  writePublic('demo.html', demoHtml());
  writePublic('glossary.html', glossaryIndexHtml());
  for (const term of terms) writePublic(path.join('glossary', `${term.slug}.html`), glossaryTermHtml(term, terms));
  writePublic('contribute.html', contributeHtml());
  writePublic('site-map.html', siteMapHtml(agents, terms));
  writePublic('sitemap.xml', sitemapXml(terms, agents));
  writePublic('llms.txt', llmsTxt(agents, terms));
  writePublic('rss.xml', rssXml());
  writePublic('feed.xml', atomXml());
  writePublic('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`Generated ${seoLandingPages.length} SEO landing pages, ${agents.length} agent pages, ${newsPosts.length} news pages and ${terms.length} glossary term pages.`);
}

build();
