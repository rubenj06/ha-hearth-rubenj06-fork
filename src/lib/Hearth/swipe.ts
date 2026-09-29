import type { Action } from 'svelte/action';
import { tick } from 'svelte';
import type { SwipeDirection, SwipeNavOptions } from './swipeNav';

/*
 * What the gesture needs from modules the eager bundle already holds. It gets
 * them handed in by swipeNav.ts: importing them here would split them into a
 * chunk of their own that the dashboard then loads eagerly anyway.
 */
export interface SwipeGestureOptions extends SwipeNavOptions {
	/** Slide duration in ms at the time of asking; 0 switches at once. */
	duration: () => number;
	/** Whether a control's own drag took this pointerdown (see gestures.ts). */
	claimed: (event: Event) => boolean;
	/** Eats the click that follows the current pointer release. */
	swallowClick: () => void;
}

/** Movement before a gesture picks an axis; anything shorter is still a tap. */
export const AXIS_LOCK_PX = 10;
/** Share of the page width a slow drag has to cover to change the page. */
export const COMMIT_FRACTION = 0.25;
/** Release speed in px/ms that changes the page however short the drag. */
export const FLING_VELOCITY = 0.5;
/** How much of the drag the page follows past the first or last page. */
export const EDGE_RESISTANCE = 0.3;

