import { derived, get } from 'svelte/store';
import type { HassEntities } from 'home-assistant-js-websocket';
import { deviceName } from '$lib/core/app/device';
import { health, subscribeHearthEvents } from '$lib/core/ha/connection';
import { states } from '$lib/core/ha/entities';
import {
	activeAlerts,
	closePopup,
	hearthConfig,
	hearthEditMode,
	popup,
	requestWake,
	type HearthAlert,
	type Popup
} from './store';
import type { AlertRule, AlertSeverity, VisibilityCondition } from './types';

/*
 * Raises and clears alerts. Rules from the configuration are checked against
 * entity states on every change; Home Assistant raises and clears the rest
 * through HEARTH events. Dismissing is per screen and kept in memory only: a
 * dismissed rule stays quiet until its conditions stop holding, then arms
 * again.
 */

/*
 * What the engine and its surfaces use from modules the page has already
 * loaded. They are handed in by the dashboard instead of imported: a lazy
 * chunk importing a module the page also imports makes the bundler split
 * that module into a chunk of its own, which costs the first load more
 * than the alert code does.
 */
export interface AlertHost {
	openDetail: (entityId: string, name?: string) => void;
	/** Whether visibility conditions hold for these states (visibility.ts). */
	holds: (conditions: VisibilityCondition[], $states: HassEntities | undefined) => boolean;
	layer: typeof import('$lib/ui/layers').layer;
	loadMarkdown: typeof import('./markdown').loadMarkdownRenderer;
}

let host: AlertHost | undefined;

export function setAlertHost(services: AlertHost | undefined) {
	host = services;
}

// kept in step with ALERT_SEVERITIES in model/alerts.ts, which is not imported for the reason above
const SEVERITIES = new Set<unknown>(['info', 'warning', 'critical']);

function isAlertSeverity(value: unknown): value is AlertSeverity {
	return SEVERITIES.has(value);
}

interface RuleState {
	rule: AlertRule;
	/** pending: holding, waiting out for_seconds. acknowledged: dismissed while still holding. */
	phase: 'pending' | 'active' | 'acknowledged';
	holding: boolean;
	since: number;
	/** The latest last_changed among the rule's entities seen while it held, server clock. */
	changed: number;
	/**
	 * The popup this activation opened. Only that popup is closed when the rule
	 * clears; one the user or Home Assistant opened for the entity stays.
	 */
	opened?: Popup | null;
	/** The delay ran out while disconnected; the first snapshot after the reconnect decides. */
	awaitingReconnect?: boolean;
	timer?: ReturnType<typeof setTimeout>;
}

const rules = new Map<string, RuleState>();
// insertion order is arrival order; a repeated tag moves to the end
const events = new Map<string, HearthAlert>();
let published = '[]';
// true until the first states after a start or a reconnect have been checked
let catchingUp = true;
// entity rules that fired while editing; their popups open once editing ends
const deferred = new Set<string>();

function publish() {
	const raised: HearthAlert[] = [];
	for (const [id, { rule, phase, since }] of rules) {
		if (phase !== 'active') continue;
		raised.push({
			key: `rule:${id}`,
			title: rule.title,
			message: rule.message,
			icon: rule.icon,
			severity: rule.severity,
			// an entity rule pops up the entity's own popup instead of a card
			popup: rule.popup !== false && !rule.entity,
			entity: rule.entity,
			since
		});
	}
	raised.push(...events.values());
	raised.sort((a, b) => b.since - a.since);
	// rules are checked on every state change; most of them change nothing
	const serialized = JSON.stringify(raised);
	if (serialized === published) return;
	published = serialized;
	activeAlerts.set(raised);
}

function conditionEntities(conditions: VisibilityCondition[]): string[] {
	return conditions.flatMap((condition) =>
		'or' in condition
			? conditionEntities(condition.or)
			: 'entity' in condition
				? [condition.entity]
				: []
	);
}

/*
 * Conditions read states only, so they cannot have changed since the latest
 * last_changed among their entities: the conditions have held at least that
 * long. After a reload this keeps a door that has been open for ten minutes
 * from waiting out the full delay again. last_changed is the server's clock,
 * so a browser clock that is off would shorten every delay; it is only
 * consulted for states that changed while nobody was watching (see
 * catchingUp), never for a change seen live.
 */
