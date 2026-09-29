import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HassEntities } from 'home-assistant-js-websocket';
import { hassEntity } from '$lib/core/ha/testing';
import { states } from '$lib/core/ha/entities';
import { health } from '$lib/core/ha/connection';
import { DEFAULT_HEARTH_CONFIG } from './config';
import {
	dismissAlert,
	handleHearthAction,
	parseHearthEvent,
	resetAlerts,
	setAlertHost,
	startAlerts,
	syncRules
} from './alertEngine';
import { openEntityDetail } from './details';
import { ALERT_SEVERITIES } from './model/alerts';
import { loadMarkdownRenderer } from './markdown';
import { layer } from '$lib/ui/layers';
import { conditionsHold } from './visibility';
import {
	activeAlerts,
	cancelEdit,
	enterEditMode,
	hearthConfig,
	hearthEditMode,
	popup,
	wakeScreen
} from './store';
import type { AlertRule } from './types';

const START = new Date('2026-09-27T12:00:00Z');

const fridge: AlertRule = {
	id: 'fridge',
	title: 'Fridge door open',
	severity: 'warning',
	conditions: [{ entity: 'binary_sensor.fridge_door', state: 'on' }],
	for_seconds: 120
};

function door(state: string, changedSecondsAgo = 0): HassEntities {
	const entity = hassEntity('binary_sensor.fridge_door', state);
	entity.last_changed = new Date(Date.now() - changedSecondsAgo * 1000).toISOString();
	return { 'binary_sensor.fridge_door': entity };
}

const host = {
	openDetail: openEntityDetail,
	holds: conditionsHold,
	layer,
	loadMarkdown: loadMarkdownRenderer
};
setAlertHost(host);

const keys = () => get(activeAlerts).map((alert) => alert.key);

