import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimGesture, gestureClaimed, swallowNextClick } from '$lib/ui/gestures';
import {
	COMMIT_FRACTION,
	EDGE_RESISTANCE,
	lockAxis,
	releaseVelocity,
	resistedOffset,
	STALE_SAMPLE_MS,
	swipeGesture,
	swipeOutcome,
	type SwipeRelease
} from './swipe';
import { neighborRoom } from './swipeNav';

const release = (overrides: Partial<SwipeRelease>): SwipeRelease => ({
	dx: 0,
	dy: 0,
	velocity: 0,
	width: 400,
	hasPrevious: true,
	hasNext: true,
	...overrides
});

describe('lockAxis', () => {
	it('waits until the pointer moved far enough to tell', () => {
		expect(lockAxis(6, 4)).toBeNull();
		expect(lockAxis(-9, 0)).toBeNull();
	});

	it('picks the axis the pointer travelled further along', () => {
		expect(lockAxis(12, 4)).toBe('x');
		expect(lockAxis(-12, 11)).toBe('x');
		expect(lockAxis(4, -12)).toBe('y');
	});

	it('treats a diagonal as vertical, so scrolling wins a tie', () => {
		expect(lockAxis(11, 11)).toBe('y');
	});
});

describe('swipeOutcome', () => {
	it('moves to the next page when dragged left past the threshold', () => {
		expect(swipeOutcome(release({ dx: -400 * COMMIT_FRACTION - 1 }))).toBe('next');
	});

	it('moves to the previous page when dragged right past the threshold', () => {
		expect(swipeOutcome(release({ dx: 400 * COMMIT_FRACTION + 1 }))).toBe('previous');
	});

	it('springs back from a slow drag short of the threshold', () => {
		expect(swipeOutcome(release({ dx: -60, velocity: -0.1 }))).toBeNull();
	});

	it('commits a quick flick however short', () => {
		expect(swipeOutcome(release({ dx: -30, velocity: -0.9 }))).toBe('next');
		expect(swipeOutcome(release({ dx: 30, velocity: 0.9 }))).toBe('previous');
	});

	it('cancels a long drag that was flicked back', () => {
		expect(swipeOutcome(release({ dx: -300, velocity: 0.9 }))).toBeNull();
	});

	it('cancels when the pointer ended up moving more vertically', () => {
		expect(swipeOutcome(release({ dx: -150, dy: 200, velocity: -0.9 }))).toBeNull();
	});

	it('does not wrap past the first or last page', () => {
		expect(swipeOutcome(release({ dx: -300, hasNext: false }))).toBeNull();
		expect(swipeOutcome(release({ dx: 300, hasPrevious: false }))).toBeNull();
		expect(swipeOutcome(release({ dx: -300, hasPrevious: false }))).toBe('next');
	});

	it('ignores a release where it started', () => {
		expect(swipeOutcome(release({ dx: 0, velocity: 2 }))).toBeNull();
	});
});

describe('resistedOffset', () => {
	it('follows the pointer where a page waits', () => {
		expect(resistedOffset(-120, true, true)).toBe(-120);
		expect(resistedOffset(80, true, false)).toBe(80);
	});

	it('drags heavily past the first and last page', () => {
		expect(resistedOffset(100, false, true)).toBeCloseTo(100 * EDGE_RESISTANCE);
		expect(resistedOffset(-100, true, false)).toBeCloseTo(-100 * EDGE_RESISTANCE);
	});
});

describe('neighborRoom', () => {
	const rooms = [{ id: 'office' }, { id: 'kitchen' }, { id: 'garage' }];

	it('steps through the pages in their configured order', () => {
		expect(neighborRoom(rooms, 'kitchen', 'next')).toBe('garage');
		expect(neighborRoom(rooms, 'kitchen', 'previous')).toBe('office');
	});

	it('stops at either end', () => {
		expect(neighborRoom(rooms, 'garage', 'next')).toBeUndefined();
		expect(neighborRoom(rooms, 'office', 'previous')).toBeUndefined();
	});

	it('finds nothing for a page that is gone', () => {
		expect(neighborRoom(rooms, 'attic', 'next')).toBeUndefined();
	});
});

describe('releaseVelocity', () => {
	const samples = [
		{ x: 200, time: 0 },
		{ x: 150, time: 50 },
		{ x: 100, time: 100 }
	];

	it('measures the speed over the recent moves', () => {
		expect(releaseVelocity(samples, 110)).toBe(-1);
	});

	it('has no fling left after the pointer rested before release', () => {
		expect(releaseVelocity(samples, 100 + STALE_SAMPLE_MS + 1)).toBe(0);
	});

	it('is still for a single sample', () => {
		expect(releaseVelocity([{ x: 5, time: 10 }], 12)).toBe(0);
	});
});

