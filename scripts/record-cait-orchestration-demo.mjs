import { chromium } from 'playwright';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = 'C:/Users/PC/Documents/programs/output/playwright/cait-orchestration-demo';
const HOME_URL = 'https://aiagent-marketplace.net/';
const X_HANDOFF_API = 'https://x.niche-s.com/api/cait/handoff';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createXHandoff() {
  const payload = {
    title: 'CAIt orchestration demo',
    product: 'CAIt',
    audience: 'AI engineers and founders',
    goal: 'Launch update for X',
    source: 'CAIt orchestration demo',
    text: 'CAIt now routes requests through a lead agent, passes structured context to specialists, and hands approved final actions to apps like X Client Ops.',
    settings: {
      brandName: 'CAIt',
      serviceLine: 'High-quality AI agent output from simple conversation',
      targetClient: 'AI engineers and founders',
      defaultCta: 'Try the workflow',
      destinationLink: 'https://aiagent-marketplace.net/',
      workspaceNotes: 'Prepared by the CAIt leader after research, specialist review, and execution approval.'
    },
    context: {
      order_summary: 'Show orchestration from intake to final X handoff.',
      leader: 'CMO leader',
      specialists: ['research', 'writing', 'x_post'],
      delivery: ['approved post draft', 'handoff packet']
    },
    transfer: {
      type: 'x_post_handoff',
      exact_post_text: 'CAIt now routes requests through a lead agent, passes structured context to specialists, and hands approved final actions to apps like X Client Ops.',
      destination_url: 'https://aiagent-marketplace.net/',
      oauth_account_handle: '@CAIt',
      stop_rule: 'Final human approval before publish'
    }
  };
  const response = await fetch(X_HANDOFF_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:4323'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`X handoff creation failed (${response.status})`);
  }
  const data = await response.json();
  if (!data?.handoff_url) {
    throw new Error('X handoff response did not include handoff_url');
  }
  return data.handoff_url;
}