describe('alert rules', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(START);
	});

	afterEach(() => {
		resetAlerts();
		popup.set(null);
		if (get(hearthEditMode)) cancelEdit();
		vi.useRealTimers();
	});

	it('raises an alert once the conditions have held for for_seconds', () => {
		syncRules([fridge], door('on'));
		expect(keys()).toEqual([]);
		vi.advanceTimersByTime(119_000);
		expect(keys()).toEqual([]);
		const wakes = get(wakeScreen);
		vi.advanceTimersByTime(1_000);
		expect(get(activeAlerts)).toMatchObject([
			{ key: 'rule:fridge', title: 'Fridge door open', severity: 'warning', popup: true }
		]);
		expect(get(wakeScreen)).toBe(wakes + 1);
	});

	it('never raises when the conditions stop holding before the delay runs out', () => {
		syncRules([fridge], door('on'));
		vi.advanceTimersByTime(60_000);
		syncRules([fridge], door('off'));
		vi.advanceTimersByTime(120_000);
		expect(keys()).toEqual([]);
	});

	it('counts the time the entity already spent in the state', () => {
		syncRules([fridge], door('on', 100));
		vi.advanceTimersByTime(20_000);
		expect(keys()).toEqual(['rule:fridge']);
	});

	it('times a change it saw live from the browser clock, however far off it is', () => {
		syncRules([fridge], door('off'));
		// the server stamps the change 100 s before what this browser thinks is now
		syncRules([fridge], door('on', 100));
		vi.advanceTimersByTime(119_000);
		expect(keys()).toEqual([]);
		vi.advanceTimersByTime(1_000);
		expect(keys()).toEqual(['rule:fridge']);
	});

	it('starts the wait over when an edit changes the delay or the conditions', () => {
		syncRules([fridge], door('off'));
		syncRules([fridge], door('on'));
		vi.advanceTimersByTime(60_000);
		syncRules([{ ...fridge, for_seconds: 300 }], door('on'));
		vi.advanceTimersByTime(120_000);
		expect(keys()).toEqual([]);
		vi.advanceTimersByTime(180_000);
		expect(keys()).toEqual(['rule:fridge']);

		syncRules([{ ...fridge, for_seconds: 10, title: 'Renamed' }], door('on'));
		expect(keys()).toEqual([]);
		vi.advanceTimersByTime(10_000);
		expect(get(activeAlerts)[0].title).toBe('Renamed');
	});

	it('starts a dismissed rule over when the door closed and reopened while disconnected', () => {
		hearthConfig.set({ ...structuredClone(DEFAULT_HEARTH_CONFIG), alerts: [fridge] });
		health.set('connected');
		const stop = startAlerts(host);
		states.set(door('on'));
		vi.advanceTimersByTime(120_000);
		dismissAlert('rule:fridge');
		expect(keys()).toEqual([]);

		health.set('lost');
		vi.advanceTimersByTime(30_000);
		health.set('connected');
		// the snapshot after the reconnect: closed and opened again 5 s ago
		states.set(door('on', 5));
		expect(keys()).toEqual([]);
		vi.advanceTimersByTime(114_000);
		expect(keys()).toEqual([]);
		vi.advanceTimersByTime(1_000);
		expect(keys()).toEqual(['rule:fridge']);

		stop();
		setAlertHost(host);
		health.set('booting');
		hearthConfig.set(structuredClone(DEFAULT_HEARTH_CONFIG));
	});

	it.each([
		['closed', 'off', []],
		['still open', 'on', ['rule:fridge']]
	])(
		'lets the snapshot decide a delay that ran out while disconnected (door %s)',
		(_label, state, expected) => {
			hearthConfig.set({ ...structuredClone(DEFAULT_HEARTH_CONFIG), alerts: [fridge] });
			health.set('connected');
			const stop = startAlerts(host);
			const snapshot = door('on');
			states.set(snapshot);
			health.set('lost');
			vi.advanceTimersByTime(120_000);
			expect(keys()).toEqual([]);

			health.set('connected');
			const entity = snapshot['binary_sensor.fridge_door'];
			states.set({ 'binary_sensor.fridge_door': { ...entity, state } });
			expect(keys()).toEqual(expected);

			stop();
			setAlertHost(host);
			health.set('booting');
			hearthConfig.set(structuredClone(DEFAULT_HEARTH_CONFIG));
		}
	);

	it('keeps a dismissed rule quiet across a reconnect when nothing changed', () => {
		hearthConfig.set({ ...structuredClone(DEFAULT_HEARTH_CONFIG), alerts: [fridge] });
		health.set('connected');
		const stop = startAlerts(host);
		const snapshot = door('on');
		states.set(snapshot);
		vi.advanceTimersByTime(120_000);
		dismissAlert('rule:fridge');
		health.set('lost');
		health.set('connected');
		states.set({ ...snapshot });
		vi.advanceTimersByTime(300_000);
		expect(keys()).toEqual([]);

		stop();
		setAlertHost(host);
		health.set('booting');
		hearthConfig.set(structuredClone(DEFAULT_HEARTH_CONFIG));
	});

	it('opens the popup of an entity rule that fired while editing once editing ends', () => {
		const rule = { ...fridge, for_seconds: undefined, entity: 'binary_sensor.fridge_door' };
		hearthConfig.set({ ...structuredClone(DEFAULT_HEARTH_CONFIG), alerts: [rule] });
		enterEditMode();
		const stop = startAlerts(host);
		states.set(door('on'));
		expect(get(activeAlerts)).toHaveLength(1);
		expect(get(popup)).toBeNull();
		cancelEdit();
		expect(get(popup)?.entity).toBe('binary_sensor.fridge_door');
		stop();
		setAlertHost(host);
		hearthConfig.set(structuredClone(DEFAULT_HEARTH_CONFIG));
	});

	it('clears the alert when the conditions stop holding', () => {
		syncRules([{ ...fridge, for_seconds: undefined }], door('on'));
		expect(keys()).toEqual(['rule:fridge']);
		syncRules([{ ...fridge, for_seconds: undefined }], door('off'));
		expect(keys()).toEqual([]);
	});

	it('keeps an alert without auto_close until it is dismissed', () => {
		const latched = { ...fridge, for_seconds: undefined, auto_close: false };
		syncRules([latched], door('on'));
		syncRules([latched], door('off'));
		expect(keys()).toEqual(['rule:fridge']);
		dismissAlert('rule:fridge');
		expect(keys()).toEqual([]);
	});

	it('stays quiet after a dismiss until the conditions clear, then arms again', () => {
		const rule = { ...fridge, for_seconds: 10 };
		syncRules([rule], door('on'));
		vi.advanceTimersByTime(10_000);
		dismissAlert('rule:fridge');
		expect(keys()).toEqual([]);
		syncRules([rule], door('on'));
		vi.advanceTimersByTime(60_000);
		expect(keys()).toEqual([]);

		syncRules([rule], door('off'));
		syncRules([rule], door('on'));
		vi.advanceTimersByTime(10_000);
		expect(keys()).toEqual(['rule:fridge']);
	});

	it('opens the entity popup for an entity rule and closes it when the rule clears', () => {
		const rule = { ...fridge, for_seconds: undefined, entity: 'binary_sensor.fridge_door' };
		syncRules([rule], door('on'));
		expect(get(popup)?.entity).toBe('binary_sensor.fridge_door');
		// the popup stands in for the card
		expect(get(activeAlerts)[0].popup).toBe(false);
		syncRules([rule], door('off'));
		expect(get(popup)).toBeNull();
	});

	it('leaves a popup for another entity open when a rule clears', () => {
		const rule = { ...fridge, for_seconds: undefined, entity: 'binary_sensor.fridge_door' };
		syncRules([rule], door('on'));
		popup.set({ kind: 'detail', entity: 'light.desk', name: 'Desk' });
		syncRules([rule], door('off'));
		expect(get(popup)?.entity).toBe('light.desk');
	});

	it('leaves a popup it did not open alone when a rule clears', () => {
		const quiet = {
			...fridge,
			for_seconds: undefined,
			popup: false,
			entity: 'binary_sensor.fridge_door'
		};
		syncRules([quiet], door('on'));
		expect(get(popup)).toBeNull();
		openEntityDetail('binary_sensor.fridge_door');
		syncRules([quiet], door('off'));
		expect(get(popup)?.entity).toBe('binary_sensor.fridge_door');
	});

	it('leaves the entity popup open when the user opened it again after the rule did', () => {
		const rule = { ...fridge, for_seconds: undefined, entity: 'binary_sensor.fridge_door' };
		syncRules([rule], door('on'));
		popup.set(null);
		openEntityDetail('binary_sensor.fridge_door');
		syncRules([rule], door('off'));
		expect(get(popup)?.entity).toBe('binary_sensor.fridge_door');
	});

	it('does not pop anything up while editing', () => {
		enterEditMode();
		const rule = { ...fridge, for_seconds: undefined, entity: 'binary_sensor.fridge_door' };
		syncRules([rule], door('on'));
		expect(get(popup)).toBeNull();
		expect(keys()).toEqual(['rule:fridge']);
	});

	it('drops the alert of a rule that was removed from the configuration', () => {
		syncRules([{ ...fridge, for_seconds: undefined }], door('on'));
		syncRules([], door('on'));
		expect(keys()).toEqual([]);
	});

	it('never raises a rule without conditions', () => {
		syncRules([{ ...fridge, conditions: [], for_seconds: undefined }], door('on'));
		expect(keys()).toEqual([]);
	});
});

