import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

/*
 * Sidebar placement on a wide screen: one rail on either side, one on each,
 * or none, with the pages still reachable in every case.
 */

const HEARTH_FILE = new URL('./fixture/data/hearth.yaml', import.meta.url);
const HEARTH_FIXTURE = readFileSync(HEARTH_FILE, 'utf8');

function writeRail(position: string, clockSide?: 'right') {
	const clock = clockSide ? `    type: clock\n    side: ${clockSide}\n` : '    type: clock\n';
	writeFileSync(
		HEARTH_FILE,
		HEARTH_FIXTURE.replace('rail:\n', `rail_position: ${position}\nrail:\n`).replace(
			'    type: clock\n',
			clock
		)
	);
}

async function open(page: Page) {
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
}

async function box(page: Page, selector: string) {
	const found = await page.locator(selector).first().boundingBox();
	if (!found) throw new Error(`${selector} has no box`);
	return found;
}

async function dragWidget(page: Page, handle: Locator, target: Locator, targetY = 0.2) {
	const from = await handle.boundingBox();
	const to = await target.boundingBox();
	if (!from || !to) throw new Error('drag source or target has no box');
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	const endX = to.x + 40;
	const endY = to.y + to.height * targetY;
	const steps = 12;
	for (let step = 1; step <= steps; step += 1) {
		await page.mouse.move(
			from.x + ((endX - from.x) * step) / steps,
			from.y + ((endY - from.y) * step) / steps
		);
	}
	await page.mouse.up();
}

test.afterEach(() => writeFileSync(HEARTH_FILE, HEARTH_FIXTURE));

test('a right rail sits after the page and takes the edit toggle along', async ({ page }) => {
	writeRail('right');
	await open(page);
	await expect(page.locator('.rail-scroll')).toHaveCount(1);
	const rail = await box(page, '.rail-scroll');
	const main = await box(page, '.main');
	expect(rail.x).toBeGreaterThan(main.x + main.width - 40);
	await expect(page.locator('.rail-scroll [data-id="clock"]')).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Pages' })).toBeHidden();

	const toggle = (await page
		.getByRole('button', { name: 'Edit Hearth configuration' })
		.boundingBox())!;
	expect(toggle.x).toBeGreaterThan(640);
});