function demoHtml(handoffUrl) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CAIt orchestration demo</title>
  <style>
    :root {
      --bg: #07111f;
      --panel: #0e1b2e;
      --panel-2: #15263e;
      --line: rgba(148, 163, 184, 0.22);
      --text: #e7eefc;
      --muted: #91a4c6;
      --accent: #7cd9ff;
      --accent-2: #5ef0b8;
      --warn: #ffc670;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, Arial, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(53, 116, 255, 0.18), transparent 26%),
        radial-gradient(circle at top right, rgba(94, 240, 184, 0.14), transparent 24%),
        var(--bg);
      color: var(--text);
    }
    .frame {
      width: 1280px;
      height: 720px;
      margin: 0 auto;
      padding: 24px;
      display: grid;
      grid-template-columns: 1.25fr 0.75fr;
      gap: 18px;
    }
    .surface {
      border: 1px solid var(--line);
      background: rgba(12, 23, 38, 0.92);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
    }
    .header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(10, 18, 31, 0.94);
    }
    .brand {
      display: flex;
      gap: 12px;
      align-items: center;
      font-weight: 700;
      letter-spacing: 0;
    }
    .brand .dot {
      width: 10px;
      height: 10px;
      background: linear-gradient(180deg, var(--accent), #3ea7ff);
      border-radius: 999px;
      box-shadow: 0 0 18px rgba(124, 217, 255, 0.65);
    }
    .header small {
      color: var(--muted);
      font-size: 12px;
    }
    .chat-shell {
      display: grid;
      grid-template-rows: 1fr auto;
      height: calc(100% - 57px);
    }
    .thread {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: hidden;
    }
    .bubble {
      max-width: 86%;
      padding: 12px 14px;
      border-radius: 8px;
      line-height: 1.48;
      font-size: 15px;
      white-space: pre-wrap;
    }
    .bubble.user {
      align-self: flex-end;
      background: rgba(124, 217, 255, 0.16);
      border: 1px solid rgba(124, 217, 255, 0.28);
    }
    .bubble.agent {
      align-self: flex-start;
      background: rgba(19, 36, 58, 0.98);
      border: 1px solid rgba(145, 164, 198, 0.18);
    }
    .bubble.system {
      align-self: center;
      color: var(--muted);
      font-size: 13px;
      background: transparent;
      border: 1px dashed rgba(145, 164, 198, 0.22);
    }
    .composer {
      padding: 14px 18px 18px;
      border-top: 1px solid var(--line);
      background: rgba(10, 18, 31, 0.94);
    }
    .prompt {
      width: 100%;
      min-height: 92px;
      resize: none;
      border-radius: 8px;
      padding: 14px;
      font: inherit;
      color: var(--text);
      background: rgba(14, 27, 46, 0.96);
      border: 1px solid rgba(145, 164, 198, 0.2);
    }
    .composer-row {
      margin-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .hint {
      color: var(--muted);
      font-size: 12px;
    }
    .btn {
      appearance: none;
      border: 0;
      border-radius: 8px;
      padding: 11px 16px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      color: #04111f;
      background: linear-gradient(180deg, #8be4ff, #5bc5ff);
    }
    .side {
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 14px;
      padding: 18px;
    }
    .kicker {
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 6px 0 0;
      font-size: 28px;
      line-height: 1.15;
    }
    .sub {
      color: var(--muted);
      margin: 8px 0 0;
      line-height: 1.5;
      font-size: 14px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(16, 31, 51, 0.95);
      padding: 14px;
    }
    .step {
      display: grid;
      gap: 6px;
      margin-bottom: 12px;
    }
    .step:last-child { margin-bottom: 0; }
    .step-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 14px;
      align-items: center;
    }
    .badge {
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 11px;
      color: var(--muted);
      border: 1px solid rgba(145, 164, 198, 0.2);
    }
    .badge.ready {
      color: #062418;
      background: rgba(94, 240, 184, 0.88);
      border-color: rgba(94, 240, 184, 0.88);
    }
    .progress {
      height: 7px;
      border-radius: 999px;
      background: rgba(145, 164, 198, 0.14);
      overflow: hidden;
    }
    .bar {
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #53c8ff, #5ef0b8);
      transition: width 900ms ease;
    }
    .step p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .handoff {
      display: none;
      gap: 10px;
    }
    .handoff.show {
      display: grid;
    }
    .handoff .cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 42px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 700;
      color: #04111f;
      background: linear-gradient(180deg, #a6ffd5, #5ef0b8);
    }
    .handoff pre {
      margin: 0;
      padding: 12px;
      border-radius: 8px;
      background: rgba(6, 14, 23, 0.92);
      border: 1px solid rgba(145, 164, 198, 0.18);
      color: #d9f3ff;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="frame">
    <section class="surface">
      <div class="header">
        <div class="brand"><span class="dot"></span> CAIt <small>Work Chat</small></div>
        <small>high-quality AI agent output</small>
      </div>
      <div class="chat-shell">
        <div class="thread" id="thread">
          <div class="bubble agent">Hi. This is CAIt.\nDescribe the outcome you want and I will turn it into an order, route it through the right leader, and prepare the final handoff.</div>
        </div>
        <div class="composer">
          <textarea class="prompt" id="prompt">Grow CAIt signups with one launch update. Use orchestration, prepare the final X post, and hand it off to X Client Ops.</textarea>
          <div class="composer-row">
            <div class="hint">Order flow: request -> leader -> specialists -> app handoff</div>
            <button class="btn" id="send">SEND ORDER</button>
          </div>
        </div>
      </div>
    </section>
    <aside class="surface side">
      <div>
        <div class="kicker">Demo Flow</div>
        <h1>Natural orchestration\nacross agents and apps.</h1>
        <p class="sub">The leader narrows the work, selects specialists, keeps delivery understandable, and finishes with an app-ready action.</p>
      </div>
      <div class="card">
        <div class="step">
          <div class="step-top"><strong>1. Leader intake</strong><span class="badge" id="badge-intake">waiting</span></div>
          <div class="progress"><div class="bar" id="bar-intake"></div></div>
          <p>Clarify the request, define the output, and set execution boundaries.</p>
        </div>
        <div class="step">
          <div class="step-top"><strong>2. Research packet</strong><span class="badge" id="badge-research">waiting</span></div>
          <div class="progress"><div class="bar" id="bar-research"></div></div>
          <p>Collect source-backed context before specialists act.</p>
        </div>
        <div class="step">
          <div class="step-top"><strong>3. Specialist handoff</strong><span class="badge" id="badge-specialists">waiting</span></div>
          <div class="progress"><div class="bar" id="bar-specialists"></div></div>
          <p>Writing and X specialists refine the draft and prepare the final packet.</p>
        </div>
        <div class="step">
          <div class="step-top"><strong>4. App handoff</strong><span class="badge" id="badge-handoff">waiting</span></div>
          <div class="progress"><div class="bar" id="bar-handoff"></div></div>
          <p>Approved final action opens directly inside X Client Ops.</p>
        </div>
      </div>
      <div class="card handoff" id="handoff-card">
        <div><strong>Approved X handoff packet</strong></div>
        <pre>Leader: CMO leader
Specialists: research -> writing -> x_post
Status: approved for app handoff
Stop rule: final human review before publish
X account: @CAIt</pre>
        <a class="cta" href="${handoffUrl}" id="open-handoff">Open X Client Ops</a>
      </div>
      <div class="sub">This demo uses the real CAIt landing page and the real X Client Ops handoff endpoint.</div>
    </aside>
  </div>
  <script>
    const thread = document.getElementById('thread');
    const send = document.getElementById('send');
    const prompt = document.getElementById('prompt');
    const handoffCard = document.getElementById('handoff-card');
    const bars = {
      intake: document.getElementById('bar-intake'),
      research: document.getElementById('bar-research'),
      specialists: document.getElementById('bar-specialists'),
      handoff: document.getElementById('bar-handoff')
    };
    const badges = {
      intake: document.getElementById('badge-intake'),
      research: document.getElementById('badge-research'),
      specialists: document.getElementById('badge-specialists'),
      handoff: document.getElementById('badge-handoff')
    };
    function bubble(kind, text) {
      const node = document.createElement('div');
      node.className = 'bubble ' + kind;
      node.textContent = text;
      thread.appendChild(node);
      thread.scrollTop = thread.scrollHeight;
    }
    function markStep(name, width, label) {
      bars[name].style.width = width + '%';
      badges[name].textContent = label;
      if (label === 'ready') badges[name].classList.add('ready');
    }
    function wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async function runDemo() {
      send.disabled = true;
      bubble('user', prompt.value.trim());
      await wait(700);
      bubble('system', 'ORDER ACCEPTANCE');
      markStep('intake', 100, 'ready');
      await wait(700);
      bubble('agent', 'Leader intake complete.\\n\\nGoal: launch update for CAIt\\nOutput: one X-ready post + handoff packet\\nExecution mode: orchestrate and hand off, not auto-publish.');
      await wait(900);
      markStep('research', 100, 'ready');
      bubble('agent', 'Research packet ready.\\n\\n- product context attached\\n- launch angle narrowed\\n- CTA and destination locked');
      await wait(900);
      markStep('specialists', 100, 'ready');
      bubble('agent', 'Specialists finished.\\n\\nWriting agent refined the copy. X specialist checked length, CTA, and final delivery contract.');
      await wait(900);
      markStep('handoff', 100, 'ready');
      bubble('agent', 'Final action approved.\\n\\nOpening X Client Ops with the draft and strategy context attached.');
      handoffCard.classList.add('show');
    }
    send.addEventListener('click', () => { void runDemo(); }, { once: true });
    window.__demo = { runDemo };
  </script>
</body>
</html>`;
}

async function latestVideoFile(dir) {
  const entries = await readdir(dir);
  const files = await Promise.all(entries.map(async (name) => {
    const full = path.join(dir, name);
    const info = await stat(full);
    return { name, full, mtimeMs: info.mtimeMs, isFile: info.isFile() };
  }));
  return files
    .filter((entry) => entry.isFile && entry.name.endsWith('.webm'))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.full || null;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const handoffUrl = await createXHandoff();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1280, height: 720 }
    }
  });
  const page = await context.newPage();

  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1600);
  await page.mouse.wheel(0, 700);
  await sleep(1200);
  await page.mouse.wheel(0, -220);
  await sleep(1000);

  await page.goto('about:blank');
  await page.setContent(demoHtml(handoffUrl), { waitUntil: 'load' });
  await sleep(900);
  await page.waitForFunction(() => Boolean(window.__demo && window.__demo.runDemo), null, { timeout: 10000 });
  await page.evaluate(() => window.__demo.runDemo());
  await page.waitForSelector('#handoff-card.show', { timeout: 15000 });
  await sleep(1200);

  await page.goto(handoffUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2600);
  await page.mouse.wheel(0, 800);
  await sleep(1400);
  await page.mouse.wheel(0, -460);
  await sleep(1200);

  await context.close();
  await browser.close();

  const videoFile = await latestVideoFile(OUTPUT_DIR);
  if (!videoFile) {
    throw new Error('Video file was not created.');
  }
  console.log(videoFile);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
