import { chromium } from 'playwright';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const PROFILE_DIR = 'C:/Users/PC/Documents/programs/output/playwright/cait-live-manual-profile-clone';
const OUTPUT_DIR = 'C:/Users/PC/Documents/programs/output/playwright/cait-live-chat-xoauth-demo';
const CHAT_URL = 'https://aiagent-marketplace.net/chat';
const X_HANDOFF_API = 'https://x.niche-s.com/api/cait/handoff';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createXHandoff() {
  const payload = {
    title: 'CAIt delivery demo',
    product: 'CAIt',
    audience: 'AI engineers',
    goal: 'X launch update',
    source: 'CAIt delivery',
    text: 'CAIt routes the request through a lead agent, keeps the delivery understandable, and hands the final action to X Client Ops.',
    settings: {
      brandName: 'CAIt',
      serviceLine: 'High-quality AI agent output from simple conversation',
      targetClient: 'AI engineers',
      defaultCta: 'Try the workflow',
      destinationLink: 'https://aiagent-marketplace.net/',
      workspaceNotes: 'Prepared by CAIt after leader orchestration.'
    }
  };
  const response = await fetch(X_HANDOFF_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://aiagent-marketplace.net'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`X handoff creation failed (${response.status})`);
  }
  const data = await response.json();
  if (!data?.handoff_url) throw new Error('handoff_url missing');
  return data.handoff_url;
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

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1280, height: 720 }
    }
  });
  const page = context.pages()[0] || await context.newPage();

  await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1800);
  await page.mouse.wheel(0, -500);
  await sleep(1600);

  await page.goto(handoffUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3500);
  await page.mouse.wheel(0, 850);
  await sleep(1400);
  await page.mouse.wheel(0, -420);
  await sleep(1000);

  const continueBtn = page.locator('#continueWithXButton');
  if (await continueBtn.count()) {
    const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
    await continueBtn.click();
    const popup = await popupPromise;
    await sleep(2500);
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await sleep(3000);
    }
  }

  await context.close();
  const videoFile = await latestVideoFile(OUTPUT_DIR);
  if (!videoFile) throw new Error('Video file was not created.');
  console.log(videoFile);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