describe('HEARTH events', () => {
	afterEach(() => {
		resetAlerts();
		popup.set(null);
	});

	it('reads an alert with defaults for what it leaves out', () => {
		expect(parseHearthEvent({ action: 'alert', title: ' Washer done ' }, '')).toEqual({
			action: 'alert',
			tag: 'Washer done',
			title: 'Washer done',
			message: undefined,
			icon: undefined,
			severity: 'info',
			popup: true,
			entity: undefined
		});
		expect(
			parseHearthEvent(
				{ action: 'alert', tag: 'washer', title: 'Done', severity: 'critical', popup: false },
				''
			)
		).toMatchObject({ tag: 'washer', severity: 'critical', popup: false });
	});

	it('accepts every severity a rule can have', () => {
		for (const severity of ALERT_SEVERITIES) {
			expect(parseHearthEvent({ action: 'alert', title: 'A', severity }, '')).toMatchObject({
				severity
			});
		}
	});

	it('ignores what it cannot act on', () => {
		expect(parseHearthEvent({ action: 'alert' }, '')).toBeNull();
		expect(parseHearthEvent({ action: 'dismiss_alert' }, '')).toBeNull();
		expect(parseHearthEvent({ action: 'open_popup' }, '')).toBeNull();
		expect(parseHearthEvent({ action: 'launch' }, '')).toBeNull();
		expect(parseHearthEvent({ event: 'refresh' }, '')).toBeNull();
	});

	it('only acts on events for this device when they name one', () => {
		const event = { action: 'close_popup', device: 'kitchen' };
		expect(parseHearthEvent(event, 'kitchen')).toEqual({ action: 'close_popup' });
		expect(parseHearthEvent(event, 'hall')).toBeNull();
		expect(parseHearthEvent(event, '')).toBeNull();
		expect(parseHearthEvent({ ...event, device: ['hall', 'kitchen'] }, 'kitchen')).not.toBeNull();
		expect(parseHearthEvent({ action: 'close_popup' }, 'hall')).not.toBeNull();
	});

	it('raises, replaces and dismisses event alerts by tag', () => {
		handleHearthAction(parseHearthEvent({ action: 'alert', tag: 'w', title: 'One' }, '')!);
		handleHearthAction(parseHearthEvent({ action: 'alert', tag: 'w', title: 'Two' }, '')!);
		expect(get(activeAlerts)).toMatchObject([{ key: 'event:w', title: 'Two' }]);
		handleHearthAction(parseHearthEvent({ action: 'dismiss_alert', tag: 'w' }, '')!);
		expect(get(activeAlerts)).toEqual([]);
	});

	it('dismisses an event alert on this screen', () => {
		handleHearthAction(parseHearthEvent({ action: 'alert', tag: 'w', title: 'One' }, '')!);
		dismissAlert('event:w');
		expect(get(activeAlerts)).toEqual([]);
	});

	it('opens a popup and closes only the one it names', () => {
		handleHearthAction(parseHearthEvent({ action: 'open_popup', entity: 'light.desk' }, '')!);
		expect(get(popup)?.entity).toBe('light.desk');
		handleHearthAction(parseHearthEvent({ action: 'close_popup', entity: 'light.shelf' }, '')!);
		expect(get(popup)?.entity).toBe('light.desk');
		handleHearthAction(parseHearthEvent({ action: 'close_popup', entity: 'light.desk' }, '')!);
		expect(get(popup)).toBeNull();
		handleHearthAction(parseHearthEvent({ action: 'open_popup', entity: 'light.desk' }, '')!);
		handleHearthAction(parseHearthEvent({ action: 'close_popup' }, '')!);
		expect(get(popup)).toBeNull();
	});
});
