import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/* Sideways swipes over the page move between pages when a layout allows it. */

const FAKE_HASS = `http://127.0.0.1:${process.env.E2E_HASS_PORT ?? 8124}`;
const HEARTH_FILE = new URL('./fixture/data/hearth.yaml', import.meta.url);
const HEARTH_FIXTURE = readFileSync(HEARTH_FILE, 'utf8');

/*
 * A document of its own rather than an edit of the shared fixture: other specs
 * save into that file, and the page order here is what the swipes walk.
 */
function writeFixture(settings: { mobile?: boolean; desktop?: boolean; rail?: string }) {
	writeFileSync(
		HEARTH_FILE,
		`version: 5
revision: 1
swipe_navigation_mobile: ${settings.mobile === true}
swipe_navigation_desktop: ${settings.desktop === true}
rail_position: ${settings.rail ?? 'left'}
rail:
  - id: clock
    type: clock
  - id: nav
    type: nav
rooms:
  - id: office
    name: Office
    icon: desk
    columns: 1
    cards:
      - - id: lights
          type: entities
          title: Lights
          entities:
            - entity: light.desk
            - entity: switch.fan
  - id: kitchen
    name: Kitchen
    icon: kitchen
    columns: 1
    cards:
      - - id: kitchen-switches
          type: entities
          title: Switches
          entities:
            - entity: switch.fan
            - entity: sensor.temperature
            - entity: sensor.temperature
            - entity: sensor.temperature
            - entity: sensor.temperature
            - entity: sensor.temperature
            - entity: sensor.temperature
  - id: garage
    name: Garage
    icon: garage
    cards: []
`
	);
}

async function callsFor(request: APIRequestContext, entityId: string) {
	const calls = (await (await request.get(`${FAKE_HASS}/_test/calls`)).json()) as {
		data: Record<string, unknown>;
	}[];
	return calls.filter((call) => call.data.entity_id === entityId);
}

/** A finger drag through the browser's own touch pipeline, so touch-action and scrolling apply. */
async function touchDrag(
	page: Page,
	from: { x: number; y: number },
	to: { x: number; y: number },
	steps = 12
) {
	const session = await page.context().newCDPSession(page);
	await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
	for (let step = 1; step <= steps; step += 1) {
		const x = from.x + ((to.x - from.x) * step) / steps;
		const y = from.y + ((to.y - from.y) * step) / steps;
		await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
	}
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await session.detach();
}

async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	const steps = 12;
	for (let step = 1; step <= steps; step += 1) {
		await page.mouse.move(
			from.x + ((to.x - from.x) * step) / steps,
			from.y + ((to.y - from.y) * step) / steps
		);
	}
	await page.mouse.up();
}

/** A point on the page column's heading, clear of any control. */
async function pageHeading(page: Page) {
	const box = (await page.locator('.main').boundingBox())!;
	return { x: box.x + box.width / 2, y: box.y + 24, width: box.width };
}

test.beforeEach(async ({ request }) => {
	await request.post(`${FAKE_HASS}/_test/reset`);
});

