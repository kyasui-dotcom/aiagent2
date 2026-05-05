import { chromium } from 'playwright';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const PROFILE_DIR = 'C:/Users/PC/Documents/programs/output/playwright/cait-live-manual-profile-clone';
const OUTPUT_DIR = 'C:/Users/PC/Documents/programs/output/playwright/cait-order-flow-live';
const CHAT_URL = 'https://aiagent-marketplace.net/chat';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  await page.waitForTimeout(3500);

  const textarea = page.locator('textarea').first();
  const sendChat = page.getByRole('button', { name: /send chat/i });

  await textarea.fill('集客したい');
  await sleep(700);
  await sendChat.click();
  await page.waitForTimeout(4500);

  await textarea.fill('商材: CAIt https://aiagent-marketplace.net。AI agentを使って実作業まで進められる。対象: 英語圏のエンジニア。目的: 会員登録を増やす。制約: 広告費なし、X中心。納品: 投稿文、訴求ポイント、最終アクション用の文面。');
  await sleep(800);
  await sendChat.click();
  await page.waitForTimeout(6500);

  const sendOrder = page.getByRole('button', { name: /send order/i });
  await sendOrder.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
  await sendOrder.click();

  await page.waitForTimeout(6000);
  await page.waitForFunction(() => /Order accepted\./i.test(document.body.innerText), null, { timeout: 30000 });
  await page.waitForTimeout(7000);

  const openButtons = page.getByRole('button', { name: /^Open$/i });
  const openCount = await openButtons.count();
  if (openCount > 0) {
    const lastOpen = openButtons.nth(openCount - 1);
    await lastOpen.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await lastOpen.click();
    await page.waitForTimeout(3500);

    const continueWithX = page.locator('#continueWithXButton');
    if (await continueWithX.count()) {
      const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
      await continueWithX.click();
      const popup = await popupPromise;
      await page.waitForTimeout(1500);
      if (popup) {
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        await popup.waitForTimeout(3500);
      }
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
