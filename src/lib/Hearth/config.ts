import type {
	HearthConfig,
	HearthRoom,
	MobileSlot,
	OverviewCard,
	OverviewItem,
	OverviewStack,
	RailPosition,
	RailSide,
	RailWidget,
	VisibilityCondition
} from './types';

export type * from './types';

/** A gap with no height is the one that absorbs the rail's leftover space. */
function isFlexibleGap(widget: RailWidget): boolean {
	return widget.type === 'spacer' && !widget.height;
}

/*
 * Short, ambient widgets - the ones worth reading before the page rather than
 * after it, and cheap enough in height to put there. Search is not among them:
 * the folded layout's page switcher carries it.
 */
const GLANCE_TYPES = new Set<RailWidget['type']>(['clock', 'weather']);

/**
 * The gap that divides the rail's two folded runs: a flexible gap with
 * widgets after it. A trailing one divides nothing - it only says the rail
 * keeps its widgets at the top of its own column - so it reports -1. With
 * two rails, trailing means last on its own side: the other rail's widgets
 * stored after it are not below it on screen.
 */
export function railDividerIndex(rail: RailWidget[], position: RailPosition = 'left'): number {
	const index = rail.findIndex(isFlexibleGap);
	if (index === -1) return -1;
	const after = rail.slice(index + 1);
	const side = railSideOf(rail[index]);
	const divides =
		position === 'both' ? after.some((widget) => railSideOf(widget) === side) : after.length > 0;
	return divides ? index : -1;
}

/**
 * Where a widget lands when it has not been told. A rail that divides itself
 * is taken at its word; otherwise only the glance widgets ride above the
 * page, since everything else would push the page itself out of reach.
 */
function defaultSlot(
	widget: RailWidget,
	index: number,
	dividerIndex: number
): Exclude<MobileSlot, 'hidden'> {
	if (dividerIndex !== -1) return index < dividerIndex ? 'top' : 'bottom';
	return GLANCE_TYPES.has(widget.type) ? 'top' : 'bottom';
}

/** Which side of the page a widget lands on once the rail folds. */
export function mobileSlotOf(widget: RailWidget, index: number, dividerIndex: number): MobileSlot {
	if (widget.mobile) return widget.mobile;
	if (widget.hide_mobile) return 'hidden';
	return defaultSlot(widget, index, dividerIndex);
}

/**
 * The rail split into the run that rides above the page and the run below it.
 * Hidden widgets drop out unless `includeHidden`, which the editor passes so
 * they stay reachable (dimmed) while the layout is being arranged. `compact`
 * is for a screen with no height to spare - a phone held sideways - where
 * only a widget that asked for the top keeps it.
 */
export function railSlots(
	rail: RailWidget[],
	{
		includeHidden = false,
		compact = false,
		position
	}: { includeHidden?: boolean; compact?: boolean; position?: RailPosition } = {}
): { top: RailWidget[]; bottom: RailWidget[] } {
	const dividerIndex = railDividerIndex(rail, position);
	const top: RailWidget[] = [];
	const bottom: RailWidget[] = [];
	rail.forEach((widget, index) => {
		const slot = mobileSlotOf(widget, index, dividerIndex);
		if (slot === 'hidden' && !includeHidden) return;
		// a shown-anyway hidden widget sits where it would have without the flag
		const placed = slot === 'hidden' ? defaultSlot(widget, index, dividerIndex) : slot;
		const demoted = compact && widget.mobile !== 'top';
		(placed === 'top' && !demoted ? top : bottom).push(widget);
	});
	return { top, bottom };
}

/**
 * How many widgets the run above the folded page actually draws. The page
 * switcher carries the pages and search itself, so a run holding only those
 * would render as an empty band everywhere but the editor, which shows them.
 */
export function foldedTopCount(
	rail: RailWidget[],
	{
		editing = false,
		compact = false,
		position
	}: { editing?: boolean; compact?: boolean; position?: RailPosition } = {}
): number {
	const { top } = railSlots(rail, { includeHidden: editing, compact, position });
	if (editing) return top.length;
	return top.filter((widget) => widget.type !== 'nav' && widget.type !== 'search').length;
}

