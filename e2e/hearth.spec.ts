import { readFileSync, writeFileSync } from 'node:fs';
import { load as parseYaml } from 'js-yaml';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const FAKE_HASS = `http://127.0.0.1:${process.env.E2E_HASS_PORT ?? 8124}`;
const HEARTH_FILE = new URL('./fixture/data/hearth.yaml', import.meta.url);
const HEARTH_FIXTURE = readFileSync(HEARTH_FILE, 'utf8');

interface ServiceCall {
	domain: string;
	service: string;
	data: Record<string, unknown>;
}

async function serviceCalls(request: APIRequestContext): Promise<ServiceCall[]> {
	return (await request.get(`${FAKE_HASS}/_test/calls`)).json();
}

async function callsFor(request: APIRequestContext, entityId: string) {
	return (await serviceCalls(request)).filter((call) => call.data.entity_id === entityId);
}

async function dragAcross(page: Page, tile: Locator, from: number, to: number) {
	const box = await tile.boundingBox();
	if (!box) throw new Error('tile has no box');
	const y = box.y + box.height / 2;
	await page.mouse.move(box.x + box.width * from, y);
	await page.mouse.down();
	const steps = 8;
	for (let step = 1; step <= steps; step += 1) {
		const fraction = from + ((to - from) * step) / steps;
		await page.mouse.move(box.x + box.width * fraction, y);
	}
	return { box, y };
}

test.beforeEach(async ({ page, request }) => {
	await request.post(`${FAKE_HASS}/_test/reset`);
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
});

test('the edit toggle sits inside the viewport', async ({ page }) => {
	await expect(page.getByRole('button', { name: 'Edit Hearth configuration' })).toBeInViewport();
});

test('serves Hearth branding at the root and has no alternate dashboard route', async ({
	page,
	request
}) => {
	await expect(page).toHaveTitle('Hearth');
	expect((await request.get('/hearth')).status()).toBe(404);
	const manifest = await (await request.get('/hearth.webmanifest')).json();
	expect(manifest.name).toBe('Hearth');
	for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
});

test('keeps page response headers under the 4k nginx proxy buffer', async ({ request }) => {
	const response = await request.get('/');
	const headers = response.headersArray();
	expect(headers.find(({ name }) => name.toLowerCase() === 'link')).toBeUndefined();
	const size = headers.reduce(
		(total, { name, value }) => total + name.length + value.length + 4,
		0
	);
	expect(size).toBeLessThan(2048);
	const head = (await response.text()).split('</head>')[0];
	expect(head).toMatch(/<link href="[^"]+\.js" rel="modulepreload">/);
	expect(head).toMatch(/<link href="[^"]+\.css" rel="preload" as="style">/);
});

