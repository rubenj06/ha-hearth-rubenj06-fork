import { readFileSync } from 'node:fs';
import { expect, test, type Browser } from '@playwright/test';

const FAKE_HASS = 'http://127.0.0.1:8125';
const SHOTS = 'matrix-output/readme';
const OUT = 'docs/images/devices.png';

async function capture(
	browser: Browser,
	options: {
		width: number;
		height: number;
		night: boolean;
		phone: boolean;
		time: string;
		file: string;
	}
) {
	const context = await browser.newContext({
		viewport: { width: options.width, height: options.height },
		deviceScaleFactor: 2,
		hasTouch: options.phone,
		isMobile: options.phone
	});
	const page = await context.newPage();
	await page.clock.setFixedTime(new Date(options.time));
	await page.request.post(`${FAKE_HASS}/_test/reset`);
	await page.request.post(`${FAKE_HASS}/_test/state`, {
		data: { entity_id: 'sun.sun', state: options.night ? 'below_horizon' : 'above_horizon' }
	});
	await page.goto('/?menu=false');
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
	await page.waitForTimeout(1000);
	await page.screenshot({ path: options.file });
	await context.close();
	return `data:image/png;base64,${readFileSync(options.file).toString('base64')}`;
}

test('device image', async ({ browser }) => {
	const tablet = await capture(browser, {
		width: 1280,
		height: 800,
		night: true,
		phone: false,
		time: '2026-09-29T19:42:00',
		file: `${SHOTS}/tablet-night.png`
	});
	const phone = await capture(browser, {
		width: 390,
		height: 844,
		night: false,
		phone: true,
		time: '2026-09-29T09:15:00',
		file: `${SHOTS}/phone-day.png`
	});

	// the phone overlaps the tablet's lower right corner; both screens keep their CSS pixel size
	const context = await browser.newContext({
		viewport: { width: 1640, height: 1000 },
		// keeps the README image near 600 KB
		deviceScaleFactor: 1.5
	});
	const page = await context.newPage();
	await page.setContent(`<!doctype html>
<style>
	html, body { margin: 0; background: transparent; }
	.stage { position: relative; width: 1640px; height: 1000px; }
	.device {
		position: absolute;
		background: #16161a;
		box-shadow: inset 0 0 0 2px #2c2c33, 0 30px 60px rgb(0 0 0 / 0.35);
	}
	.device img { display: block; }
	.tablet { left: 40px; top: 40px; padding: 30px; border-radius: 48px; }
	.tablet img { width: 1280px; height: 800px; border-radius: 18px; }
	.phone {
		left: 1180px; top: 150px; padding: 14px; border-radius: 56px;
		transform: scale(0.95); transform-origin: top left;
	}
	.phone img { width: 390px; height: 844px; border-radius: 42px; }
</style>
<div class="stage">
	<div class="device tablet"><img src="${tablet}"></div>
	<div class="device phone"><img src="${phone}"></div>
</div>`);
	await page.locator('.stage').screenshot({ path: OUT, omitBackground: true });
	await context.close();
});
