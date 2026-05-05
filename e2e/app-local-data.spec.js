import { expect, test } from '@playwright/test';

const appPages = [
  { path: '/apps.html', ready: '[data-app-registry-list]' },
  { path: '/analytics-console.html', ready: '#sendContextBtn', send: '#sendContextBtn' },
  { path: '/publisher-approval.html', ready: '#sendPacketBtn', send: '#sendPacketBtn' },
  { path: '/lead-ops.html', ready: '#sendLeadContextBtn', send: '#sendLeadContextBtn' },
  { path: '/delivery-manager.html', ready: '#sendDeliveryContextBtn', send: '#sendDeliveryContextBtn' }
];

async function browserStorageSnapshot(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await page.evaluate(async () => {
        let indexedDbNames = [];
        try {
          if (globalThis.indexedDB?.databases) {
            indexedDbNames = (await globalThis.indexedDB.databases()).map((db) => db?.name || '').filter(Boolean);
          }
        } catch {
          indexedDbNames = ['indexeddb-inspection-failed'];
        }

        let cacheNames = [];
        try {
          if (globalThis.caches?.keys) cacheNames = await globalThis.caches.keys();
        } catch {
          cacheNames = ['cache-inspection-failed'];
        }

        return {
          localStorageKeys: Object.keys(globalThis.localStorage || {}),
          sessionStorageKeys: Object.keys(globalThis.sessionStorage || {}),
          indexedDbNames,
          cacheNames
        };
      });
    } catch (error) {
      if (!/Execution context was destroyed|navigation/i.test(String(error?.message || error)) || attempt === 4) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(100);
    }
  }
  throw new Error('Unable to inspect browser storage.');
}

function expectNoBrowserPersistence(snapshot, label) {
  expect(snapshot.localStorageKeys, `${label}: localStorage`).toEqual([]);
  expect(snapshot.sessionStorageKeys, `${label}: sessionStorage`).toEqual([]);
  expect(snapshot.indexedDbNames, `${label}: indexedDB`).toEqual([]);
  expect(snapshot.cacheNames, `${label}: Cache API`).toEqual([]);
}

test.describe('CAIt apps do not persist local browser data', () => {
  test('app pages keep browser persistence APIs empty on load', async ({ page }) => {
    for (const appPage of appPages) {
      await page.goto(appPage.path, { waitUntil: 'networkidle' });
      await expect(page.locator(appPage.ready)).toBeVisible();
      expectNoBrowserPersistence(await browserStorageSnapshot(page), appPage.path);
    }
  });

  test('Send to CAIt uses the server context API without local browser persistence', async ({ page }) => {
    for (const appPage of appPages.filter((item) => item.send)) {
      await page.goto(appPage.path, { waitUntil: 'networkidle' });
      await expect(page.locator(appPage.ready)).toBeVisible();

      const contextResponse = page.waitForResponse((response) => (
        response.url().includes('/api/app-contexts')
        && response.request().method() === 'POST'
      ));

      await page.locator(appPage.send).click();
      const response = await contextResponse;
      expect(response.ok(), `${appPage.path}: app context POST should succeed`).toBe(true);
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      expectNoBrowserPersistence(await browserStorageSnapshot(page), `${appPage.path} after send`);
    }
  });
});