function latestChange(conditions: VisibilityCondition[], $states: HassEntities | undefined) {
	const changes = conditionEntities(conditions)
		.map((id) => Date.parse($states?.[id]?.last_changed ?? ''))
		.filter((time) => Number.isFinite(time));
	return changes.length ? Math.max(...changes) : -Infinity;
}

function heldFor(conditions: VisibilityCondition[], $states: HassEntities | undefined): number {
	const latest = latestChange(conditions, $states);
	return Number.isFinite(latest) ? Math.max(0, Date.now() - latest) : 0;
}

function ruleHolds(rule: AlertRule, $states: HassEntities | undefined): boolean {
	return rule.conditions.length > 0 && (host?.holds(rule.conditions, $states) ?? false);
}

function closeOwnPopup(entry: RuleState) {
	if (entry.opened && get(popup) === entry.opened) closePopup();
	entry.opened = undefined;
}

function openOwnPopup(entry: RuleState) {
	if (!entry.rule.entity) return;
	host?.openDetail(entry.rule.entity);
	entry.opened = get(popup);
	requestWake();
}

function activate(id: string) {
	const entry = rules.get(id);
	if (!entry) return;
	entry.timer = undefined;
	// the states are stale while the socket is down; the door may be shut by now
	if (get(health) === 'lost') {
		entry.awaitingReconnect = true;
		return;
	}
	entry.awaitingReconnect = false;
	entry.phase = 'active';
	entry.since = Date.now();
	publish();
	const { rule } = entry;
	if (rule.popup === false) return;
	if (get(hearthEditMode)) {
		if (rule.entity) deferred.add(id);
		return;
	}
	if (rule.entity) openOwnPopup(entry);
	else requestWake();
}

function openDeferred() {
	for (const id of deferred) {
		const entry = rules.get(id);
		if (entry?.phase === 'active') openOwnPopup(entry);
	}
	deferred.clear();
}

/** Whether an edit changed what a rule waits for, so its timing starts over. */
function timingChanged(before: AlertRule, after: AlertRule): boolean {
	return (
		before.for_seconds !== after.for_seconds ||
		JSON.stringify(before.conditions) !== JSON.stringify(after.conditions)
	);
}

function forget(id: string) {
	clearTimeout(rules.get(id)?.timer);
	rules.delete(id);
	deferred.delete(id);
}

/** Brings every rule's state up to date with the configured rules and the current states. */
export function syncRules(configured: AlertRule[], $states: HassEntities | undefined) {
	const seen = new Set<string>();
	const activating: string[] = [];
	const fromHistory = catchingUp;
	// while the socket is down the states are the old ones, not the catch-up
	if ($states && get(health) !== 'lost') catchingUp = false;
	for (const rule of configured) {
		seen.add(rule.id);
		const holds = ruleHolds(rule, $states);
		let entry = rules.get(rule.id);
		const latest = latestChange(rule.conditions, $states);
		/*
		 * A snapshot after a reconnect whose entities changed since this rule
		 * last looked means the conditions may have stopped holding and started
		 * again unseen: the rule starts over, dismissed or not. Both sides of
		 * the comparison are server timestamps.
		 */
		const missedChange =
			fromHistory &&
			holds &&
			!!entry &&
			latest > entry.changed &&
			!(entry.phase === 'active' && rule.auto_close === false);
		if (entry && (missedChange || timingChanged(entry.rule, rule))) {
			forget(rule.id);
			closeOwnPopup(entry);
			entry = undefined;
		}
		if (entry) {
			entry.rule = rule;
			entry.holding = holds;
			if (holds) entry.changed = Math.max(entry.changed, latest);
			if (holds && fromHistory && entry.awaitingReconnect) activating.push(rule.id);
		}
		if (holds && !entry) {
			const elapsed = fromHistory ? heldFor(rule.conditions, $states) : 0;
			const delay = (rule.for_seconds ?? 0) * 1000 - elapsed;
			const created: RuleState = {
				rule,
				phase: 'pending',
				holding: true,
				since: 0,
				changed: latest
			};
			rules.set(rule.id, created);
			if (delay > 0) created.timer = setTimeout(() => activate(rule.id), delay);
			else activating.push(rule.id);
		} else if (!holds && entry) {
			// a latched alert (auto_close off) waits for a dismiss instead
			if (entry.phase === 'active' && rule.auto_close === false) continue;
			forget(rule.id);
			closeOwnPopup(entry);
		}
	}
	for (const id of [...rules.keys()]) if (!seen.has(id)) forget(id);
	publish();
	for (const id of activating) activate(id);
}

