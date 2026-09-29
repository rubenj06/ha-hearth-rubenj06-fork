import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';

const FAKE_HASS = `http://127.0.0.1:${process.env.E2E_HASS_PORT ?? 8124}`;
const HEARTH_FILE = new URL('./fixture/data/hearth.yaml', import.meta.url);
const HEARTH_FIXTURE = readFileSync(HEARTH_FILE, 'utf8');

// the shared fixture plus a notifications widget and one rule on the front door
const WITH_ALERTS = HEARTH_FIXTURE.replace(
	'  - id: nav\n    type: nav\n',
	'  - id: nav\n    type: nav\n  - id: notifications\n    type: notifications\n'
).replace(
	'rooms:\n',
	`alerts:
  - id: door
    title: Front door open
    message: Close the front door.
    severity: warning
    for_seconds: 3
    conditions:
      - entity: binary_sensor.door
        state: "on"
rooms:
`
);

function fire(request: APIRequestContext, data: Record<string, unknown>) {
	return request.post(`${FAKE_HASS}/_test/fire_event`, { data });
}

test.beforeEach(async ({ page, request }) => {
	writeFileSync(HEARTH_FILE, WITH_ALERTS);
	await request.post(`${FAKE_HASS}/_test/reset`);
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Desk lamp/ })).toBeVisible();
	// the widget counts the fake server's one persistent notification
	await expect(page.getByRole('button', { name: 'Notifications (1)' })).toBeVisible();
});

test.afterEach(() => writeFileSync(HEARTH_FILE, HEARTH_FIXTURE));

test('a rule pops up once its condition has held and closes when it clears', async ({
	page,
	request
}) => {
	await request.post(`${FAKE_HASS}/_test/state`, {
		data: { entity_id: 'binary_sensor.door', state: 'on' }
	});
	const alert = page.getByRole('alertdialog', { name: 'Front door open' });
	await page.waitForTimeout(1000);
	await expect(alert).toHaveCount(0);
	await expect(alert).toBeVisible({ timeout: 5000 });
	await expect(alert).toContainText('Close the front door.');
	await expect(page.getByRole('button', { name: 'Notifications (2)' })).toBeAttached();

	await request.post(`${FAKE_HASS}/_test/state`, {
		data: { entity_id: 'binary_sensor.door', state: 'off' }
	});
	await expect(alert).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Notifications (1)' })).toBeVisible();
});

test('a dismissed rule alert stays away while the condition holds', async ({ page, request }) => {
	await request.post(`${FAKE_HASS}/_test/state`, {
		data: { entity_id: 'binary_sensor.door', state: 'on' }
	});
	const alert = page.getByRole('alertdialog', { name: 'Front door open' });
	await expect(alert).toBeVisible({ timeout: 5000 });
	await alert.getByRole('button', { name: 'Dismiss' }).click();
	await expect(alert).toHaveCount(0);
	await request.post(`${FAKE_HASS}/_test/state`, {
		data: { entity_id: 'binary_sensor.door', state: 'on', attributes: { battery: 90 } }
	});
	await page.waitForTimeout(2500);
	await expect(alert).toHaveCount(0);
});

test('Home Assistant raises and clears an alert by tag', async ({ page, request }) => {
	await fire(request, {
		action: 'alert',
		tag: 'washer',
		title: 'Washer finished',
		message: 'Move the laundry to the dryer.',
		severity: 'info'
	});
	const alert = page.getByRole('alertdialog', { name: 'Washer finished' });
	await expect(alert).toBeVisible();
	await expect(alert).toContainText('Move the laundry to the dryer.');

	await fire(request, { action: 'dismiss_alert', tag: 'washer' });
	await expect(alert).toHaveCount(0);
});

test('an event for another device is ignored', async ({ page, request }) => {
	await fire(request, { action: 'alert', title: 'Somewhere else', device: 'garage' });
	await fire(request, { action: 'alert', title: 'Everywhere' });
	await expect(page.getByRole('alertdialog', { name: 'Everywhere' })).toBeVisible();
	await expect(page.getByRole('alertdialog', { name: 'Somewhere else' })).toHaveCount(0);
});

test('Home Assistant opens and closes an entity popup', async ({ page, request }) => {
	await fire(request, { action: 'open_popup', entity: 'light.desk' });
	const sheet = page.getByRole('dialog', { name: 'Desk lamp' });
	await expect(sheet).toBeVisible();
	await fire(request, { action: 'close_popup', entity: 'light.shelf' });
	await page.waitForTimeout(300);
	await expect(sheet).toBeVisible();
	await fire(request, { action: 'close_popup', entity: 'light.desk' });
	await expect(sheet).toHaveCount(0);
});