test('boots against the entity snapshot and shows live state', async ({ page }) => {
	await expect(page.getByRole('button', { name: /Ceiling fan/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect(page.getByText('21.5')).toBeVisible();
});

test('a tap toggles the light and the tile follows the confirmed state', async ({
	page,
	request
}) => {
	const tile = page.getByRole('button', { name: /Desk lamp/ });
	await tile.click();
	await expect
		.poll(() => callsFor(request, 'light.desk'))
		.toEqual([{ domain: 'light', service: 'toggle', data: { entity_id: 'light.desk' } }]);
	await expect(tile).toHaveAttribute('aria-pressed', 'true');
});

test('a horizontal drag sets brightness from the release point', async ({ page, request }) => {
	const tile = page.getByRole('button', { name: /Desk lamp/ });
	await dragAcross(page, tile, 0.15, 0.7);
	await page.mouse.up();
	// the drag throttles intermediate calls; the release commits the endpoint last
	await expect
		.poll(async () => (await callsFor(request, 'light.desk')).at(-1)?.data.brightness_pct)
		.toBeGreaterThanOrEqual(65);
	const last = (await callsFor(request, 'light.desk')).at(-1);
	expect(last).toMatchObject({ domain: 'light', service: 'turn_on' });
	expect(last?.data.brightness_pct).toBeLessThanOrEqual(75);
	await expect(tile).toHaveAttribute('aria-pressed', 'true');
	await expect(tile).toContainText('%');
});

test('a cancelled gesture sends nothing in release mode', async ({ page, request }) => {
	const tile = page.getByRole('button', { name: /Shelf lamp/ });
	await dragAcross(page, tile, 0.2, 0.9);
	// the browser takes the pointer for scrolling: no command may follow
	await tile.dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
	await page.mouse.up();
	await page.waitForTimeout(500);
	expect(await callsFor(request, 'light.shelf')).toEqual([]);
});

test('a long press opens the light sheet and Escape closes it', async ({ page }) => {
	const tile = page.getByRole('button', { name: /Desk lamp/ });
	const box = await tile.boundingBox();
	if (!box) throw new Error('tile has no box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(700);
	await page.mouse.up();
	const toggle = page.getByRole('switch', { name: 'Toggle light' });
	await expect(toggle).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(toggle).toBeHidden();
});

test('edit mode loads the card editor on demand', async ({ page }) => {
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await page
		.locator('.card-slot', { hasText: 'Lights' })
		.getByRole('button', { name: 'Edit' })
		.click();
	const sheet = page.getByRole('dialog', { name: 'Edit card' });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByLabel('Title')).toHaveValue('Lights');
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
});

async function openCardEditor(page: Page, title: string) {
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await page
		.locator('.card-slot', { hasText: title })
		.getByRole('button', { name: 'Edit' })
		.click();
	return page.getByRole('dialog', { name: 'Edit card' });
}

test('adds a card and a widget from the galleries', async ({ page }) => {
	await page.getByRole('button', { name: 'Edit Hearth configuration' }).click();
	await page.getByRole('button', { name: 'Add card' }).click();
	const cardSheet = page.getByRole('dialog', { name: 'Add card' });
	await expect(cardSheet).toBeVisible();
	await cardSheet.getByRole('option', { name: /^Entities\b/ }).click();
	await cardSheet.getByRole('button', { name: 'Done' }).click();
	// a card without entities renders its setup placeholder
	await expect(page.locator('.card-slot')).toHaveCount(3);
	await expect(page.getByText('Configure Entities')).toBeVisible();

	await page.getByRole('button', { name: 'Add widget' }).click();
	const widgetSheet = page.getByRole('dialog', { name: 'Add widget' });
	await expect(widgetSheet).toBeVisible();
	await widgetSheet.getByRole('option', { name: /^Clock\b/ }).click();
	await widgetSheet.getByRole('button', { name: 'Done' }).click();
	await expect(widgetSheet).toBeHidden();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
});

test.describe('saving', () => {
	// saves land in the fixture directory; put the file back after each test
	test.afterEach(() => writeFileSync(HEARTH_FILE, HEARTH_FIXTURE));

	test('rejects unsupported documents visibly and prevents editing them', async ({ page }) => {
		writeFileSync(HEARTH_FILE, HEARTH_FIXTURE.replace('version: 5', 'version: 4'));
		await page.reload();
		await expect(page.getByText(/configuration version 4 is unsupported/)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit Hearth configuration' })).toHaveCount(0);
		expect(readFileSync(HEARTH_FILE, 'utf8')).toContain('version: 4');
	});

	test('a saved edit survives a reload', async ({ page }) => {
		const sheet = await openCardEditor(page, 'Lights');
		await sheet.getByLabel('Title').fill('Lamps');
		await sheet.getByRole('button', { name: 'Done' }).click();
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.getByText('Saved')).toBeVisible();
		await page.reload();
		await expect(page.getByText('Lamps')).toBeVisible();
	});

	test('a save from another tab is reported and can be overwritten', async ({ page, request }) => {
		const sheet = await openCardEditor(page, 'Lights');
		await sheet.getByLabel('Title').fill('Mine');
		await sheet.getByRole('button', { name: 'Done' }).click();

		const other = parseYaml(HEARTH_FIXTURE) as { revision: number } & Record<string, unknown>;
		const { revision, ...config } = other;
		await request.post('/_api/save_hearth', {
			data: { revision, config: { ...config, padding_x: 7 } }
		});

		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.getByText('Configuration changed elsewhere')).toBeVisible();
		await page.getByRole('button', { name: 'Overwrite' }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Overwrite' }).click();
		await expect(page.getByText('Saved')).toBeVisible();
		await page.reload();
		await expect(page.getByText('Mine')).toBeVisible();
	});
});

test.describe('camera playback', () => {
	test.afterEach(() => writeFileSync(HEARTH_FILE, HEARTH_FIXTURE));

	test('streams a WebRTC-only camera over WebRTC and leaves a snapshot camera alone', async ({
		page,
		request
	}) => {
		writeFileSync(
			HEARTH_FILE,
			HEARTH_FIXTURE.replace(
				'            - entity: sensor.temperature\n',
				`            - entity: sensor.temperature
      - - id: door-camera
          type: camera
          entity: camera.door
          title: Door camera
          stream: true
        - id: front-camera
          type: camera
          entity: camera.front
          title: Front camera
          stream: true
`
			)
		);
		await page.reload();
		await expect(page.getByText('Door camera')).toBeVisible();
		const requests = async () =>
			(await (await request.get(`${FAKE_HASS}/_test/camera`)).json()) as {
				type: string;
				entity_id: string;
			}[];
		await expect
			.poll(async () =>
				(await requests())
					.filter((message) => message.entity_id === 'camera.door')
					.map((message) => message.type)
			)
			.toEqual(['camera/capabilities', 'camera/webrtc/get_client_config', 'camera/webrtc/offer']);
		expect(
			(await requests())
				.filter((message) => message.entity_id === 'camera.front')
				.map((message) => message.type)
		).toEqual(['camera/capabilities']);
		await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
	});
});