export function railPositionOf(config: Pick<HearthConfig, 'rail_position'>): RailPosition {
	return config.rail_position ?? 'left';
}

export function railSideOf(widget: RailWidget): RailSide {
	return widget.side === 'right' ? 'right' : 'left';
}

/**
 * The widgets each wide rail draws. A single rail holds every widget whatever
 * side it was given, so switching back to one rail loses nothing; `none`
 * draws neither.
 */
export function railSides(
	rail: RailWidget[],
	position: RailPosition
): { left: RailWidget[]; right: RailWidget[] } {
	switch (position) {
		case 'left':
			return { left: rail, right: [] };
		case 'right':
			return { left: [], right: rail };
		case 'none':
			return { left: [], right: [] };
		case 'both':
			return {
				left: rail.filter((widget) => railSideOf(widget) === 'left'),
				right: rail.filter((widget) => railSideOf(widget) === 'right')
			};
	}
}

/**
 * The rail as the folded layout reads it: every widget in stored order, which
 * is the order dragging in the folded runs writes. No rail folds to nothing.
 */
export function foldedRail(rail: RailWidget[], position: RailPosition): RailWidget[] {
	return position === 'none' ? [] : rail;
}

export function isStack(item: OverviewItem): item is OverviewStack {
	return 'kind' in item && item.kind === 'stack';
}

/** Mutable list containing an id-addressed card or stack. */
export function findOverviewItemList(
	config: HearthConfig,
	id: string,
	roomId?: string
): OverviewItem[] | undefined {
	for (const room of config.rooms) {
		if (roomId && room.id !== roomId) continue;
		for (const column of room.cards) {
			if (column.some((item) => item.id === id)) return column;
			for (const item of column) {
				if (isStack(item) && item.cards.some((card) => card.id === id)) return item.cards;
			}
		}
	}
	return undefined;
}

export function findOverviewCard(
	config: HearthConfig,
	id: string,
	roomId?: string
): OverviewCard | undefined {
	const item = findOverviewItemList(config, id, roomId)?.find((entry) => entry.id === id);
	return item && !isStack(item) ? item : undefined;
}

/** Expands a simple `*` glob against entity ids. */
export function wildcardEntityIds(pattern: string | undefined, entityIds: string[]): string[] {
	if (!pattern?.trim()) return [];
	const source = pattern
		.trim()
		.split('*')
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*');
	const regex = new RegExp(`^${source}$`);
	return entityIds.filter((entityId) => regex.test(entityId)).sort();
}

/** Card types that take a share of the leftover height unless told otherwise. */
/** The longest an alert rule may wait, one day; longer waits belong in Home Assistant. */
export const MAX_ALERT_SECONDS = 86_400;

export const DEFAULT_HEARTH_CONFIG: HearthConfig = {
	// sun.sun is part of a standard Home Assistant installation; without a
	// configured night theme this switch is inert.
	day_night: { entity: 'sun.sun' },
	rail: [
		{ id: 'clock', type: 'clock' },
		{ id: 'divider', type: 'spacer', line: true, height: 24 },
		{ id: 'nav', type: 'nav' },
		{ id: 'spacer', type: 'spacer' }
	],
	rooms: [
		{
			id: 'home',
			name: 'Home',
			icon: 'home',
			hide_header: true,
			cards: [[]]
		}
	]
};

function normalizeVisibilityCondition(raw: any): VisibilityCondition | null {
	if (!raw || typeof raw !== 'object') return null;
	if (Array.isArray(raw.or)) {
		const nested = raw.or
			.map(normalizeVisibilityCondition)
			.filter(
				(condition: VisibilityCondition | null): condition is VisibilityCondition =>
					condition !== null
			);
		return nested.length ? { or: nested } : null;
	}
	if (typeof raw.media === 'string' && raw.media.trim()) {
		return { media: raw.media };
	}
	if (typeof raw.entity === 'string' && raw.entity.trim()) {
		const condition: VisibilityCondition = { entity: raw.entity };
		if (typeof raw.state === 'string' && raw.state !== '') condition.state = raw.state;
		if (typeof raw.state_not === 'string' && raw.state_not !== '')
			condition.state_not = raw.state_not;
		if (typeof raw.above === 'number' && Number.isFinite(raw.above)) condition.above = raw.above;
		if (typeof raw.below === 'number' && Number.isFinite(raw.below)) condition.below = raw.below;
		return condition;
	}
	return null;
}

