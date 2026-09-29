import type {
	HearthConfig,
	HearthRoom,
	HearthTheme,
	MobileSlot,
	OverviewCard,
	OverviewItem,
	OverviewStack,
	RailPosition,
	RailWidget,
	ScreensaverRadar
} from './types';
import {
	DEFAULT_HEARTH_CONFIG,
	normalizeVisibility,
	isTileUrl,
	RADAR_ZOOM,
	resizeCardColumns,
	uniqueId
} from './config';
import {
	isRecord,
	normalizeFill,
	normalizeHeight,
	reserveId,
	trimmedOrUndefined,
	normalizeWholeNumber
} from './normalizers';
import {
	CARD_DEFINITIONS,
	cardDefinition,
	WIDGET_DEFINITIONS,
	widgetDefinition
} from './model/registry';
import { currentHearthConfig } from './format';
import { AlertRuleSchema, normalizeAlertRules } from './model/alerts';
import * as v from 'valibot';
import {
	CardSharedSchema,
	issueLines,
	RootSettingsSchema,
	RoomSchema,
	StackSchema,
	WidgetSharedSchema
} from './schema';

/*
 * Turns whatever is in hearth.yaml into a HearthConfig: current files and incomplete drafts. Per-type field rules come from the card and
 * widget descriptors, so a new type never needs a branch here.
 */

const VALID_CARD_DEFINITIONS = new Set<string>(CARD_DEFINITIONS.map(({ type }) => type));
const VALID_WIDGET_DEFINITIONS = new Set<string>(WIDGET_DEFINITIONS.map(({ type }) => type));

/**
 * Reports structural problems that normalization would otherwise have to
 * discard or repair. The visual YAML editor uses this before Apply so a typo
 * cannot silently remove a card, widget or entity reference.
 */
const MOBILE_SLOTS = new Set<MobileSlot>(['top', 'bottom', 'hidden']);

// left is the default, so it is stored as unset
const RAIL_POSITIONS = new Set<RailPosition>(['right', 'both', 'none']);

/** `mobile` if it names a slot, otherwise the slot the older `hide_mobile` meant. */
function normalizeMobileSlot(widget: any): MobileSlot | undefined {
	if (MOBILE_SLOTS.has(widget.mobile)) return widget.mobile;
	return widget.hide_mobile === true ? 'hidden' : undefined;
}

/** Token maps are string to string; other values (arrays, numbers, nested maps) are dropped. */
function normalizeTheme(raw: unknown): HearthTheme | undefined {
	if (!isRecord(raw)) return undefined;
	return Object.fromEntries(
		Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
	);
}

const SCREENSAVER_CLOCK_SIZES = new Set<unknown>(['small', 'medium', 'large']);

function coordinate(raw: unknown, limit: number): number | undefined {
	return typeof raw === 'number' && Number.isFinite(raw) && Math.abs(raw) <= limit
		? raw
		: undefined;
}

/** Out-of-range zoom is clamped; unusable coordinates fall back to the home location. */
function normalizeScreensaverRadar(raw: unknown): ScreensaverRadar | undefined {
	if (!isRecord(raw)) return undefined;
	const radar: ScreensaverRadar = {
		latitude: coordinate(raw.latitude, 90),
		longitude: coordinate(raw.longitude, 180),
		zoom:
			typeof raw.zoom === 'number' && Number.isFinite(raw.zoom)
				? Math.min(RADAR_ZOOM.max, Math.max(RADAR_ZOOM.min, Math.round(raw.zoom)))
				: undefined,
		basemap: raw.basemap === 'light' || raw.basemap === 'dark' ? raw.basemap : undefined,
		tile_url:
			typeof raw.tile_url === 'string' && isTileUrl(raw.tile_url.trim())
				? raw.tile_url.trim()
				: undefined,
		attribution: trimmedOrUndefined(raw.attribution)
	};
	return Object.values(radar).some((value) => value !== undefined) ? radar : undefined;
}

