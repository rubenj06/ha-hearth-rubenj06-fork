import type {
	HearthConfig,
	HearthRoom,
	MobileSlot,
	OverviewCard,
	OverviewItem,
	OverviewStack,
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
// fork: styled_clock rides above the page on phones like the clock
const GLANCE_TYPES = new Set<RailWidget['type']>(['clock', 'styled_clock', 'weather']);

/**
 * The gap that divides the rail's two folded runs: a flexible gap with
 * widgets after it. A trailing one divides nothing - it only says the rail
 * keeps its widgets at the top of its own column - so it reports -1.
 */
export function railDividerIndex(rail: RailWidget[]): number {
	const index = rail.findIndex(isFlexibleGap);
	return index === rail.length - 1 ? -1 : index;
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
	{ includeHidden = false, compact = false }: { includeHidden?: boolean; compact?: boolean } = {}
): { top: RailWidget[]; bottom: RailWidget[] } {
	const dividerIndex = railDividerIndex(rail);
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
	{ editing = false, compact = false }: { editing?: boolean; compact?: boolean } = {}
): number {
	const { top } = railSlots(rail, { includeHidden: editing, compact });
	if (editing) return top.length;
	return top.filter((widget) => widget.type !== 'nav' && widget.type !== 'search').length;
}

/*
 * Landing in a folded run stamps the widget with that run's slot, so the
 * arrangement the user made by hand stops depending on where the flexible gap
 * happens to sit. A widget hidden on mobile keeps its slot - it is only in a
 * run at all because the editor shows hidden widgets dimmed.
 */
function stampSlot(widgets: RailWidget[], slot: Exclude<MobileSlot, 'hidden'>): RailWidget[] {
	return widgets.map((widget) =>
		widget.mobile === 'hidden' || widget.hide_mobile ? widget : { ...widget, mobile: slot }
	);
}

/** One run rewritten, with the other left where it was. */
function withRun(
	run: RailWidget[],
	rest: RailWidget[],
	slot: Exclude<MobileSlot, 'hidden'>
): RailWidget[] {
	const placed = stampSlot(run, slot);
	return slot === 'top' ? [...placed, ...rest] : [...rest, ...placed];
}

/** A folded run reordered within itself. */
export function reorderSlot(
	rail: RailWidget[],
	slot: Exclude<MobileSlot, 'hidden'>,
	run: RailWidget[]
): RailWidget[] {
	const moved = new Set(run.map((widget) => widget.id));
	return withRun(
		run,
		rail.filter((widget) => !moved.has(widget.id)),
		slot
	);
}

/**
 * A widget dropped into a folded run at `index`, which is also what assigns
 * its slot - dragging past the page is the gesture for changing it. `copy`
 * leaves the original where it was and inserts a duplicate.
 */
export function placeInSlot(
	rail: RailWidget[],
	id: string,
	slot: Exclude<MobileSlot, 'hidden'>,
	index: number,
	{ copy = false, compact = false }: { copy?: boolean; compact?: boolean } = {}
): RailWidget[] {
	const source = rail.find((widget) => widget.id === id);
	if (!source) return rail;

	const entry = copy
		? {
				...structuredClone(source),
				id: uniqueId(
					slugify(source.type),
					rail.map((widget) => widget.id)
				)
			}
		: source;
	const remaining = copy ? rail : rail.filter((widget) => widget.id !== id);

	// hidden widgets stay in the split so the rewrite below keeps them
	const runs = railSlots(remaining, { includeHidden: true, compact });
	const run = [...runs[slot]];
	run.splice(index, 0, entry as RailWidget);
	return withRun(run, slot === 'top' ? runs.bottom : runs.top, slot);
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