/** Drops the field entirely rather than keeping an empty array. */
export function normalizeVisibility(raw: unknown): VisibilityCondition[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const conditions = raw
		.map(normalizeVisibilityCondition)
		.filter((condition): condition is VisibilityCondition => condition !== null);
	return conditions.length ? conditions : undefined;
}

/**
 * Reshapes card columns to `count`: overflow columns merge into the last kept
 * one, missing columns are added empty. Cards are never dropped.
 */
export function resizeCardColumns(columns: OverviewItem[][], count: number): OverviewItem[][] {
	const next: OverviewItem[][] = Array.from({ length: count }, (_, index) => [
		...(columns[index] ?? [])
	]);
	for (const overflow of columns.slice(count)) next[count - 1].push(...overflow);
	return next;
}

export function slugify(name: string) {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'item'
	);
}

/** Uppercases the first letter, e.g. for lowercase translation values. */
export function capitalize(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

export function uniqueId(base: string, taken: string[]) {
	let id = base;
	let counter = 2;
	while (taken.includes(id)) id = `${base}-${counter++}`;
	return id;
}

function overviewItemIds(item: OverviewItem): string[] {
	return isStack(item) ? [item.id, ...item.cards.flatMap(overviewItemIds)] : [item.id];
}

/** Every card id on every page, for generating a fresh unique one. */
export function takenCardIds(config: HearthConfig): string[] {
	return config.rooms.flatMap((room) => (room.cards ?? []).flat().flatMap(overviewItemIds));
}

export function overviewItemTypeKey(item: OverviewItem): string {
	return isStack(item) ? 'stack' : item.type;
}

/**
 * Deep clone with a fresh id for the item and, if it's a stack, every child -
 * so an Alt-drag duplicate never collides with an existing id anywhere in the
 * config. Mutates `taken` as it goes so nested clones stay unique against
 * each other too.
 */
export function cloneOverviewItem<T extends OverviewItem>(item: T, taken: string[]): T {
	const cloned = structuredClone(item);
	const assignIds = (node: OverviewItem) => {
		node.id = uniqueId(slugify(overviewItemTypeKey(node)), taken);
		taken.push(node.id);
		if (isStack(node)) node.cards.forEach(assignIds);
	};
	assignIds(cloned);
	return cloned;
}

export function moveItem<T>(list: T[], index: number, delta: number) {
	const target = index + delta;
	if (index < 0 || target < 0 || target >= list.length) return;
	const [item] = list.splice(index, 1);
	list.splice(target, 0, item);
}

/**
 * Map zoom range for the sleep screen radar. RainViewer serves radar tiles up
 * to zoom 7, and nothing below 3 shows weather at a useful scale.
 */
export const RADAR_ZOOM = { min: 3, max: 7, fallback: 6 } as const;

/** A Leaflet raster tile template: http(s) with {z}, {x} and {y} placeholders. */
export function isTileUrl(value: string): boolean {
	return /^https?:\/\//.test(value) && ['{z}', '{x}', '{y}'].every((part) => value.includes(part));
}

export const PRESS_RIPPLE = {
	color: 'rgb(var(--h-line-rgb) / calc(0.12 * var(--h-line-scale)))'
};

/** Initializes a page's card columns (matching its column count) on first use. */
export function ensureRoomCardColumns(room: HearthRoom): OverviewItem[][] {
	if (!room.cards?.length) {
		room.cards = Array.from({ length: room.columns ?? 1 }, (): OverviewItem[] => []);
	}
	return room.cards;
}