test('the notifications widget lists alerts and notifications', async ({ page, request }) => {
	await fire(request, { action: 'alert', tag: 'quiet', title: 'Quiet alert', popup: false });
	const summary = page.getByRole('button', { name: 'Notifications (2)' });
	await expect(summary).toContainText('Quiet alert');
	await expect(page.getByRole('alertdialog')).toHaveCount(0);

	await summary.click();
	const list = page.getByRole('dialog', { name: 'Notifications' });
	await expect(list).toContainText('Quiet alert');
	await expect(list).toContainText('Filter reminder');
	await list.locator('[data-alert="event:quiet"]').getByRole('button', { name: 'Dismiss' }).click();
	await expect(list).not.toContainText('Quiet alert');
	await expect(page.getByRole('button', { name: 'Notifications (1)' })).toBeAttached();
	await page.keyboard.press('Escape');
	await expect(list).toHaveCount(0);
});

test('an entity opened from an alert is usable above the other alerts', async ({
	page,
	request
}) => {
	await fire(request, { action: 'alert', tag: 'other', title: 'Other alert' });
	await fire(request, {
		action: 'alert',
		tag: 'lamp',
		title: 'Lamp left on',
		entity: 'light.desk'
	});
	const lamp = page.getByRole('alertdialog', { name: 'Lamp left on' });
	await lamp.getByRole('button', { name: 'Open' }).click();

	const sheet = page.getByRole('dialog', { name: 'Desk lamp' });
	await expect(sheet).toBeVisible();
	await expect(page.getByRole('alertdialog')).toHaveCount(0);
	// clickable, not under a backdrop: the header switch reaches the light
	await sheet.getByRole('switch').click();
	await expect
		.poll(async () =>
			((await (await request.get(`${FAKE_HASS}/_test/calls`)).json()) as { data: object }[]).some(
				(call) => JSON.stringify(call.data).includes('light.desk')
			)
		)
		.toBe(true);

	await page.keyboard.press('Escape');
	await expect(sheet).toHaveCount(0);
	await expect(page.getByRole('alertdialog', { name: 'Other alert' })).toBeVisible();
	await expect(lamp).toHaveCount(0);
});

test('a popup Home Assistant opens is usable while an alert card is up', async ({
	page,
	request
}) => {
	await fire(request, { action: 'alert', tag: 'other', title: 'Other alert' });
	const card = page.getByRole('alertdialog', { name: 'Other alert' });
	await expect(card).toBeVisible();

	await fire(request, { action: 'open_popup', entity: 'light.desk' });
	const sheet = page.getByRole('dialog', { name: 'Desk lamp' });
	await expect(sheet).toBeVisible();
	await expect(card).toHaveCount(0);
	await sheet.getByRole('switch').click();
	await expect
		.poll(async () =>
			((await (await request.get(`${FAKE_HASS}/_test/calls`)).json()) as { data: object }[]).some(
				(call) => JSON.stringify(call.data).includes('light.desk')
			)
		)
		.toBe(true);

	await page.keyboard.press('Escape');
	await expect(sheet).toHaveCount(0);
	await expect(card).toBeVisible();
});

test('a popup Home Assistant opens replaces the open notifications list', async ({
	page,
	request
}) => {
	await page.getByRole('button', { name: 'Notifications (1)' }).click();
	const list = page.getByRole('dialog', { name: 'Notifications' });
	await expect(list).toBeVisible();

	await fire(request, { action: 'open_popup', entity: 'light.desk' });
	const sheet = page.getByRole('dialog', { name: 'Desk lamp' });
	await expect(sheet).toBeVisible();
	await expect(list).toHaveCount(0);
	await sheet.getByRole('switch').click();
	await expect
		.poll(async () =>
			((await (await request.get(`${FAKE_HASS}/_test/calls`)).json()) as { data: object }[]).some(
				(call) => JSON.stringify(call.data).includes('light.desk')
			)
		)
		.toBe(true);
});

test('an alert without a tag is named by its multi-word title', async ({ page, request }) => {
	await fire(request, { action: 'alert', title: 'Garage door left open', severity: 'critical' });
	const alert = page.getByRole('alertdialog', { name: 'Garage door left open' });
	await expect(alert).toBeVisible();
	await fire(request, { action: 'dismiss_alert', tag: 'Garage door left open' });
	await expect(alert).toHaveCount(0);
});