/** The axis a gesture moved along, once it moved far enough to tell. */
export function lockAxis(dx: number, dy: number): 'x' | 'y' | null {
	if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return null;
	return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

export interface SwipeRelease {
	dx: number;
	dy: number;
	/** Horizontal speed at release in px/ms, signed like dx. */
	velocity: number;
	width: number;
	hasPrevious: boolean;
	hasNext: boolean;
}

/**
 * Where a released horizontal drag goes: to a neighbouring page, or back to
 * the one it started on. A finger moving left pulls in the next page.
 */
export function swipeOutcome(release: SwipeRelease): SwipeDirection | null {
	const { dx, dy, velocity, width } = release;
	if (dx === 0 || Math.abs(dy) > Math.abs(dx)) return null;
	const direction: SwipeDirection = dx < 0 ? 'next' : 'previous';
	if (!(direction === 'next' ? release.hasNext : release.hasPrevious)) return null;
	const fast = Math.abs(velocity) > FLING_VELOCITY;
	// dragged far and then flicked back: the flick is the intent
	if (fast && Math.sign(velocity) !== Math.sign(dx)) return null;
	return fast || Math.abs(dx) > width * COMMIT_FRACTION ? direction : null;
}

/** How far the page follows a drag; it drags heavily where no page waits. */
export function resistedOffset(dx: number, hasPrevious: boolean, hasNext: boolean): number {
	const blocked = (dx > 0 && !hasPrevious) || (dx < 0 && !hasNext);
	return blocked ? dx * EDGE_RESISTANCE : dx;
}

/*
 * Anything that owns horizontal movement itself keeps it: form fields,
 * embedded pages and video, explicit opt-outs, a control whose own drag took
 * the pointer (a tile's brightness or position slide), and on the way up to
 * the page any element that takes raw touches (touch-action: none) or
 * scrolls sideways (a strip of scenes or shortcuts).
 */
const OWNS_GESTURE =
	'[data-no-swipe], input, textarea, select, [contenteditable]:not([contenteditable="false"]), iframe, video';

function ownedBelow(target: Element, root: HTMLElement): boolean {
	if (target.closest(OWNS_GESTURE)) return true;
	for (
		let element: Element | null = target;
		element && element !== root;
		element = element.parentElement
	) {
		const style = getComputedStyle(element);
		if (style.touchAction === 'none') return true;
		const scrollsSideways = style.overflowX === 'auto' || style.overflowX === 'scroll';
		if (scrollsSideways && element.scrollWidth > element.clientWidth) return true;
	}
	return false;
}

interface Gesture {
	pointerId: number;
	startX: number;
	startY: number;
	dx: number;
	dy: number;
	locked: boolean;
	// recent positions, for the speed at release
	samples: { x: number; time: number }[];
}

const VELOCITY_WINDOW_MS = 100;
/** A pointer held still this long before release has no fling left in it. */
export const STALE_SAMPLE_MS = 80;

/**
 * Horizontal speed in px/ms over the recent samples, as of `releaseTime`.
 * Only moves leave samples, so a pause before letting go shows up as a gap
 * between the last sample and the release, not as a slower last stretch.
 */
export function releaseVelocity(
	samples: readonly { x: number; time: number }[],
	releaseTime: number
): number {
	const first = samples[0];
	const last = samples[samples.length - 1];
	if (!first || releaseTime - last.time > STALE_SAMPLE_MS) return 0;
	const elapsed = last.time - first.time;
	return elapsed > 0 ? (last.x - first.x) / elapsed : 0;
}

/** Whether the phone is pinch-zoomed in, where sideways movement pans the view. */
function zoomedIn(): boolean {
	return (window.visualViewport?.scale ?? 1) > 1.01;
}

/**
 * Horizontal swipe between pages on the page container, for touch, pen and
 * mouse alike: the page follows the pointer and slides out and in when the
 * drag commits. The pointer is only captured once the gesture proves
 * horizontal, so taps and vertical scrolling behave as if nothing listened.
 */
export const swipeGesture: Action<HTMLElement, SwipeGestureOptions> = (node, options) => {
	let current = options;
	let gesture: Gesture | null = null;
	let settling = false;
	let destroyed = false;

	function applyTouchAction() {
		// the browser may still scroll vertically and zoom; sideways is ours,
		// unless the view is zoomed in and sideways is how it pans
		node.style.touchAction = current.enabled && !zoomedIn() ? 'pan-y pinch-zoom' : '';
	}

	function place(offset: number) {
		node.style.transform = offset ? `translateX(${offset}px)` : '';
	}

	function slide(offset: number, duration: number): Promise<void> {
		return new Promise((resolve) => {
			if (!duration) {
				node.style.transition = '';
				place(offset);
				resolve();
				return;
			}
			const done = () => {
				clearTimeout(fallback);
				node.removeEventListener('transitionend', finished);
				resolve();
			};
			const finished = (event: TransitionEvent) => {
				if (event.target === node && event.propertyName === 'transform') done();
			};
			// transitionend never fires for a hidden tab or an unchanged transform
			const fallback = setTimeout(done, duration + 50);
			node.addEventListener('transitionend', finished);
			node.style.transition = 'transform var(--h-motion-base) var(--h-ease)';
			place(offset);
		});
	}

	function reset() {
		node.style.transition = '';
		node.style.userSelect = '';
		place(0);
	}

	async function settle(direction: SwipeDirection | null) {
		settling = true;
		const duration = current.duration();
		if (direction) {
			const exit = (direction === 'next' ? -1 : 1) * node.clientWidth;
			await slide(exit, duration);
			// the dashboard went away mid-slide; there is no page left to switch
			if (destroyed) return;
			current.onswipe(direction);
			await tick();
			if (destroyed) return;
			if (duration) {
				node.style.transition = 'none';
				place(-exit);
				// commit the start position, or the browser skips straight to the end
				node.getBoundingClientRect();
			}
		}
		await slide(0, duration);
		if (destroyed) return;
		reset();
		settling = false;
	}

	function handleDown(event: PointerEvent) {
		if (!current.enabled || settling || !event.isPrimary || zoomedIn()) return;
		// an unlocked gesture whose release never reached this node (it landed
		// outside, or went to a control that stopped it) must not block the next
		if (gesture?.locked) return;
		gesture = null;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if (!(event.target instanceof Element)) return;
		if (current.claimed(event) || ownedBelow(event.target, node)) return;
		gesture = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			dx: 0,
			dy: 0,
			locked: false,
			samples: [{ x: event.clientX, time: event.timeStamp }]
		};
	}

	function handleMove(event: PointerEvent) {
		const active = gesture;
		if (!active || event.pointerId !== active.pointerId) return;
		// a mouse released outside the window never sends its pointerup here
		if (event.pointerType === 'mouse' && event.buttons === 0) {
			release(event);
			return;
		}
		active.dx = event.clientX - active.startX;
		active.dy = event.clientY - active.startY;
		if (!active.locked) {
			const axis = lockAxis(active.dx, active.dy);
			if (axis === 'y') gesture = null;
			if (axis !== 'x') return;
			active.locked = true;
			try {
				node.setPointerCapture(event.pointerId);
			} catch {
				// pointer capture is best-effort
			}
			// the release would otherwise click the tile the drag started on
			current.swallowClick();
			// a mouse drag has started selecting text by now
			getSelection()?.removeAllRanges();
			node.style.userSelect = 'none';
			node.style.transition = 'none';
		}
		active.samples.push({ x: event.clientX, time: event.timeStamp });
		while (
			active.samples.length > 2 &&
			event.timeStamp - active.samples[0].time > VELOCITY_WINDOW_MS
		) {
			active.samples.shift();
		}
		place(resistedOffset(active.dx, current.hasPrevious, current.hasNext));
	}

	function release(event: PointerEvent) {
		if (!gesture || event.pointerId !== gesture.pointerId) return;
		const ended = gesture;
		gesture = null;
		if (!ended.locked) return;
		try {
			node.releasePointerCapture(ended.pointerId);
		} catch {
			// capture may already have been released by the browser
		}
		const cancelled = event.type === 'pointercancel';
		void settle(
			cancelled
				? null
				: swipeOutcome({
						dx: ended.dx,
						dy: ended.dy,
						velocity: releaseVelocity(ended.samples, event.timeStamp),
						width: node.clientWidth,
						hasPrevious: current.hasPrevious,
						hasNext: current.hasNext
					})
		);
	}

	// a mouse drag over a picture or link would start the browser's own drag
	function handleDragStart(event: DragEvent) {
		if (gesture) event.preventDefault();
	}

	applyTouchAction();
	window.visualViewport?.addEventListener('resize', applyTouchAction);
	node.addEventListener('pointerdown', handleDown);
	node.addEventListener('pointermove', handleMove);
	node.addEventListener('pointerup', release);
	node.addEventListener('pointercancel', release);
	node.addEventListener('dragstart', handleDragStart);

	return {
		update(next) {
			current = next;
			applyTouchAction();
			// a layer opening mid-drag (a long press on the tile) takes over
			if (!current.enabled && gesture) {
				if (gesture.locked && node.hasPointerCapture(gesture.pointerId)) {
					node.releasePointerCapture(gesture.pointerId);
				}
				gesture = null;
				if (!settling) reset();
			}
		},
		destroy() {
			destroyed = true;
			window.visualViewport?.removeEventListener('resize', applyTouchAction);
			node.removeEventListener('pointerdown', handleDown);
			node.removeEventListener('pointermove', handleMove);
			node.removeEventListener('pointerup', release);
			node.removeEventListener('pointercancel', release);
			node.removeEventListener('dragstart', handleDragStart);
		}
	};
};
