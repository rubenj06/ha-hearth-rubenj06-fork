import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/* The phone layout: pages stay reachable without scrolling, sheets fit. */

const HEARTH_FILE = new URL('./fixture/data/hearth.yaml', import.meta.url);
const HEARTH_FIXTURE = readFileSync(HEARTH_FILE, 'utf8');

/*
 * A second page and a four-column card, which the shared fixture lacks. A
 * document of its own rather than an edit of the shared one: other specs
 * save into that file.
 */
function writeFixture() {
	writeFileSync(
		HEARTH_FILE,
		`version: 5
revision: 1
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
          columns: 4
          entities:
            - entity: light.desk
            - entity: light.shelf
            - entity: switch.fan
            - entity: switch.heater
  - id: kitchen
    name: Kitchen
    icon: kitchen
    cards: []
`
	);
}

async function open(page: Page) {
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
}

/*
 * The layout clips sideways overflow (overflow-x: hidden), so the document
 * never grows wider than the window whatever spills. The scrollers' own
 * scroll widths and the content boxes are what show it.
 */
async function sidewaysOverflow(page: Page) {
	return page.evaluate(() => {
		const scrollers = [...document.querySelectorAll<HTMLElement>('.layout, .main')];
		const cut = Math.max(...scrollers.map((element) => element.scrollWidth - element.clientWidth));
		const past = [...document.querySelectorAll('.card-slot, .entity-slot, .rail-run .widget')]
			.map((element) => element.getBoundingClientRect())
			.filter((box) => box.width > 0 && (box.left < -0.5 || box.right > innerWidth + 0.5));
		return { cut, past: past.length };
	});
}

