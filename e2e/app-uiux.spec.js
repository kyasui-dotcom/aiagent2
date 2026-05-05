import { expect, test } from '@playwright/test';

const appPages = [
  { name: 'Apps hub', path: '/apps.html', primary: 'a.primary-btn[href*="/login"]' },
  { name: 'Analytics Console', path: '/analytics-console.html', primary: '#sendContextBtn' },
  { name: 'Publisher & Approval', path: '/publisher-approval.html', primary: '#sendPacketBtn' },
  { name: 'Lead Ops', path: '/lead-ops.html', primary: '#sendLeadContextBtn' },
  { name: 'Delivery Manager', path: '/delivery-manager.html', primary: '#sendDeliveryContextBtn' }
];

const taskAppPages = appPages.filter((appPage) => appPage.path !== '/apps.html');

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 900 }
];

test.describe('CAIt app UI/UX surfaces', () => {
  for (const viewport of viewports) {
    test(`all app pages fit and expose primary workflow controls on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const appPage of appPages) {
        await page.goto(appPage.path, { waitUntil: 'networkidle' });

        await expect(page.locator('.app-console-panel')).toBeVisible();
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.locator('.side-nav')).toBeVisible();
        await expect(page.locator(appPage.primary).first(), `${appPage.name}: primary action`).toBeVisible();

        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          h1Box: document.querySelector('h1')?.getBoundingClientRect().toJSON(),
          panelBox: document.querySelector('.app-console-panel')?.getBoundingClientRect().toJSON()
        }));
        expect(layout.scrollWidth, `${appPage.name}: no page-level horizontal overflow`).toBeLessThanOrEqual(layout.clientWidth + 1);
        expect(layout.h1Box?.width || 0, `${appPage.name}: h1 has readable width`).toBeGreaterThan(250);
        expect(layout.panelBox?.width || 0, `${appPage.name}: panel fits viewport`).toBeLessThanOrEqual(viewport.width);
      }
    });
  }

  test('built-in app registry links stay on the current origin', async ({ page }) => {
    await page.goto('/apps.html', { waitUntil: 'networkidle' });
    await expect(page.locator('.app-registry-row')).toHaveCount(5);
    const hrefs = await page.locator('.app-registry-row .primary-btn').evaluateAll((links) => links.map((link) => link.href));
    const sameOriginBuiltIns = hrefs.filter((href) => /\/(?:analytics-console|publisher-approval|lead-ops|delivery-manager)\.html$/.test(href));
    expect(sameOriginBuiltIns).toHaveLength(4);
    for (const href of sameOriginBuiltIns) {
      expect(new URL(href).origin).toBe(new URL(page.url()).origin);
    }
  });

  test('task app headers keep only the primary Send to CAIt action', async ({ page }) => {
    for (const appPage of taskAppPages) {
      await page.goto(appPage.path, { waitUntil: 'networkidle' });
      const headerActions = await page.locator('.app-header-actions button, .app-header-actions a').evaluateAll((items) => items.map((item) => item.textContent.trim()));
      expect(headerActions, `${appPage.name}: header action count`).toEqual(['Send to CAIt']);
    }
  });
});
