import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/*
 * The YAML editor's file transfer and the saved versions behind it. A save is
 * what leaves a version, so each test makes one first rather than relying on
 * whatever the fixture directory has collected.
 */

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
});

/** The document the fixture server saves to, watched for writes a test forbids. */
const CONFIG_FILE = 'e2e/fixture/data/hearth.yaml';
const CONFIG_FIXTURE = readFileSync(CONFIG_FILE, 'utf8');

// saves and restores rewrite the shared fixture, which later specs read
test.afterEach(() => writeFileSync(CONFIG_FILE, CONFIG_FIXTURE));

async function openYamlEditor(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await page.getByRole('button', { name: 'Edit configuration YAML' }).click();
	return page.getByRole('dialog', { name: 'Configuration YAML' });
}

test('exports the dashboard as a YAML file', async ({ page }) => {
	const dialog = await openYamlEditor(page);
	await expect(dialog).toBeVisible();

	const download = page.waitForEvent('download');
	await dialog.getByRole('button', { name: 'Export file' }).click();

	expect((await download).suggestedFilename()).toMatch(/^hearth-\d{4}-\d{2}-\d{2}-\d{4}\.yaml$/);
});

test('loads an imported file into the editor without applying it', async ({ page }) => {
	const dialog = await openYamlEditor(page);
	const chooser = page.waitForEvent('filechooser');
	await dialog.getByRole('button', { name: 'Import file' }).click();
	await (
		await chooser
	).setFiles({
		name: 'imported.yaml',
		mimeType: 'text/yaml',
		buffer: Buffer.from(
			'version: 5\nrail:\n  - id: nav\n    type: nav\nrooms:\n  - id: den\n    name: Den\n    cards: [[]]\n'
		)
	});

	await expect(dialog.getByText('File loaded into the editor')).toBeVisible();
	await expect(dialog.locator('.cm-content')).toContainText('Den');
	// nothing reaches the dashboard until Apply
	await expect(page.locator('.rail').getByRole('button', { name: 'Den' })).toHaveCount(0);

	await dialog.getByRole('button', { name: 'Apply' }).click();
	await expect(page.locator('.rail').getByRole('button', { name: 'Den' })).toBeVisible();
});

test('shows a saved version against the dashboard and restores it', async ({ page }) => {
	// the save leaves the page list of this moment behind as a version
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('button', { name: 'Edit Hearth configuration' })).toBeVisible();

	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await page.getByRole('button', { name: 'Versions' }).click();

	const dialog = page.getByRole('dialog', { name: 'Versions' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('option', { name: /Saved file/ })).toBeVisible();

	// the saved file heads the list; the entries under it are the snapshots
	const version = dialog.getByRole('option').filter({ hasNotText: 'Saved file' }).first();
	await expect(version).toBeVisible();
	await version.click();
	await expect(dialog.locator('.cm-content')).toContainText('rooms');

	await dialog.getByRole('button', { name: 'Restore' }).click();
	await expect(dialog).toBeHidden();
	// a restore is an edit, so it is undoable and still unsaved
	await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

test('an unapplied YAML edit survives the trip through Versions', async ({ page }) => {
	const dialog = await openYamlEditor(page);
	const editor = dialog.locator('.cm-content');
	await editor.click();
	await page.keyboard.type('# a note that was never applied\n');
	await expect(editor).toContainText('a note that was never applied');

	await dialog.getByRole('button', { name: 'Versions' }).click();
	const versions = page.getByRole('dialog', { name: 'Versions' });
	await expect(versions).toBeVisible();

	await versions.getByRole('button', { name: 'Back' }).click();
	const reopened = page.getByRole('dialog', { name: 'Configuration YAML' });
	await expect(reopened).toBeVisible();
	await expect(reopened.locator('.cm-content')).toContainText('a note that was never applied');
});

test('a draft parked for Versions is dropped when Versions is closed', async ({ page }) => {
	const dialog = await openYamlEditor(page);
	await dialog.locator('.cm-content').click();
	await page.keyboard.type('# a note that was abandoned\n');

	await dialog.getByRole('button', { name: 'Versions' }).click();
	const versions = page.getByRole('dialog', { name: 'Versions' });
	await expect(versions).toBeVisible();
	// the header's text action and its close icon both read Close
	await versions.getByRole('button', { name: 'Close' }).last().click();
	await expect(versions).toBeHidden();

	// the abandoned draft would otherwise come back and overwrite the dashboard
	const reopened = await openYamlEditor(page);
	await expect(reopened.locator('.cm-content')).toContainText('rooms');
	await expect(reopened.locator('.cm-content')).not.toContainText('a note that was abandoned');
});

test('a restore leaves no draft behind for the next configuration edit', async ({ page }) => {
	// a page added and saved, so the snapshot the save leaves behind differs
	// from the dashboard and Restore has something to do
	await page.getByRole('button', { name: 'Add page' }).first().click();
	const pageSheet = page.getByRole('dialog', { name: 'Add page' });
	await pageSheet.getByLabel('Name').fill('Garage');
	await pageSheet.getByRole('button', { name: 'Done' }).click();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('button', { name: 'Edit Hearth configuration' })).toBeVisible();
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();

	const dialog = await openYamlEditor(page);
	await dialog.locator('.cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n# a note that lost to a restore');
	await dialog.getByRole('button', { name: 'Versions' }).click();

	const versions = page.getByRole('dialog', { name: 'Versions' });
	const version = versions.getByRole('option').filter({ hasNotText: 'Saved file' }).first();
	await version.click();
	await versions.getByRole('button', { name: 'Restore' }).click();
	await expect(versions).toBeHidden();

	// the restore is what the next open must show, not the note left in the box
	const reopened = await openYamlEditor(page);
	await expect(reopened.locator('.cm-content')).toContainText('rooms');
	await expect(reopened.locator('.cm-content')).not.toContainText('a note that lost to a restore');
	await expect(reopened.locator('.cm-content')).not.toContainText('Garage');
});

test('the editor save shortcut applies the draft without writing the file', async ({ page }) => {
	const saved = readFileSync(CONFIG_FILE, 'utf8');
	const dialog = await openYamlEditor(page);
	await dialog.locator('.cm-content').click();
	// past the end of the document, so the comment cannot split a key in two
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n# applied with the keyboard');
	await expect(dialog.locator('.cm-content')).toContainText('applied with the keyboard');
	await page.keyboard.press('ControlOrMeta+s');

	await expect(dialog).toBeHidden();
	// the shortcut applies the draft; the dashboard's own Ctrl-S behind it
	// would have written the file, which only the edit bar is allowed to do
	await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
	// a leaked shortcut writes through the network, so give it the time it
	// would need before calling the file untouched
	await page.waitForTimeout(1000);
	expect(readFileSync(CONFIG_FILE, 'utf8')).toBe(saved);
});