/** The x positions of the Lights card's tiles, one per track in use. */
async function lightsTracks(page: Page) {
	const boxes = await page
		.locator('.card-slot', { hasText: 'Lights' })
		.locator('.entity-slot')
		.evaluateAll((slots) => slots.map((slot) => slot.getBoundingClientRect().x));
	return new Set(boxes.map(Math.round)).size;
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.afterEach(() => writeFileSync(HEARTH_FILE, HEARTH_FIXTURE));

test.describe('the shared fixture', () => {
	test.beforeEach(async ({ page }) => open(page));

	test('the page strip sits at the top and switches pages without scrolling', async ({ page }) => {
		const strip = page.getByRole('navigation', { name: 'Pages' });
		await expect(strip).toBeInViewport();
		await expect(strip.getByRole('button', { name: /Office/ })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.getByRole('button', { name: 'Edit Hearth configuration' })).toBeInViewport();
		expect(await sidewaysOverflow(page)).toEqual({ cut: 0, past: 0 });
	});

	test('the window reaches under the device cutouts', async ({ page }) => {
		// without viewport-fit=cover every env(safe-area-inset-*) in the stylesheets
		// resolves to zero, whatever the device
		await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
			'content',
			/viewport-fit=cover/
		);
	});

	test('the glance widgets ride above the page and the rest follow it', async ({ page }) => {
		const runs = page.locator('.rail-run');
		await expect(runs).toHaveCount(2);

		const clock = runs.first().locator('.widget').first();
		await expect(clock).toBeVisible();
		const clockBox = (await clock.boundingBox())!;
		const pageBox = (await page.locator('.main').boundingBox())!;
		expect(clockBox.y).toBeLessThan(pageBox.y);

		// the strip carries the pages, so the rail's own copy would be redundant
		await expect(page.locator('.rail-run .widget.in-switcher')).toHaveCount(1);
		await expect(
			page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Office' })
		).toBeVisible();
	});

	test('nothing scrolls under the page strip', async ({ page }) => {
		await page.evaluate(() => {
			(document.querySelector('.layout') as HTMLElement).scrollTop = 400;
		});
		const strip = page.getByRole('navigation', { name: 'Pages' });
		const box = (await strip.boundingBox())!;
		expect(Math.round(box.y)).toBe(0);
		// opaque, so the page passing behind it cannot show through the pills
		await expect(strip).toHaveCSS('background-image', 'none');
	});

	test('a light popup opens as a bottom sheet and the card sheet leads with its fields', async ({
		page
	}) => {
		const tile = page.getByRole('button', { name: /Desk lamp/ });
		const box = (await tile.boundingBox())!;
		const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		const session = await page.context().newCDPSession(page);
		await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
		await page.waitForTimeout(700);
		await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await session.detach();
		const toggle = page.getByRole('switch', { name: 'Toggle light' });
		await expect(toggle).toBeVisible();
		const sheetBox = (await page.locator('.sheet').first().boundingBox())!;
		expect(Math.round(sheetBox.x + sheetBox.width)).toBe(390);
		expect(Math.round(sheetBox.y + sheetBox.height)).toBe(844);
		await page.keyboard.press('Escape');

		await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
		await page
			.locator('.card-slot', { hasText: 'Lights' })
			.getByRole('button', { name: 'Edit' })
			.click();
		const sheet = page.getByRole('dialog', { name: 'Edit card' });
		await expect(sheet).toBeVisible();
		const title = await sheet.getByLabel('Title').boundingBox();
		const preview = await sheet.locator('.pane').boundingBox();
		expect(title!.y).toBeLessThan(preview!.y);
	});

	test('taps show only our own press feedback', async ({ page }) => {
		const touchStyle = (name: RegExp | string) =>
			page
				.getByRole('button', { name })
				.first()
				.evaluate((element) => {
					const style = getComputedStyle(element);
					return {
						highlight: style.getPropertyValue('-webkit-tap-highlight-color'),
						touchAction: style.touchAction,
						userSelect: style.userSelect
					};
				});
		const tile = await touchStyle(/Desk lamp/);
		const button = await touchStyle('Edit Hearth configuration');
		expect(tile.highlight).toBe('rgba(0, 0, 0, 0)');
		expect(button.highlight).toBe('rgba(0, 0, 0, 0)');
		// tiles keep vertical panning and pinch zoom; plain buttons lose the double-tap zoom
		expect(tile.touchAction).toBe('pan-y pinch-zoom');
		expect(button.touchAction).toBe('manipulation');
		expect(button.userSelect).toBe('none');
	});

	test('entity drag handles take a finger-sized touch', async ({ page }) => {
		await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
		const handle = page.locator('.entity-drag-handle').first();
		await expect(handle).toBeVisible();
		const visible = (await handle.boundingBox())!;
		expect(visible.width).toBeLessThan(44);
		const hitArea = await handle.evaluate((element) => {
			const style = getComputedStyle(element, '::before');
			return { width: parseFloat(style.width), height: parseFloat(style.height) };
		});
		expect(hitArea.width).toBeGreaterThanOrEqual(44);
		expect(hitArea.height).toBeGreaterThanOrEqual(44);
	});
});

/* short enough that the first page has somewhere to scroll to */
test.describe('a page taller than the screen', () => {
	test.use({ viewport: { width: 390, height: 500 } });

	test.beforeEach(async ({ page }) => open(page));

	test('a page opens at its own top, not the previous page scroll offset', async ({ page }) => {
		// the fixture has one page; the second one is the point of the test
		await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
		await page.getByRole('button', { name: 'Add page' }).first().click();
		const sheet = page.getByRole('dialog', { name: 'Add page' });
		await sheet.getByLabel('Name').fill('Garage');
		await sheet.getByRole('button', { name: 'Done' }).click();

		const strip = page.getByRole('navigation', { name: 'Pages' });
		const office = strip.getByRole('button', { name: 'Office' });
		await office.click();

		const scrollTop = () =>
			page.evaluate(() => (document.querySelector('.layout') as HTMLElement).scrollTop);
		await page.evaluate(() => {
			const layout = document.querySelector('.layout') as HTMLElement;
			layout.scrollTop = layout.scrollHeight;
		});
		expect(await scrollTop()).toBeGreaterThan(0);

		const garage = strip.getByRole('button', { name: 'Garage' });
		await garage.click();
		await expect(garage).toHaveAttribute('aria-current', 'page');
		expect(await scrollTop()).toBe(0);
	});

	test('scrolled to the end, the edit toggle clears the last content', async ({ page }) => {
		await page.evaluate(() => {
			const layout = document.querySelector('.layout') as HTMLElement;
			layout.scrollTop = layout.scrollHeight;
		});
		const toggle = (await page
			.getByRole('button', { name: 'Edit Hearth configuration' })
			.boundingBox())!;
		const contentBottom = await page.evaluate(() =>
			Math.max(
				...[...document.querySelectorAll('.card-slot, .rail-run .widget')]
					.map((element) => element.getBoundingClientRect())
					.filter((box) => box.height > 0)
					.map((box) => box.bottom)
			)
		);
		expect(contentBottom).toBeLessThanOrEqual(toggle.y);
	});
});