export function hearthConfigIssues(raw: unknown): string[] {
	if (!isRecord(raw)) return ['Configuration must be a YAML mapping']; // copy ok: yaml diagnostic

	const issues: string[] = [];
	const report = (schema: v.GenericSchema, value: unknown, path: string) => {
		const parsed = v.safeParse(schema, value);
		if (!parsed.success) issues.push(...issueLines(parsed.issues, path));
	};
	report(RootSettingsSchema, raw, '');
	const widgetIds = new Map<string, string>();
	const itemIds = new Map<string, string>();
	const checkId = (value: unknown, path: string, seen: Map<string, string>) => {
		if (typeof value !== 'string' || !value.trim()) {
			issues.push(`${path}.id must be a non-empty string`);
			return;
		}
		const previous = seen.get(value);
		if (previous) issues.push(`${path}.id duplicates ${previous}`);
		else seen.set(value, `${path}.id`);
	};
	const checkCard = (value: unknown, path: string, allowStack: boolean) => {
		if (!isRecord(value)) {
			issues.push(`${path} must be a card mapping`);
			return;
		}
		checkId(value.id, path, itemIds);
		if (value.kind === 'stack') {
			if (!allowStack) issues.push(`${path}: nested stacks are not supported`);
			report(StackSchema, value, path);
			if (!Array.isArray(value.cards)) issues.push(`${path}.cards must be a list`);
			else value.cards.forEach((card, index) => checkCard(card, `${path}.cards[${index}]`, false));
			return;
		}
		if (typeof value.type !== 'string' || !VALID_CARD_DEFINITIONS.has(value.type)) {
			issues.push(`${path}.type is not a supported card type`);
			return;
		}
		report(CardSharedSchema, value, path);
		report(cardDefinition(value.type)!.schema, value, path);
	};

	if (!Array.isArray(raw.rail)) issues.push('rail must be a list');
	else {
		raw.rail.forEach((widget, index) => {
			const path = `rail[${index}]`;
			if (!isRecord(widget)) {
				issues.push(`${path} must be a widget mapping`);
				return;
			}
			checkId(widget.id, path, widgetIds);
			if (typeof widget.type !== 'string' || !VALID_WIDGET_DEFINITIONS.has(widget.type)) {
				issues.push(`${path}.type is not a supported widget type`);
				return;
			}
			report(WidgetSharedSchema, widget, path);
			report(widgetDefinition(widget.type)!.schema, widget, path);
		});
	}

	if (raw.alerts !== undefined && raw.alerts !== null) {
		if (!Array.isArray(raw.alerts)) issues.push('alerts must be a list');
		else {
			const alertIds = new Map<string, string>();
			raw.alerts.forEach((rule, index) => {
				const path = `alerts[${index}]`;
				if (!isRecord(rule)) {
					issues.push(`${path} must be an alert mapping`);
					return;
				}
				checkId(rule.id, path, alertIds);
				report(AlertRuleSchema, rule, path);
			});
		}
	}

	if (!Array.isArray(raw.rooms)) issues.push('rooms must be a list');
	else {
		const roomIds = new Map<string, string>();
		raw.rooms.forEach((room, roomIndex) => {
			const path = `rooms[${roomIndex}]`;
			if (!isRecord(room)) {
				issues.push(`${path} must be a page mapping`);
				return;
			}
			checkId(room.id, path, roomIds);
			report(RoomSchema, room, path);
			if (!Array.isArray(room.cards)) {
				issues.push(`${path}.cards must be a list of columns`);
				return;
			}
			room.cards.forEach((column, columnIndex) => {
				const columnPath = `${path}.cards[${columnIndex}]`;
				if (!Array.isArray(column)) {
					issues.push(`${columnPath} must be a card list`);
					return;
				}
				column.forEach((card, cardIndex) => checkCard(card, `${columnPath}[${cardIndex}]`, true));
			});
		});
	}

	return issues;
}

function normalizeCard(raw: any, fallbackId: string, taken: string[]): OverviewCard {
	const id = reserveId(raw.id, fallbackId, taken);
	const descriptor = cardDefinition(raw.type);
	return {
		...raw,
		id,
		...(descriptor?.normalize?.(raw) ?? {}),
		...(descriptor?.sizable ? { height: normalizeHeight(raw.height) } : {}),
		fill: normalizeFill(raw.fill),
		visibility: normalizeVisibility(raw.visibility)
	} as OverviewCard;
}

