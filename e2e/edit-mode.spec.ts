import { expect, test, type Page } from '@playwright/test';

/*
 * Edit-mode sweep: every card and widget type goes through its gallery entry,
 * editor and Done, and every sheet opens and closes, with the page error log
 * asserted empty at the end. Cheap insurance for the on-demand editors.
 */

const CARD_NAMES = [
	'Entities',
	'Header',
	'Sensor',
	'Media',
	'Vacuum',
	'Camera',
	'Image',
	'Climate',
	'Scenes',
	'Days since',
	'Now playing'
];
const WIDGET_NAMES = [
	'Clock',
	'Weather',
	'Page navigation',
	'Search',
	'Spacer',
	'Section label',
	'Energy today',
	'Progress',
	'Calendar',
	'Status pill',
	'Entity',
	'Chart',
	'Template',
	'Timer',
	'Notifications',
	'Web page'
];

function collectPageErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	return errors;
}

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
});

test('every card type opens its editor and lands on the page', async ({ page }) => {
	const errors = collectPageErrors(page);
	for (const name of CARD_NAMES) {
		await page.getByRole('button', { name: 'Add card' }).click();
		const sheet = page.getByRole('dialog', { name: 'Add card' });
		await expect(sheet).toBeVisible();
		// a new card opens on the type gallery; picking a kind collapses it
		await sheet.getByRole('option', { name: new RegExp(`^${name}\\b`) }).click();
		await expect(sheet.getByRole('button', { name: /Card type/ })).toBeVisible();
		await sheet.getByRole('button', { name: 'Done' }).click();
		await expect(sheet).toBeHidden();
	}
	await expect(page.locator('.card-slot')).toHaveCount(2 + CARD_NAMES.length);
	expect(errors).toEqual([]);
});

test('every widget type opens its editor and lands in the rail', async ({ page }) => {
	const errors = collectPageErrors(page);
	for (const name of WIDGET_NAMES) {
		await page.getByRole('button', { name: 'Add widget' }).click();
		const sheet = page.getByRole('dialog', { name: 'Add widget' });
		await expect(sheet).toBeVisible();
		await sheet.getByRole('option', { name: new RegExp(`^${name}\\b`) }).click();
		await sheet.getByRole('button', { name: 'Done' }).click();
		await expect(sheet).toBeHidden();
	}
	expect(errors).toEqual([]);
});

test('pages, stacks and the settings sheets open and close', async ({ page }) => {
	const errors = collectPageErrors(page);

	await page.getByRole('button', { name: 'Add page' }).first().click();
	const pageSheet = page.getByRole('dialog', { name: 'Add page' });
	await pageSheet.getByLabel('Name').fill('Garage');
	await pageSheet.getByRole('button', { name: 'Done' }).click();
	await page
		.getByRole('button', { name: /Garage/ })
		.first()
		.click();

	await page.getByRole('button', { name: 'Add stack' }).click();
	const stackSheet = page.getByRole('dialog', { name: 'Add stack' });
	await expect(stackSheet).toBeVisible();
	await stackSheet.getByRole('button', { name: 'Done' }).click();
	await expect(stackSheet).toBeHidden();
	await expect(page.locator('.stack-slot')).toHaveCount(1);

	for (const [button, title] of [
		['Settings', 'Settings'],
		['Theme', 'Theme']
	] as const) {
		await page.getByRole('button', { name: button }).click();
		const sheet = page.getByRole('dialog', { name: title });
		await expect(sheet).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
	}

	await page.getByRole('button', { name: 'Settings' }).click();
	await page.getByRole('button', { name: /Application settings/ }).click();
	const appSheet = page.getByRole('dialog', { name: 'Application settings' });
	await expect(appSheet).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(appSheet).toBeHidden();

	await page.getByRole('button', { name: 'Settings' }).click();
	await page.getByRole('button', { name: /Edit configuration YAML/ }).click();
	const yamlSheet = page.getByRole('dialog', { name: 'Configuration YAML' });
	await expect(yamlSheet).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(yamlSheet).toBeHidden();

	await page.getByRole('button', { name: 'Undo' }).click();
	await page.getByRole('button', { name: 'Redo' }).click();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
	await expect(page.getByRole('button', { name: 'Edit Hearth configuration' })).toBeVisible();
	expect(errors).toEqual([]);
});