test.describe('the smallest phone', () => {
	test.use({ viewport: { width: 320, height: 568 } });

	test.beforeEach(async ({ page }) => open(page));

	test('nothing spills sideways', async ({ page }) => {
		await expect(page.getByRole('navigation', { name: 'Pages' })).toBeInViewport();
		expect(await sidewaysOverflow(page)).toEqual({ cut: 0, past: 0 });
	});
});

test.describe('a card with its own column count', () => {
	test.beforeEach(async ({ page }) => {
		writeFixture();
		await open(page);
	});

	test('keeps two tracks on a phone and one per row while editing', async ({ page }) => {
		expect(await lightsTracks(page)).toBe(2);
		expect(await sidewaysOverflow(page)).toEqual({ cut: 0, past: 0 });

		await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
		await expect(page.locator('.entity-drag-handle').first()).toBeVisible();
		expect(await lightsTracks(page)).toBe(1);
	});

	test.describe('at 320 wide', () => {
		test.use({ viewport: { width: 320, height: 568 } });

		test('still fits', async ({ page }) => {
			expect(await lightsTracks(page)).toBe(2);
			expect(await sidewaysOverflow(page)).toEqual({ cut: 0, past: 0 });
		});
	});
});

test.describe('held sideways', () => {
	test.use({ viewport: { width: 844, height: 390 } });

	test.beforeEach(async ({ page }) => {
		writeFixture();
		await open(page);
	});

	test('the page starts at the strip and the pills shed their labels', async ({ page }) => {
		// no height to spend before the page, so nothing rides above it
		await expect(page.locator('.rail-run')).toHaveCount(1);
		const main = (await page.locator('.main').boundingBox())!;
		expect(main.y).toBeLessThan(120);

		const strip = page.getByRole('navigation', { name: 'Pages' });
		const office = strip.getByRole('button', { name: 'Office' });
		const kitchen = strip.getByRole('button', { name: 'Kitchen' });
		// the page being viewed keeps its label
		await expect(office).toHaveAttribute('aria-current', 'page');
		await expect(office.getByText('Office', { exact: true })).toBeVisible();
		// the others shrink to their icon; the label goes to assistive
		// technology rather than being dropped
		await expect(kitchen).toBeVisible();
		expect((await kitchen.boundingBox())!.width).toBeLessThanOrEqual(44);
		const label = (await kitchen.getByText('Kitchen', { exact: true }).boundingBox())!;
		expect(label.width).toBeLessThanOrEqual(1);
		expect(await sidewaysOverflow(page)).toEqual({ cut: 0, past: 0 });
	});
});

/* an iPhone Pro Max on its side is wider than the fold */
test.describe('a large phone held sideways', () => {
	test.use({ viewport: { width: 932, height: 430 } });

	test.beforeEach(async ({ page }) => open(page));

	test('keeps the rail column and nothing spills', async ({ page }) => {
		await expect(page.locator('.layout')).not.toHaveClass(/narrow/);
		await expect(page.locator('.rail-scroll').first()).toBeVisible();
		expect(await sidewaysOverflow(page)).toEqual({ cut: 0, past: 0 });
	});
});
