import type { Action } from 'svelte/action';
import type { SwipeGestureOptions } from './swipe';
import { get } from 'svelte/store';
import { motion } from '$lib/core/app/motion';
import { gestureClaimed, swallowNextClick } from '$lib/ui/gestures';

export type SwipeDirection = 'previous' | 'next';

export interface SwipeNavOptions {
	/** Off while editing, while a layer is open, or when the layout's setting is off. */
	enabled: boolean;
	hasPrevious: boolean;
	hasNext: boolean;
	/** Switches the page; the new one should be in the DOM after Svelte's next tick. */
	onswipe: (direction: SwipeDirection) => void;
}

/** The page before or after `currentId` in rail order, if there is one. */
export function neighborRoom(
	rooms: readonly { id: string }[],
	currentId: string,
	direction: SwipeDirection
): string | undefined {
	const index = rooms.findIndex((room) => room.id === currentId);
	if (index < 0) return undefined;
	return rooms[index + (direction === 'next' ? 1 : -1)]?.id;
}

function withHelpers(options: SwipeNavOptions): SwipeGestureOptions {
	return {
		...options,
		duration: () => get(motion),
		claimed: gestureClaimed,
		swallowClick: swallowNextClick
	};
}

/**
 * Swipe between pages (see swipe.ts). Both settings default to off and the
 * eager bundle has no room to spare, so the gesture code loads the first time
 * swiping is enabled and stays attached after that; `enabled` gates it.
 */
export const swipeNav: Action<HTMLElement, SwipeNavOptions> = (node, options) => {
	let current = options;
	let attached: { update?: (next: SwipeGestureOptions) => void; destroy?: () => void } | undefined;
	let loading = false;
	let destroyed = false;

	function load() {
		if (loading || !current.enabled) return;
		loading = true;
		import('./swipe')
			.then(({ swipeGesture }) => {
				if (!destroyed) attached = swipeGesture(node, withHelpers(current)) ?? undefined;
			})
			// a failed load (a dropped connection) tries again on the next update
			.catch(() => {
				loading = false;
			});
	}

	load();
	return {
		update(next) {
			current = next;
			attached?.update?.(withHelpers(next));
			load();
		},
		destroy() {
			destroyed = true;
			attached?.destroy?.();
		}
	};
};
