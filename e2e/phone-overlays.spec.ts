import { readFileSync, writeFileSync } from 'node:fs';
import { dump, load } from 'js-yaml';
import { expect, test, type Page } from '@playwright/test';

/* Overlays on a phone: sheets fit, controls stay reachable, inputs do not zoom. */

const HEARTH_FILE = new URL('./fixture/data/hearth.yaml', import.meta.url);
const HEARTH_FIXTURE = readFileSync(HEARTH_FILE, 'utf8');

interface Fixture {
	rail: { id: string; type: string }[];
	rooms: { cards: { id: string; type: string; entity?: string }[][] }[];
}

// the fixture has neither a media card nor a search widget; these tests need both
function withMediaAndSearch() {
	const config = load(HEARTH_FIXTURE) as Fixture;
	config.rail.push({ id: 'search', type: 'search' });
	config.rooms[0].cards[0].push({ id: 'music', type: 'media', entity: 'media_player.living' });
	return dump(config);
}

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
	writeFileSync(HEARTH_FILE, withMediaAndSearch());
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
});

test.afterEach(() => writeFileSync(HEARTH_FILE, HEARTH_FIXTURE));

async function openCardEditor(page: Page, title: string) {
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await page
		.locator('.card-slot', { hasText: title })
		.getByRole('button', { name: 'Edit' })
		.click();
	const sheet = page.getByRole('dialog', { name: 'Edit card' });
	await expect(sheet).toBeVisible();
	return sheet;
}

test('the media sheet gives the track the full width and stacks the queue under it', async ({
	page
}) => {
	await page.getByRole('button', { name: 'Open controls' }).click();
	const sheet = page.getByRole('dialog', { name: 'Living room speaker' });
	await expect(sheet).toBeVisible();

	const stage = (await sheet.locator('.stage').boundingBox())!;
	expect(stage.width).toBeGreaterThan(300);

	await expect(sheet.getByText('Blue in Green')).toBeInViewport();
	const play = sheet.locator('.transport .play');
	await expect(play).toBeInViewport();
	const playBox = (await play.boundingBox())!;
	expect(playBox.x + playBox.width).toBeLessThanOrEqual(375);

	// the panel sits below the stage rather than beside it
	const panel = (await sheet.locator('.panel').boundingBox())!;
	expect(panel.y).toBeGreaterThanOrEqual(stage.y + stage.height);
	expect(panel.width).toBeGreaterThan(300);

	// a finger landing just off the thin bar still scrubs
	const progress = (await sheet.locator('.progress').boundingBox())!;
	const hit = await page.evaluate(
		({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.progress')),
		{ x: progress.x + progress.width / 2, y: progress.y - 10 }
	);
	expect(hit).toBe(true);
});

test.describe('at 320px', () => {
	test.use({ viewport: { width: 320, height: 640 } });

	test('a long sheet title truncates and keeps Close on screen', async ({ page }) => {
		const sheet = await openCardEditor(page, 'Lights');
		// every title is fixed copy; stand in for a long translation
		await sheet
			.locator('.header .title')
			.evaluate((node) => (node.textContent = 'Edit the card with a very long translated title'));

		const title = sheet.locator('.header .title');
		const overflow = await title.evaluate((node) => node.scrollWidth > node.clientWidth);
		expect(overflow).toBe(true);
		await expect(title).toHaveCSS('text-overflow', 'ellipsis');

		const close = sheet.getByRole('button', { name: 'Close' });
		await expect(close).toBeInViewport({ ratio: 1 });
		const closeBox = (await close.boundingBox())!;
		const sheetBox = (await sheet.boundingBox())!;
		expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width);
	});
});

test('text inputs are large enough that iOS does not zoom into them', async ({ page }) => {
	expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
	const fontSize = (selector: string) =>
		page
			.locator(selector)
			.first()
			.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));

	await page
		.getByRole('navigation', { name: 'Pages' })
		.getByRole('button', { name: 'Search' })
		.click();
	const search = page.getByRole('dialog', { name: 'Search' });
	await expect(search).toBeVisible();
	expect(await fontSize('[role="dialog"] input')).toBeGreaterThanOrEqual(16);
	await page.keyboard.press('Escape');
	await expect(search).toBeHidden();

	const sheet = await openCardEditor(page, 'Lights');
	await expect(sheet.getByLabel('Title')).toBeVisible();
	expect(
		await sheet.getByLabel('Title').evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
	).toBeGreaterThanOrEqual(16);
});

test('the viewport meta asks the keyboard to resize the page', async ({ page }) => {
	await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
		'content',
		/interactive-widget=resizes-content/
	);
});

test('the edit bar publishes its height for the toasts above it', async ({ page }) => {
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	const bar = page.locator('.edit-bar');
	await expect(bar).toBeVisible();
	const height = (await bar.boundingBox())!.height;
	await expect
		.poll(() =>
			page.evaluate(() =>
				parseFloat(
					getComputedStyle(document.querySelector('.frame')!).getPropertyValue(
						'--h-edit-bar-height'
					)
				)
			)
		)
		.toBeCloseTo(height, 0);
});