test('the theme editor floats over the dashboard and drags by its header', async ({ page }) => {
	const errors = collectPageErrors(page);

	await page.getByRole('button', { name: 'Theme' }).click();
	const sheet = page.getByRole('dialog', { name: 'Theme' });
	await expect(sheet).toBeVisible();
	// not modal: the dashboard behind it stays live for the preview
	await expect(sheet).toHaveAttribute('aria-modal', 'false');
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
	expect(await sheet.locator('.body').evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(
		0
	);

	const before = await sheet.boundingBox();
	const handle = await sheet.locator('.header').boundingBox();
	if (!before || !handle) throw new Error('theme window has no box');

	await page.mouse.move(handle.x + 40, handle.y + handle.height / 2);
	await page.mouse.down();
	await page.mouse.move(handle.x + 40 - 400, handle.y + handle.height / 2 + 200, { steps: 10 });
	await page.mouse.up();

	const after = await sheet.boundingBox();
	if (!after) throw new Error('theme window has no box after the drag');
	expect(before.x - after.x).toBeGreaterThan(300);
	expect(after.y - before.y).toBeGreaterThan(150);

	// a preset repaints the dashboard behind the window rather than a preview pane
	await sheet.getByRole('button', { name: 'Void (OLED)' }).click();
	await expect(page.locator('.frame')).toHaveCSS('--h-bg-1', '#000000');

	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
	expect(errors).toEqual([]);
});

test('an uploaded image backs a header card and the theme', async ({ page }) => {
	const errors = collectPageErrors(page);
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
		'base64'
	);

	await page.getByRole('button', { name: 'Add card' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add card' });
	await sheet.getByRole('option', { name: /^Header\b/ }).click();
	await sheet
		.locator('input[type="file"]')
		.setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: png });
	// re-encoded in the browser before it is sent
	await expect(sheet.getByLabel('Background image')).toHaveValue(
		/^hearth-images\/[a-f0-9]{32}\.webp$/
	);
	await sheet.getByRole('button', { name: 'Done' }).click();

	const backdrop = page.locator('.header.banner img.backdrop');
	await expect(backdrop).toBeVisible();
	await expect
		.poll(() => backdrop.evaluate((image: HTMLImageElement) => image.naturalWidth))
		.toBeGreaterThan(0);

	await page.getByRole('button', { name: 'Theme' }).click();
	const theme = page.getByRole('dialog', { name: 'Theme' });
	await theme.getByRole('button', { name: 'Uploaded images' }).click();
	await theme
		.getByRole('button', { name: /^Use this image/ })
		.first()
		.click();
	await expect(page.locator('.frame')).toHaveCSS(
		'--h-bg-image',
		/^url\("http:\/\/[^"]+\/_api\/hearth_images\/[a-f0-9]{32}\.webp"\)$/
	);

	expect(errors).toEqual([]);
});

test('the colour picker edits a knob in place and previews it live', async ({ page }) => {
	const errors = collectPageErrors(page);

	await page.getByRole('button', { name: 'Theme' }).click();
	const sheet = page.getByRole('dialog', { name: 'Theme' });
	await expect(sheet).toBeVisible();

	const accent = sheet.getByRole('button', { name: /^Accent/ });
	await accent.scrollIntoViewIfNeeded();
	await accent.click();

	// the native OS colour panel is gone; the picker lives in the sheet
	await expect(sheet.locator('input[type="color"]')).toHaveCount(0);
	const area = sheet.locator('.area');
	await expect(area).toBeVisible();
	expect(await sheet.locator('.body').evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(
		0
	);

	// dragging the saturation square repaints the dashboard behind the window
	const box = await area.boundingBox();
	if (!box) throw new Error('the saturation square has no box');
	await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.35, { steps: 8 });
	await page.mouse.up();
	await expect(sheet.locator('.hex input')).not.toHaveValue('f0b860');

	// a typed hex commits on change and lands on the token
	await sheet.locator('.hex input').fill('3366ff');
	await sheet.locator('.hex input').blur();
	await expect(page.locator('.frame')).toHaveCSS('--h-accent-rgb', '51 102 255');

	// and the square is reachable without a pointer
	await area.focus();
	await area.press('ArrowLeft');
	await expect(sheet.locator('.hex input')).not.toHaveValue('3366ff');

	expect(errors).toEqual([]);
});

test('text contrast and shadow are adjustable from the theme editor', async ({ page }) => {
	const errors = collectPageErrors(page);
	const frame = page.locator('.frame');

	await page.getByRole('button', { name: 'Theme' }).click();
	const sheet = page.getByRole('dialog', { name: 'Theme' });
	await expect(sheet).toBeVisible();

	// text sits flat until a theme asks for a shadow
	await expect(frame).toHaveCSS('--h-text-shadow', 'none');
	const faint = await frame.evaluate((node) =>
		getComputedStyle(node).getPropertyValue('--h-text-5').trim()
	);

	await sheet.getByLabel('Text contrast').selectOption('max');
	const raised = await frame.evaluate((node) =>
		getComputedStyle(node).getPropertyValue('--h-text-5').trim()
	);
	expect(raised).not.toBe(faint);

	await sheet.getByLabel('Text shadow').selectOption('strong');
	await expect(frame).not.toHaveCSS('--h-text-shadow', 'none');

	// and the muted step is editable on its own, not only through the ink
	const muted = sheet.getByRole('button', { name: /^Muted text/ });
	await muted.scrollIntoViewIfNeeded();
	await muted.click();
	await sheet.locator('.hex input').fill('c8d2dc');
	await sheet.locator('.hex input').blur();
	await expect(frame).toHaveCSS('--h-text-4', '#c8d2dc');

	expect(errors).toEqual([]);
});