describe('swipeGesture', () => {
	let clock = 0;

	function pointer(type: string, x: number, y: number, pause = 0) {
		const event = new Event(type, { bubbles: true }) as PointerEvent;
		clock += 16 + pause;
		const fields = {
			timeStamp: clock,
			clientX: x,
			clientY: y,
			pointerId: 1,
			isPrimary: true,
			pointerType: 'touch',
			button: 0,
			buttons: 1
		};
		for (const [key, value] of Object.entries(fields)) {
			Object.defineProperty(event, key, { value });
		}
		return event;
	}

	function setup(enabled = true) {
		const node = document.createElement('main');
		const tile = document.createElement('button');
		node.append(tile);
		document.body.append(node);
		Object.defineProperty(node, 'clientWidth', { value: 400 });
		node.setPointerCapture = vi.fn();
		node.releasePointerCapture = vi.fn();
		node.hasPointerCapture = vi.fn(() => false);
		const onswipe = vi.fn();
		const action = swipeGesture(node, {
			enabled,
			hasPrevious: true,
			hasNext: true,
			onswipe,
			duration: () => 0,
			claimed: gestureClaimed,
			swallowClick: swallowNextClick
		});
		const drag = (points: [number, number][], end = 'pointerup', pause = 0) => {
			tile.dispatchEvent(pointer('pointerdown', 200, 100));
			for (const [x, y] of points) tile.dispatchEvent(pointer('pointermove', x, y));
			const [x, y] = points[points.length - 1];
			tile.dispatchEvent(pointer(end, x, y, pause));
		};
		return { node, tile, onswipe, drag, action };
	}

	afterEach(() => {
		document.body.innerHTML = '';
		getSelection()?.removeAllRanges();
		vi.unstubAllGlobals();
		Reflect.deleteProperty(window, 'visualViewport');
	});

	it('commits a short quick flick but not one held still before release', async () => {
		const flick = setup();
		flick.drag([
			[190, 100],
			[170, 100],
			[150, 100]
		]);
		await vi.waitFor(() => expect(flick.onswipe).toHaveBeenCalledWith('next'));

		const held = setup();
		held.drag(
			[
				[190, 100],
				[170, 100],
				[150, 100]
			],
			'pointerup',
			STALE_SAMPLE_MS + 50
		);
		await vi.waitFor(() => expect(held.node.style.transform).toBe(''));
		expect(held.onswipe).not.toHaveBeenCalled();
	});

	it('leaves sideways movement to the browser while the view is zoomed in', () => {
		const viewport = Object.assign(new EventTarget(), { scale: 2 });
		Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
		const { node, onswipe, drag } = setup();
		expect(node.style.touchAction).toBe('');
		drag([
			[190, 100],
			[20, 100]
		]);
		expect(onswipe).not.toHaveBeenCalled();

		viewport.scale = 1;
		viewport.dispatchEvent(new Event('resize'));
		expect(node.style.touchAction).toBe('pan-y pinch-zoom');
	});

	it('swipes even while text elsewhere is selected', async () => {
		const { tile, onswipe, drag } = setup();
		tile.textContent = 'Desk lamp';
		getSelection()?.selectAllChildren(tile);
		drag([
			[190, 100],
			[20, 100]
		]);
		await vi.waitFor(() => expect(onswipe).toHaveBeenCalledWith('next'));
		expect(getSelection()?.isCollapsed).toBe(true);
	});

	it('is not stuck on a press whose release it never saw', async () => {
		const { tile, onswipe, drag } = setup();
		tile.dispatchEvent(pointer('pointerdown', 200, 100));
		tile.dispatchEvent(pointer('pointermove', 203, 101));
		drag([
			[190, 100],
			[20, 100]
		]);
		await vi.waitFor(() => expect(onswipe).toHaveBeenCalledWith('next'));
	});

	it('does not switch pages once the page is gone', async () => {
		const { onswipe, drag, action } = setup();
		drag([
			[190, 100],
			[20, 100]
		]);
		action?.destroy?.();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(onswipe).not.toHaveBeenCalled();
	});

	it('changes the page after a long horizontal drag', async () => {
		const { node, onswipe, drag } = setup();
		drag([
			[190, 101],
			[150, 102],
			[60, 104]
		]);
		await vi.waitFor(() => expect(onswipe).toHaveBeenCalledWith('next'));
		expect(node.setPointerCapture).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(node.style.transform).toBe(''));
	});

	it('leaves a tap and a vertical scroll alone', () => {
		const { node, onswipe, drag } = setup();
		drag([[203, 102]]);
		drag([
			[202, 120],
			[150, 260]
		]);
		expect(onswipe).not.toHaveBeenCalled();
		expect(node.setPointerCapture).not.toHaveBeenCalled();
		expect(node.style.transform).toBe('');
	});

	it('does nothing while disabled', () => {
		const { onswipe, drag } = setup(false);
		drag([
			[190, 100],
			[20, 100]
		]);
		expect(onswipe).not.toHaveBeenCalled();
	});

	it('leaves gestures that start on an opted-out element to it', () => {
		const { tile, onswipe, drag } = setup();
		tile.setAttribute('data-no-swipe', '');
		drag([
			[190, 100],
			[20, 100]
		]);
		expect(onswipe).not.toHaveBeenCalled();
	});

	it('leaves gestures a control claimed for its own drag to it', () => {
		const { tile, onswipe, drag } = setup();
		tile.addEventListener('pointerdown', claimGesture);
		drag([
			[190, 100],
			[20, 100]
		]);
		expect(onswipe).not.toHaveBeenCalled();
	});

	it('springs back when the browser cancels the gesture', async () => {
		const { onswipe, drag, node } = setup();
		drag(
			[
				[190, 100],
				[20, 100]
			],
			'pointercancel'
		);
		await vi.waitFor(() => expect(node.style.transform).toBe(''));
		expect(onswipe).not.toHaveBeenCalled();
	});

	it('swallows the click that follows a horizontal drag', () => {
		const { tile, drag } = setup();
		const clicked = vi.fn();
		tile.addEventListener('click', clicked);
		drag([
			[190, 100],
			[20, 100]
		]);
		tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(clicked).not.toHaveBeenCalled();
	});
});