export function dismissAlert(key: string) {
	const [source, ...rest] = key.split(':');
	const id = rest.join(':');
	if (source === 'rule') {
		const entry = rules.get(id);
		if (!entry) return;
		if (entry.holding) {
			clearTimeout(entry.timer);
			entry.phase = 'acknowledged';
		} else forget(id);
	} else events.delete(id);
	publish();
}

export type HearthAction =
	| {
			action: 'alert';
			tag: string;
			title: string;
			message?: string;
			icon?: string;
			severity: AlertSeverity;
			popup: boolean;
			entity?: string;
	  }
	| { action: 'dismiss_alert'; tag: string }
	| { action: 'open_popup'; entity: string; name?: string }
	| { action: 'close_popup'; entity?: string };

function text(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Whether an event's `device` (a name or a list of names) includes this screen. */
function forThisDevice(target: unknown, device: string): boolean {
	if (target === undefined || target === null) return true;
	const names = (Array.isArray(target) ? target : [target]).map((name) => String(name).trim());
	return names.includes(device.trim());
}

/**
 * The action a HEARTH event asks for, or null when it asks for none this
 * screen understands, or names another device.
 */
export function parseHearthEvent(
	data: Record<string, unknown>,
	device: string
): HearthAction | null {
	if (!forThisDevice(data.device, device)) return null;
	const entity = text(data.entity);
	switch (data.action) {
		case 'alert': {
			const title = text(data.title);
			if (!title) return null;
			return {
				action: 'alert',
				tag: text(data.tag) ?? title,
				title,
				message: text(data.message),
				icon: text(data.icon),
				severity: isAlertSeverity(data.severity) ? data.severity : 'info',
				popup: data.popup !== false,
				entity
			};
		}
		case 'dismiss_alert': {
			const tag = text(data.tag);
			return tag ? { action: 'dismiss_alert', tag } : null;
		}
		case 'open_popup':
			return entity ? { action: 'open_popup', entity, name: text(data.name) } : null;
		case 'close_popup':
			return { action: 'close_popup', entity };
		default:
			return null;
	}
}

export function handleHearthAction(action: HearthAction) {
	switch (action.action) {
		case 'alert': {
			const { tag, title, message, icon, severity, popup: pops, entity } = action;
			events.delete(tag);
			events.set(tag, {
				key: `event:${tag}`,
				title,
				message,
				icon,
				severity,
				popup: pops,
				entity,
				since: Date.now()
			});
			publish();
			if (pops && !get(hearthEditMode)) requestWake();
			return;
		}
		case 'dismiss_alert':
			events.delete(action.tag);
			publish();
			return;
		case 'open_popup':
			if (get(hearthEditMode)) return;
			host?.openDetail(action.entity, action.name);
			requestWake();
			return;
		case 'close_popup':
			if (!action.entity || get(popup)?.entity === action.entity) closePopup();
	}
}

/** Clears every raised alert and pending timer. */
export function resetAlerts() {
	for (const id of [...rules.keys()]) forget(id);
	events.clear();
	catchingUp = true;
	publish();
}

/** Starts checking rules and listening for HEARTH events; returns the stop function. */
export function startAlerts(services: AlertHost): () => void {
	setAlertHost(services);
	const stopRules = derived([hearthConfig, states], (values) => values).subscribe(
		([$config, $states]) => syncRules($config.alerts ?? [], $states)
	);
	const stopEvents = subscribeHearthEvents((data) => {
		const action = parseHearthEvent(data, get(deviceName));
		if (action) handleHearthAction(action);
	});
	// the snapshot after a reconnect carries changes this screen did not see
	const stopHealth = health.subscribe(($health) => {
		if ($health === 'lost') catchingUp = true;
	});
	const stopEditing = hearthEditMode.subscribe(($editing) => {
		if (!$editing) openDeferred();
	});
	return () => {
		stopRules();
		stopEvents();
		stopHealth();
		stopEditing();
		resetAlerts();
		setAlertHost(undefined);
	};
}