function normalizeStack(raw: any, fallbackId: string, taken: string[]): OverviewStack {
	const id = reserveId(raw.id, fallbackId, taken);
	const direction: OverviewStack['direction'] =
		raw.direction === 'vertical' ? 'vertical' : 'horizontal';
	const title = typeof raw.title === 'string' ? raw.title.trim() : '';
	const cards = (Array.isArray(raw.cards) ? raw.cards : [])
		// children may be any non-stack card - nesting stops here
		.filter(
			(child: any) =>
				isRecord(child) &&
				child.kind !== 'stack' &&
				VALID_CARD_DEFINITIONS.has(child.type as string)
		)
		.map((child: any, index: number) => normalizeCard(child, `${id}-card-${index}`, taken));
	return {
		...raw,
		id,
		kind: 'stack',
		direction,
		cards,
		fill: normalizeFill(raw.fill),
		...(title ? { title } : {})
	};
}

function normalizeOverviewItem(raw: any, fallbackId: string, taken: string[]): OverviewItem {
	return raw?.kind === 'stack'
		? normalizeStack(raw, fallbackId, taken)
		: normalizeCard(raw, fallbackId, taken);
}

/**
 * Card columns; when the room fixes its column count the columns are resized
 * to match. Blank YAML entries and scalars are not cards and are dropped, so
 * one bad entry never collapses the column around it.
 */
function normalizeRoomCards(
	room: any,
	roomId: string,
	columns: number | undefined,
	taken: string[]
): OverviewItem[][] {
	const raw = Array.isArray(room.cards) ? room.cards : [];
	const cards = raw.map((column: unknown, columnIndex: number) =>
		(Array.isArray(column) ? column : [])
			.filter(
				(item: any) =>
					isRecord(item) &&
					(item.kind === 'stack' || VALID_CARD_DEFINITIONS.has(item.type as string))
			)
			.map((item: any, index: number) =>
				normalizeOverviewItem(item, `card-${roomId}-${columnIndex}-${index}`, taken)
			)
	);
	return columns !== undefined && cards.length !== columns
		? resizeCardColumns(cards, columns)
		: cards;
}

/**
 * `taken` collects the ids already handed out and is mutated here: two pages
 * sharing an id would make every id-keyed lookup (nav, drag, editor targets)
 * ambiguous.
 */
function normalizeRoom(raw: any, index: number, taken: string[], takenItems: string[]): HearthRoom {
	const id = uniqueId(trimmedOrUndefined(raw?.id) ?? `page-${index + 1}`, taken);
	taken.push(id);
	const columns =
		typeof raw?.columns === 'number' && raw.columns >= 1 && raw.columns <= 3
			? Math.floor(raw.columns)
			: undefined;
	return {
		...raw,
		id,
		name: trimmedOrUndefined(raw?.name) ?? id,
		icon: trimmedOrUndefined(raw?.icon) ?? 'meeting_room',
		summary: trimmedOrUndefined(raw?.summary),
		temp_entity: trimmedOrUndefined(raw?.temp_entity),
		humidity_entity: trimmedOrUndefined(raw?.humidity_entity),
		hide_header: raw?.hide_header === true ? true : undefined,
		fill_screen: raw?.fill_screen === true ? true : undefined,
		columns,
		cards: normalizeRoomCards(raw, id, columns, takenItems)
	};
}

/**
 * Normalizes a current Hearth configuration or an incomplete editor draft.
 */