test('two rails each hold their own widgets and a new widget joins the rail it came from', async ({
	page
}) => {
	writeRail('both', 'right');
	await open(page);
	const rails = page.locator('.rail-scroll');
	await expect(rails).toHaveCount(2);
	await expect(rails.nth(0).locator('[data-id="nav"]')).toBeVisible();
	await expect(rails.nth(0).locator('[data-id="clock"]')).toHaveCount(0);
	await expect(rails.nth(1).locator('[data-id="clock"]')).toBeVisible();
	const left = await rails.nth(0).boundingBox();
	const right = await rails.nth(1).boundingBox();
	const main = await box(page, '.main');
	expect(left!.x).toBeLessThan(main.x);
	expect(right!.x).toBeGreaterThan(main.x + main.width - 40);

	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await rails.nth(1).getByRole('button', { name: 'Add widget' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add widget' });
	await sheet.getByRole('option', { name: /^Section label\b/ }).click();
	await expect(sheet.getByRole('button', { name: 'Right', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await sheet.getByLabel('Text').fill('Garden');
	await sheet.getByRole('button', { name: 'Done' }).click();
	await expect(sheet).toBeHidden();
	await expect(rails.nth(1).locator('[data-id="label"]')).toBeVisible();
	await expect(rails.nth(0).locator('[data-id="label"]')).toHaveCount(0);

	// moving it to the other side from its editor
	await rails.nth(1).locator('[data-id="label"]').getByRole('button', { name: 'Edit' }).click();
	const edit = page.getByRole('dialog', { name: 'Edit widget' });
	await edit.getByRole('button', { name: 'Left', exact: true }).click();
	await edit.getByRole('button', { name: 'Done' }).click();
	await expect(rails.nth(0).locator('[data-id="label"]')).toBeVisible();
	await expect(rails.nth(1).locator('[data-id="label"]')).toHaveCount(0);
});

test('with no rail the page switcher carries the pages', async ({ page }) => {
	writeRail('none');
	await open(page);
	await expect(page.locator('.rail-scroll')).toHaveCount(0);
	await expect(page.locator('[data-id="clock"]')).toHaveCount(0);
	const strip = page.getByRole('navigation', { name: 'Pages' });
	await expect(strip).toBeVisible();
	const office = strip.getByRole('button', { name: 'Office' });
	await expect(office).toHaveAttribute('aria-current', 'page');
	const nav = (await strip.boundingBox())!;
	const main = await box(page, '.main');
	expect(nav.y + nav.height).toBeLessThanOrEqual(main.y + 1);
});

test('a phone folds both rails into the page and drops a hidden one', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	writeRail('both', 'right');
	await open(page);
	await expect(page.locator('.rail-scroll')).toHaveCount(0);
	await expect(page.locator('.rail-run [data-id="clock"]')).toBeVisible();

	writeRail('none');
	await open(page);
	await expect(page.locator('[data-id="clock"]')).toHaveCount(0);
	await expect(page.getByRole('navigation', { name: 'Pages' })).toBeVisible();
});

test('the settings sheet switches the layout live', async ({ page }) => {
	await open(page);
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await page.getByRole('button', { name: 'Settings' }).click();
	const sheet = page.getByRole('dialog', { name: 'Settings' });
	const select = sheet.getByLabel('Sidebar');
	await expect(select).toHaveValue('left');

	await select.selectOption('none');
	await expect(page.locator('.rail-scroll')).toHaveCount(0);
	await expect(page.getByRole('navigation', { name: 'Pages' })).toBeVisible();

	await select.selectOption('both');
	await expect(page.locator('.rail-scroll')).toHaveCount(2);
	await expect(page.getByRole('navigation', { name: 'Pages' })).toBeHidden();
});

test('dragging a widget onto the other rail moves it there', async ({ page }) => {
	writeRail('both', 'right');
	await open(page);
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	const rails = page.locator('.rail-scroll');
	await dragWidget(
		page,
		rails.nth(1).locator('[data-id="clock"] .drag-handle'),
		rails.nth(0).locator('[data-id="nav"]')
	);
	await expect(rails.nth(0).locator('[data-id="clock"]')).toHaveCount(1);
	await expect(rails.nth(1).locator('[data-id="clock"]')).toHaveCount(0);
});

test('a folded drag across the two rails keeps the order it was dropped in', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	writeFileSync(
		HEARTH_FILE,
		HEARTH_FIXTURE.replace(
			'rail:\n',
			`rail_position: both
rail:
  - id: weather
    type: weather
    entity: weather.home
    side: right
`
		)
	);
	await open(page);
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	const top = page.locator('.rail-run').first();
	await expect(top.locator('.widget')).toHaveCount(2);
	// stored order puts the right rail's weather first; drag it below the clock
	await expect(top.locator('.widget').first()).toHaveAttribute('data-id', 'weather');
	await dragWidget(
		page,
		top.locator('[data-id="weather"] .drag-handle'),
		top.locator('[data-id="clock"]'),
		0.9
	);
	await expect(top.locator('.widget').first()).toHaveAttribute('data-id', 'clock');
	await expect(top.locator('.widget').nth(1)).toHaveAttribute('data-id', 'weather');
});

test('the position and a widget side survive a save and reload', async ({ page }) => {
	await open(page);
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await page.getByRole('button', { name: 'Settings' }).click();
	await page.getByRole('dialog', { name: 'Settings' }).getByLabel('Sidebar').selectOption('both');
	await page.keyboard.press('Escape');

	const rails = page.locator('.rail-scroll');
	await rails.nth(0).locator('[data-id="clock"]').getByRole('button', { name: 'Edit' }).click();
	const edit = page.getByRole('dialog', { name: 'Edit widget' });
	await edit.getByRole('button', { name: 'Right', exact: true }).click();
	await edit.getByRole('button', { name: 'Done' }).click();
	await expect(rails.nth(1).locator('[data-id="clock"]')).toBeVisible();

	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Saved')).toBeVisible();
	const saved = readFileSync(HEARTH_FILE, 'utf8');
	expect(saved).toContain('rail_position: both');
	expect(saved).toContain('side: right');

	await page.reload();
	await expect(rails).toHaveCount(2);
	await expect(rails.nth(1).locator('[data-id="clock"]')).toBeVisible();
	await expect(rails.nth(0).locator('[data-id="nav"]')).toBeVisible();
});

test('a widget keeps its side through a switch to one rail and back', async ({ page }) => {
	writeRail('both', 'right');
	await open(page);
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await page.getByRole('button', { name: 'Settings' }).click();
	const select = page.getByRole('dialog', { name: 'Settings' }).getByLabel('Sidebar');
	await select.selectOption('left');
	const rails = page.locator('.rail-scroll');
	await expect(rails).toHaveCount(1);
	await expect(rails.locator('[data-id="clock"]')).toHaveCount(1);
	await select.selectOption('both');
	await expect(rails).toHaveCount(2);
	await expect(rails.nth(1).locator('[data-id="clock"]')).toHaveCount(1);
	await expect(rails.nth(0).locator('[data-id="clock"]')).toHaveCount(0);
});

test('outside the editor an empty one of two rails gives its column to the page', async ({
	page
}) => {
	writeFileSync(HEARTH_FILE, HEARTH_FIXTURE.replace('rail:\n', 'rail_position: both\nrail:\n'));
	await open(page);
	await expect(page.locator('.rail-scroll')).toHaveCount(1);
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await expect(page.locator('.rail-scroll')).toHaveCount(2);
});
