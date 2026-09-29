import type { MobileSlot, RailPosition, RailSide, RailWidget } from '../types';
import { moveItem, railSideOf, railSides, railSlots, slugify, uniqueId } from '../config';

/*
 * Rearranging the rail's widgets by hand, folded or wide. Only edit mode moves
 * widgets, so this stays out of the dashboard's eager bundle and loads on the
 * first drop.
 */

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
	{
		copy = false,
		compact = false,
		position
	}: { copy?: boolean; compact?: boolean; position?: RailPosition } = {}
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
	const runs = railSlots(remaining, { includeHidden: true, compact, position });
	const run = [...runs[slot]];
	run.splice(index, 0, entry as RailWidget);
	return withRun(run, slot === 'top' ? runs.bottom : runs.top, slot);
}

function stampSide(widgets: RailWidget[], side: RailSide): RailWidget[] {
	return widgets.map((widget) => ({ ...widget, side: side === 'right' ? 'right' : undefined }));
}

/*
 * The other rail's widgets keep their order; this rail's run goes to the
 * matching end, so a wide drag leaves the left rail's widgets first.
 */
function withSide(run: RailWidget[], rest: RailWidget[], side: RailSide): RailWidget[] {
	const placed = stampSide(run, side);
	return side === 'left' ? [...placed, ...rest] : [...rest, ...placed];
}

/** One of the two wide rails reordered within itself. */
export function reorderSide(rail: RailWidget[], side: RailSide, run: RailWidget[]): RailWidget[] {
	const moved = new Set(run.map((widget) => widget.id));
	return withSide(
		run,
		rail.filter((widget) => !moved.has(widget.id)),
		side
	);
}

/**
 * A widget dropped into one of the two wide rails at `index`, which moves it
 * to that side. `copy` leaves the original where it was.
 */
export function placeInSide(
	rail: RailWidget[],
	id: string,
	side: RailSide,
	index: number,
	{ copy = false }: { copy?: boolean } = {}
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

	const sides = railSides(remaining, 'both');
	const run = [...sides[side]];
	run.splice(index, 0, entry as RailWidget);
	return withSide(run, side === 'left' ? sides.right : sides.left, side);
}

/**
 * Moves the widget at `index` past its neighbour. With two rails the
 * neighbour is the next widget on the same side, since one on the other side
 * is not next to it on screen.
 */
export function moveRailWidget(
	rail: RailWidget[],
	index: number,
	delta: -1 | 1,
	position: RailPosition
) {
	if (position !== 'both') return moveItem(rail, index, delta);
	const widget = rail[index];
	if (!widget) return;
	const side = railSideOf(widget);
	let target = index + delta;
	while (target >= 0 && target < rail.length && railSideOf(rail[target]) !== side) target += delta;
	if (target < 0 || target >= rail.length) return;
	rail.splice(index, 1);
	rail.splice(target, 0, widget);
}

/**
 * A widget sent to the other rail from its editor lands at the end of that
 * rail, not wherever its old index happens to fall among the other side's.
 */
export function moveToSide(rail: RailWidget[], id: string, side: RailSide): RailWidget[] {
	const widget = rail.find((entry) => entry.id === id);
	if (!widget) return rail;
	const rest = rail.filter((entry) => entry.id !== id);
	let lastOnSide = -1;
	rest.forEach((entry, index) => {
		if (railSideOf(entry) === side) lastOnSide = index;
	});
	const at = lastOnSide === -1 ? (side === 'left' ? 0 : rest.length) : lastOnSide + 1;
	rest.splice(at, 0, { ...widget, side: side === 'right' ? 'right' : undefined });
	return rest;
}