export function normalizeHearthConfig(raw: unknown): HearthConfig {
	const current = currentHearthConfig(raw);
	if (!isRecord(current) || !Object.keys(current).filter((key) => key !== 'version').length) {
		return structuredClone(DEFAULT_HEARTH_CONFIG);
	}
	const config = current as Record<string, any>;
	const defaults = structuredClone(DEFAULT_HEARTH_CONFIG);

	const takenRoomIds: string[] = [];
	const takenItemIds: string[] = [];
	const rooms: HearthRoom[] = (Array.isArray(config.rooms) ? config.rooms : [])
		.filter(isRecord)
		.map((room: any, index: number) => normalizeRoom(room, index, takenRoomIds, takenItemIds));

	// there is always something to render: an empty config gets the default home
	if (!rooms.length) rooms.push(...defaults.rooms.filter((room) => room.id === 'home'));

	const dayNight =
		config.day_night && typeof config.day_night === 'object' && config.day_night.entity
			? {
					entity: String(config.day_night.entity),
					...(config.day_night.night_state
						? { night_state: String(config.day_night.night_state) }
						: {})
				}
			: defaults.day_night;

	const takenWidgetIds: string[] = [];
	const rail = (Array.isArray(config.rail) ? config.rail : defaults.rail)
		.filter(
			(widget: any) => isRecord(widget) && VALID_WIDGET_DEFINITIONS.has(widget.type as string)
		)
		.map((widget: any, index: number) => ({
			...widget,
			id: reserveId(widget.id, `widget-${index}`, takenWidgetIds),
			...(widgetDefinition(widget.type)?.normalize?.(widget) ?? {}),
			mobile: normalizeMobileSlot(widget),
			// folded into `mobile` above; dropped so only one field decides
			hide_mobile: undefined,
			side: widget.side === 'right' ? 'right' : undefined,
			visibility: normalizeVisibility(widget.visibility)
		})) as RailWidget[];

	const extensions = { ...config };
	for (const key of [
		'version',
		'revision',
		'theme',
		'theme_night',
		'day_night',
		'rail_position',
		'rail',
		'rooms',
		'screensaver_minutes',
		'screensaver_drift',
		'screensaver_brightness',
		'screensaver_background',
		'screensaver_image',
		'screensaver_radar',
		'screensaver_show_date',
		'screensaver_clock_size',
		'screensaver_weather_entity',
		'keep_screen_on',
		'scroll_edge_blur',
		'swipe_navigation_mobile',
		'swipe_navigation_desktop',
		'padding_x',
		'padding_y',
		'alerts'
	]) {
		delete extensions[key];
	}

	return {
		...extensions,
		theme: normalizeTheme(config.theme),
		theme_night: normalizeTheme(config.theme_night),
		day_night: dayNight,
		rail_position: RAIL_POSITIONS.has(config.rail_position) ? config.rail_position : undefined,
		rail,
		rooms,
		screensaver_minutes: normalizeWholeNumber(config.screensaver_minutes, 1),
		screensaver_drift: config.screensaver_drift === true ? true : undefined,
		screensaver_brightness:
			typeof config.screensaver_brightness === 'number' &&
			Number.isFinite(config.screensaver_brightness)
				? Math.min(100, Math.max(10, Math.round(config.screensaver_brightness)))
				: undefined,
		screensaver_background:
			config.screensaver_background === 'image' || config.screensaver_background === 'radar'
				? config.screensaver_background
				: undefined,
		screensaver_image: trimmedOrUndefined(config.screensaver_image),
		screensaver_radar: normalizeScreensaverRadar(config.screensaver_radar),
		screensaver_show_date:
			typeof config.screensaver_show_date === 'boolean' ? config.screensaver_show_date : undefined,
		screensaver_clock_size: SCREENSAVER_CLOCK_SIZES.has(config.screensaver_clock_size)
			? config.screensaver_clock_size
			: undefined,
		screensaver_weather_entity: trimmedOrUndefined(config.screensaver_weather_entity),
		keep_screen_on: typeof config.keep_screen_on === 'boolean' ? config.keep_screen_on : undefined,
		scroll_edge_blur:
			typeof config.scroll_edge_blur === 'boolean' ? config.scroll_edge_blur : undefined,
		swipe_navigation_mobile: config.swipe_navigation_mobile === true ? true : undefined,
		swipe_navigation_desktop: config.swipe_navigation_desktop === true ? true : undefined,
		padding_x: normalizeWholeNumber(config.padding_x, 0),
		padding_y: normalizeWholeNumber(config.padding_y, 0),
		alerts: normalizeAlertRules(config.alerts)
	};
}
