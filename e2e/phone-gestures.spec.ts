import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/* Touch gestures on the phone layout: tiles, popup sliders and pinch zoom. */

const FAKE_HASS = `http://127.0.0.1:${process.env.E2E_HASS_PORT ?? 8124}`;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function deskCalls(request: APIRequestContext) {
	const calls: { data: Record<string, unknown> }[] = await (
		await request.get(`${FAKE_HASS}/_test/calls`)
	).json();
	return calls.filter((call) => call.data.entity_id === 'light.desk');
}

/* A real touch through the DevTools protocol, so the browser's own pan-y handling runs. */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
	const session = await page.context().newCDPSession(page);
	await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
	const steps = 12;
	for (let step = 1; step <= steps; step += 1) {
		const x = from.x + ((to.x - from.x) * step) / steps;
		const y = from.y + ((to.y - from.y) * step) / steps;
		await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
	}
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await session.detach();
}

test.beforeEach(async ({ page, request }) => {
	await request.post(`${FAKE_HASS}/_test/reset`);
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
});

test.describe('on a page with room to scroll', () => {
	test.use({ viewport: { width: 390, height: 500 } });

	test('a vertical drag across a slider tile scrolls instead of toggling or holding', async ({
		page,
		request
	}) => {
		const tile = page.getByRole('button', { name: /Desk lamp/ });
		const box = (await tile.boundingBox())!;
		await tile.evaluate((element) => {
			element.addEventListener('pointercancel', () => (element.dataset.cancelled = 'yes'));
		});
		const x = box.x + box.width / 2;
		const y = box.y + box.height / 2;
		await touchDrag(page, { x, y }, { x, y: y - 200 });
		// past the hold delay, which the handed-over gesture must not reach
		await page.waitForTimeout(700);

		// pan-y hands the drag to scrolling, and the tile cleans up on the cancel
		expect(
			await page.evaluate(() => (document.querySelector('.layout') as HTMLElement).scrollTop)
		).toBeGreaterThan(0);
		await expect(tile).toHaveAttribute('data-cancelled', 'yes');
		await expect(page.getByRole('slider', { name: 'Brightness' })).toHaveCount(0);
		expect(await deskCalls(request)).toEqual([]);
		await expect(tile).toHaveAttribute('aria-pressed', 'false');
	});
});

test('tapping a spot on a popup slider sets that value', async ({ page, request }) => {
	const tile = page.getByRole('button', { name: /Desk lamp/ });
	const box = (await tile.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(700);
	await page.mouse.up();

	const slider = page.getByRole('slider', { name: 'Brightness' });
	await expect(slider).toBeVisible();
	const bar = (await slider.boundingBox())!;
	await page.mouse.click(bar.x + bar.width * 0.6, bar.y + bar.height / 2);

	await expect
		.poll(async () => (await deskCalls(request)).at(-1)?.data.brightness_pct)
		.toBeGreaterThanOrEqual(55);
	expect((await deskCalls(request)).at(-1)?.data.brightness_pct).toBeLessThanOrEqual(65);
});

test('slider tiles let a pinch zoom start', async ({ page }) => {
	const touchAction = await page
		.getByRole('button', { name: /Desk lamp/ })
		.evaluate((element) => getComputedStyle(element).touchAction);
	expect(touchAction).toBe('pan-y pinch-zoom');
});
