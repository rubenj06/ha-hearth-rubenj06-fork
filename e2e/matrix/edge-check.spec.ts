import { expect, test } from '@playwright/test';

const OUT = 'matrix-output/edge-check';

const BUSY_BACKDROP = `.frame { background-image: repeating-linear-gradient(48deg, #e8d9b8 0 10px, #14110e 10px 20px) !important; }`;

test('progressive blur marks both cut edges of the page column', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/?theme=glass');
	await page.waitForSelector('.frame');
	await page.addStyleTag({ content: BUSY_BACKDROP });
	await page.waitForTimeout(400);

	const main = page.locator('.main');
	const bands = page.locator('.main-wrap > div[aria-hidden="true"]');
	await expect(bands).toHaveCount(2);

	const scrollable = await main.evaluate((node) => node.scrollHeight - node.clientHeight);
	expect(scrollable, 'the page column must overflow for this check').toBeGreaterThan(200);

	// the blur has to survive minification: a hand-written -webkit- prefix used
	// to collapse the pair down to an alias Chrome no longer honours
	await expect
		.poll(() =>
			bands.nth(1).evaluate((e) => getComputedStyle(e.children[4] as HTMLElement).backdropFilter)
		)
		.toBe('blur(12px)');

	await expect(bands.nth(0)).toHaveCSS('visibility', 'hidden');
	await expect(bands.nth(1)).toHaveCSS('visibility', 'visible');

	await main.evaluate((node) => node.scrollTo({ top: 120 }));
	await page.waitForTimeout(400);
	await expect(bands.nth(0)).toHaveCSS('visibility', 'visible');
	await expect(bands.nth(1)).toHaveCSS('visibility', 'visible');
	await page.screenshot({ path: `${OUT}/01-both-edges.png` });

	await main.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
	await page.waitForTimeout(400);
	await expect(bands.nth(0)).toHaveCSS('visibility', 'visible');
	await expect(bands.nth(1)).toHaveCSS('visibility', 'hidden');
	await page.screenshot({ path: `${OUT}/02-scrolled-to-end.png` });
});

test('the setting removes the bands entirely', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/?theme=glass');
	await page.waitForSelector('.frame');
	await page.addStyleTag({ content: BUSY_BACKDROP });

	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await page.getByRole('button', { name: 'Settings' }).first().click();
	const toggle = page.getByRole('switch', { name: 'Scroll edge blur' });
	await expect(toggle).toBeChecked();
	await toggle.click();
	await expect(toggle).not.toBeChecked();

	await expect(page.locator('.main-wrap > div[aria-hidden="true"]')).toHaveCount(0);
	await page.screenshot({ path: `${OUT}/03-setting-off.png` });
});
