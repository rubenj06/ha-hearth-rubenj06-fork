import { sensorNumber } from '$lib/core/ha/entities';
import type { HassEntities } from 'home-assistant-js-websocket';
import {
	mobileSlotOf,
	railDividerIndex,
	type RailWidget,
	type VisibilityCondition
} from './config';

/**
 * Evaluates a list of visibility conditions (ANDed together) against current
 * entity states and already-resolved media query matches.
 *
 * Missing-entity semantics: an entity condition fails whenever the entity
 * does not exist in $states, for both `state` and `state_not` - a missing
 * entity is treated as "unknown", not as satisfying "not equal to X".
 */
export function evaluateVisibility(
	conditions: VisibilityCondition[] | undefined,
	$states: HassEntities | undefined,
	mediaMatches: Record<string, boolean>
): boolean {
	if (!conditions || conditions.length === 0) return true;
	return conditions.every((condition) => evaluateCondition(condition, $states, mediaMatches));
}

function evaluateCondition(
	condition: VisibilityCondition,
	$states: HassEntities | undefined,
	mediaMatches: Record<string, boolean>
): boolean {
	if ('media' in condition) {
		return mediaMatches[condition.media] ?? false;
	}
	if ('or' in condition) {
		return condition.or.some((nested) => evaluateCondition(nested, $states, mediaMatches));
	}

	const entityState = $states?.[condition.entity]?.state;
	if (entityState === undefined) return false;

	if (typeof condition.state === 'string') return entityState === condition.state;
	if (typeof condition.state_not === 'string') return entityState !== condition.state_not;
	if (typeof condition.above === 'number' || typeof condition.below === 'number') {
		const value = sensorNumber(entityState);
		if (value === null) return false;
		if (typeof condition.above === 'number' && !(value > condition.above)) return false;
		if (typeof condition.below === 'number' && !(value < condition.below)) return false;
		return true;
	}

	// neither constraint set: condition just checks the entity is known
	return true;
}

export function mediaQueriesIn(conditions: VisibilityCondition[]): string[] {
	return conditions.flatMap((condition) =>
		'media' in condition ? [condition.media] : 'or' in condition ? mediaQueriesIn(condition.or) : []
	);
}

// user-entered queries can be malformed css, and jsdom has no matchMedia at all
function liveMediaMatch(query: string): boolean {
	try {
		return typeof window !== 'undefined' && (window.matchMedia?.(query).matches ?? false);
	} catch {
		return false;
	}
}

/**
 * Evaluates conditions outside a component, for alert rules. Media queries
 * never hold here: alert rules cannot use them (see model/alerts.ts).
 */
export function conditionsHold(
	conditions: VisibilityCondition[],
	$states: HassEntities | undefined
): boolean {
	return evaluateVisibility(conditions, $states, {});
}

/**
 * Whether the rail currently shows a widget of `type`: its visibility
 * conditions hold and, while the rail is folded (`narrow`), it is not hidden
 * on mobile. Media conditions are read from the live window unless `match`
 * says otherwise.
 */
export function railWidgetShown(
	rail: RailWidget[],
	type: RailWidget['type'],
	$states: HassEntities | undefined,
	{ narrow, match = liveMediaMatch }: { narrow: boolean; match?: (query: string) => boolean }
): boolean {
	const dividerIndex = railDividerIndex(rail);
	return rail.some((widget, index) => {
		if (widget.type !== type) return false;
		if (narrow && mobileSlotOf(widget, index, dividerIndex) === 'hidden') return false;
		const queries = mediaQueriesIn(widget.visibility ?? []);
		const mediaMatches = Object.fromEntries(queries.map((query) => [query, match(query)]));
		return evaluateVisibility(widget.visibility, $states, mediaMatches);
	});
}

/**
 * The one rule for whether search exists: the f shortcut, the page
 * switcher's button and the rail widget all follow a search widget the user
 * can currently see.
 */
export function searchAvailable(
	rail: RailWidget[],
	$states: HassEntities | undefined,
	narrow: boolean,
	match?: (query: string) => boolean
): boolean {
	return railWidgetShown(rail, 'search', $states, { narrow, match });
}
