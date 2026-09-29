import type { Action } from 'svelte/action';
import type { SliderUpdateMode } from '$lib/core/app/configuration';
import { vibrate } from '$lib/core/app/haptics';
import { claimGesture } from '$lib/ui/gestures';

interface DragOptions {
	/** Updates the preview. `commit` says whether device state should also be sent. */
	set: (value: number, commit: boolean) => void;
	tap?: () => void;
	/** Long-press without movement; suppresses the tap for that gesture. */
	hold?: () => void;
	end?: (value: number) => void;
	updateMode?: SliderUpdateMode;
	/** Percentage points between touch-feedback ticks while dragging. */
	step?: number;
	/** Skip gesture handling entirely (used in edit mode so SortableJS gets the pointer) */
	disabled?: boolean;
	/**
	 * Selector for interactive children the gesture must not swallow. Needed
	 * because Svelte 5 delegates the child's own handlers to the app root, so
	 * their stopPropagation runs after this action's native pointerdown -
	 * without this check the tile captures the pointer and the child's click
	 * retargets to the tile.
	 */
	ignore?: string;
	/**
	 * Report the unrounded percentage, for callers that map it onto their own
	 * range and step; whole percents would cap a 0-1000 range at steps of 10.
	 */
	precise?: boolean;
	/**
	 * A stationary tap without a `tap` handler commits the value under the
	 * pointer, as a drag released there would.
	 */
	tapSets?: boolean;
}

/**
 * Horizontal drag-to-value with tap detection: movement up to 10px counts as a
 * tap, anything more sets a 0-100 value from the pointer's position within the
 * element. A gesture that goes vertical first is abandoned, so under
 * `touch-action: pan-y` a scroll the browser lets through does not end in a
 * tap or a hold. Apply `touch-action: none` or `pan-y` on the element so touch
 * drags work.
 */
export const horizontalDrag: Action<HTMLElement, DragOptions> = (node, options) => {
	let current = options;
	let tracking: {
		moved: boolean;
		held: boolean;
		pointerId: number;
		startX: number;
		startY: number;
		lastStep: number;
	} | null = null;
	let holdTimer: ReturnType<typeof setTimeout> | undefined;

	function stepIndex(value: number) {
		return Math.floor(value / Math.max(1, current.step ?? 5));
	}

	/**
	 * One tick per move that lands on a different step than the last, so a sweep
	 * feels notched. A fast sweep skipping several steps still ticks once: each
	 * vibration cancels the one before it, so a tick per crossed step would only
	 * shorten the buzz.
	 */
	function feedStep(value: number) {
		if (!tracking) return;
		const index = stepIndex(value);
		if (index === tracking.lastStep) return;
		tracking.lastStep = index;
		vibrate('step');
	}

	function fraction(event: PointerEvent) {
		const rect = node.getBoundingClientRect();
		return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
	}

	function percent(event: PointerEvent) {
		const value = fraction(event) * 100;
		return current.precise ? value : Math.round(value);
	}

	function handleDown(event: PointerEvent) {
		if (current.disabled) return;
		// A second finger, or another pointer while one is already dragging.
		// A repeat of the tracked pointer means its release was lost, so restart.
		if (event.isPrimary === false) return;
		// a right or middle click, or a pen's barrel button, is not a drag or a tap
		if (event.button > 0) return;
		if (tracking && tracking.pointerId !== event.pointerId) return;
		if (current.ignore && (event.target as Element).closest?.(current.ignore)) return;
		claimGesture(event);
		try {
			node.setPointerCapture(event.pointerId);
		} catch {
			// pointer capture is best-effort
		}
		tracking = {
			moved: false,
			held: false,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			// the step under the finger, so staying inside it stays silent
			lastStep: stepIndex(Math.round(fraction(event) * 100))
		};
		clearTimeout(holdTimer);
		if (current.hold) {
			holdTimer = setTimeout(() => {
				if (!tracking || tracking.moved) return;
				tracking.held = true;
				vibrate('hold');
				current.hold?.();
			}, 500);
		}
	}

	function handleMove(event: PointerEvent) {
		if (!tracking || event.pointerId !== tracking.pointerId || tracking.held) return;
		if (!tracking.moved) {
			const dx = Math.abs(event.clientX - tracking.startX);
			const dy = Math.abs(event.clientY - tracking.startY);
			if (dy > 10 && dy >= dx) {
				finishTracking(event.pointerId);
				return;
			}
			if (dx > 10) {
				tracking.moved = true;
				clearTimeout(holdTimer);
			}
		}
		if (tracking.moved) {
			const value = percent(event);
			feedStep(value);
			current.set(value, current.updateMode !== 'release');
		}
	}

	function handleUp(event: PointerEvent) {
		if (!tracking || event.pointerId !== tracking.pointerId) return;
		if (tracking.held) {
			// the hold already acted; the release must not toggle on top of it
		} else if (!tracking.moved && current.tap) {
			current.tap();
		} else if (tracking.moved || current.tapSets) {
			const value = percent(event);
			// Always commit the final value. In release mode this is the gesture's
			// only service call; in continuous mode it guarantees the exact endpoint.
			vibrate('commit');
			current.set(value, true);
			current.end?.(value);
		}
		finishTracking(event.pointerId);
	}

	function finishTracking(pointerId: number) {
		clearTimeout(holdTimer);
		tracking = null;
		try {
			node.releasePointerCapture(pointerId);
		} catch {
			// capture may already have been released by the browser
		}
	}

	function handleCancel(event: PointerEvent) {
		if (!tracking || event.pointerId !== tracking.pointerId) return;
		// Cancellation means the browser handed the gesture to scrolling or
		// navigation. Clean up without turning that interruption into a command.
		finishTracking(event.pointerId);
	}

	node.addEventListener('pointerdown', handleDown);
	node.addEventListener('pointermove', handleMove);
	node.addEventListener('pointerup', handleUp);
	node.addEventListener('pointercancel', handleCancel);

	return {
		update(next) {
			current = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', handleDown);
			node.removeEventListener('pointermove', handleMove);
			node.removeEventListener('pointerup', handleUp);
			node.removeEventListener('pointercancel', handleCancel);
			if (tracking) finishTracking(tracking.pointerId);
		}
	};
};

export { onDndReceive, type DndReceiveDetail } from '$lib/ui/actions/sortable';