test.afterEach(() => writeFileSync(HEARTH_FILE, HEARTH_FIXTURE));

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 600 }, hasTouch: true, isMobile: true });

	test.beforeEach(async ({ page }) => {
		writeFixture({ mobile: true });
		await page.goto('/');
		await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
	});

	test('a sideways swipe moves to the neighbouring page and into the address', async ({ page }) => {
		const strip = page.getByRole('navigation', { name: 'Pages' });
		const start = await pageHeading(page);

		await touchDrag(page, { x: start.x + 120, y: start.y }, { x: start.x - 120, y: start.y });
		await expect(strip.getByRole('button', { name: 'Kitchen' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page).toHaveURL(/[?&]room=kitchen\b/);

		await touchDrag(page, { x: start.x - 120, y: start.y }, { x: start.x + 120, y: start.y });
		await expect(strip.getByRole('button', { name: 'Office' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page).toHaveURL(/[?&]room=office\b/);
	});

	test('the first page does not wrap around to the last', async ({ page }) => {
		const start = await pageHeading(page);
		await touchDrag(page, { x: start.x - 120, y: start.y }, { x: start.x + 120, y: start.y });
		await expect(
			page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Office' })
		).toHaveAttribute('aria-current', 'page');
		await expect(page.locator('.main')).not.toHaveAttribute('style', /translateX/);
	});

	test('a swipe that starts on a tile does not toggle it', async ({ page, request }) => {
		await page
			.getByRole('navigation', { name: 'Pages' })
			.getByRole('button', { name: 'Kitchen' })
			.click();
		const fan = page.getByRole('button', { name: /Ceiling fan/ });
		const box = (await fan.boundingBox())!;
		const y = box.y + box.height / 2;

		await touchDrag(page, { x: box.x + box.width - 10, y }, { x: box.x - 150, y });
		await expect(
			page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Garage' })
		).toHaveAttribute('aria-current', 'page');
		// a toggle would have been sent right away; give it the chance to show up
		await page.waitForTimeout(300);
		expect(await callsFor(request, 'switch.fan')).toHaveLength(0);

		// and the next plain tap still reaches a tile
		await page
			.getByRole('navigation', { name: 'Pages' })
			.getByRole('button', { name: 'Kitchen' })
			.click();
		await page.getByRole('button', { name: /Ceiling fan/ }).click();
		await expect.poll(async () => (await callsFor(request, 'switch.fan')).length).toBe(1);
	});

	test('a vertical scroll stays on the page', async ({ page }) => {
		await page
			.getByRole('navigation', { name: 'Pages' })
			.getByRole('button', { name: 'Kitchen' })
			.click();
		const box = (await page.locator('.main').boundingBox())!;
		const x = box.x + box.width / 2;
		await touchDrag(page, { x: x + 20, y: 500 }, { x: x - 20, y: 150 });
		await expect(
			page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Kitchen' })
		).toHaveAttribute('aria-current', 'page');
		expect(
			await page.evaluate(() => (document.querySelector('.layout') as HTMLElement).scrollTop)
		).toBeGreaterThan(0);
	});
});

test.describe('on a wide screen', () => {
	test('a mouse drag moves between pages when the desktop setting is on', async ({ page }) => {
		writeFixture({ desktop: true });
		await page.goto('/');
		await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
		const start = await pageHeading(page);

		await mouseDrag(page, { x: start.x + 200, y: start.y }, { x: start.x - 200, y: start.y });
		await expect(page.locator('.nav-item[data-id="kitchen"]')).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page).toHaveURL(/[?&]room=kitchen\b/);
	});

	for (const rail of ['right', 'none']) {
		test(`a mouse drag moves between pages with the sidebar set to ${rail}`, async ({ page }) => {
			writeFixture({ desktop: true, rail });
			await page.goto('/');
			await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
			const start = await pageHeading(page);

			await mouseDrag(page, { x: start.x + 200, y: start.y }, { x: start.x - 200, y: start.y });
			await expect(page).toHaveURL(/[?&]room=kitchen\b/);
			await expect(page.getByRole('button', { name: /Ceiling fan/ })).toBeVisible();
			await expect(page.getByRole('button', { name: /Desk lamp/ })).toHaveCount(0);
		});
	}

	test('a mouse swipe that starts on a tile does not toggle it', async ({ page, request }) => {
		writeFixture({ desktop: true });
		await page.goto('/');
		const fan = page.getByRole('button', { name: /Ceiling fan/ });
		const box = (await fan.boundingBox())!;
		const y = box.y + box.height / 2;

		await mouseDrag(page, { x: box.x + box.width - 10, y }, { x: box.x - 250, y });
		await expect(page.locator('.nav-item[data-id="kitchen"]')).toHaveAttribute(
			'aria-current',
			'page'
		);
		await page.waitForTimeout(300);
		expect(await callsFor(request, 'switch.fan')).toHaveLength(0);
	});

	test('a drag across a light tile sets its brightness, not the page', async ({
		page,
		request
	}) => {
		writeFixture({ desktop: true });
		await page.goto('/');
		const lamp = page.getByRole('button', { name: /Desk lamp/ });
		const box = (await lamp.boundingBox())!;
		const y = box.y + box.height / 2;

		await mouseDrag(page, { x: box.x + box.width * 0.9, y }, { x: box.x + box.width * 0.3, y });
		await expect
			.poll(async () => (await callsFor(request, 'light.desk')).length)
			.toBeGreaterThan(0);
		await expect(page.locator('.nav-item[data-id="office"]')).toHaveAttribute(
			'aria-current',
			'page'
		);
	});

	test('a mouse drag does nothing while only the phone setting is on', async ({ page }) => {
		writeFixture({ mobile: true });
		await page.goto('/');
		await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
		const start = await pageHeading(page);

		await mouseDrag(page, { x: start.x + 200, y: start.y }, { x: start.x - 200, y: start.y });
		await page.waitForTimeout(400);
		await expect(page.locator('.nav-item[data-id="office"]')).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.locator('.main')).not.toHaveAttribute('style', /translateX/);
	});
});
