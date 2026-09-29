import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptics } from '$lib/core/app/haptics';
import { horizontalDrag, onDndReceive } from './drag';

class TestNode extends EventTarget {
	setPointerCapture = vi.fn();
	releasePointerCapture = vi.fn();
	getBoundingClientRect() {
		return { left: 10, width: 200 } as DOMRect;
	}
}

function pointer(type: string, clientX: number, clientY = 0, pointerId = 1, isPrimary = true) {
	const event = new Event(type) as PointerEvent;
	Object.defineProperties(event, {
		clientX: { value: clientX },
		clientY: { value: clientY },
		pointerId: { value: pointerId },
		isPrimary: { value: isPrimary }
	});
	return event;
}

describe('horizontalDrag touch feedback', () => {
	const vibrateSpy = vi.fn<(timings: VibratePattern) => boolean>(() => true);

	afterEach(() => {
		haptics.set(false);
		vi.unstubAllGlobals();
		Reflect.deleteProperty(navigator, 'vibrate');
	});

	function asPhone() {
		// jsdom serves an insecure origin, which the haptics layer refuses
		Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
		Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true });
		vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
		vibrateSpy.mockClear();
		haptics.set(true);
	}

	it('ticks once per step crossed and once on the commit', () => {
		asPhone();
		const node = new TestNode();
		horizontalDrag(node as unknown as HTMLElement, { set: vi.fn(), step: 25 });

		node.dispatchEvent(pointer('pointerdown', 10));
		// drift below the threshold is not a drag yet, so it is silent
		node.dispatchEvent(pointer('pointermove', 15));
		// 25% and 50% cross two step boundaries
		node.dispatchEvent(pointer('pointermove', 60));
		node.dispatchEvent(pointer('pointermove', 110));
		// the same step again is silent
		node.dispatchEvent(pointer('pointermove', 112));
		expect(vibrateSpy).toHaveBeenCalledTimes(2);

		node.dispatchEvent(pointer('pointerup', 210));
		expect(vibrateSpy).toHaveBeenCalledTimes(3);
	});

	it('stays silent while the drag stays inside the step it started in', () => {
		asPhone();
		const node = new TestNode();
		horizontalDrag(node as unknown as HTMLElement, { set: vi.fn(), step: 25 });

		// down at 0%, dragged to 12%: past the movement threshold, same step
		node.dispatchEvent(pointer('pointerdown', 10));
		node.dispatchEvent(pointer('pointermove', 34));
		expect(vibrateSpy).not.toHaveBeenCalled();
	});

	it('stays silent for a tap, which sets no value', () => {
		asPhone();
		const node = new TestNode();
		horizontalDrag(node as unknown as HTMLElement, { set: vi.fn(), tap: vi.fn() });

		node.dispatchEvent(pointer('pointerdown', 20));
		node.dispatchEvent(pointer('pointerup', 24));
		expect(vibrateSpy).not.toHaveBeenCalled();
	});

	it('ticks the commit for a tap that sets the value', () => {
		asPhone();
		const node = new TestNode();
		horizontalDrag(node as unknown as HTMLElement, { set: vi.fn(), tapSets: true });

		node.dispatchEvent(pointer('pointerdown', 110));
		node.dispatchEvent(pointer('pointerup', 110));
		expect(vibrateSpy).toHaveBeenCalledOnce();
	});
});

describe('horizontalDrag', () => {
	it('previews continuously, commits the endpoint and removes listeners', () => {
		const node = new TestNode();
		const set = vi.fn();
		const end = vi.fn();
		const action = horizontalDrag(node as unknown as HTMLElement, { set, end });

		node.dispatchEvent(pointer('pointerdown', 20));
		node.dispatchEvent(pointer('pointermove', 110));
		node.dispatchEvent(pointer('pointerup', 210));
		expect(set).toHaveBeenNthCalledWith(1, 50, true);
		expect(set).toHaveBeenNthCalledWith(2, 100, true);
		expect(end).toHaveBeenCalledWith(100);

		action?.destroy?.();
		node.dispatchEvent(pointer('pointerdown', 20));
		node.dispatchEvent(pointer('pointermove', 110));
		expect(set).toHaveBeenCalledTimes(2);
	});

	it('uses a tap below the movement threshold and honors updated options', () => {
		const node = new TestNode();
		const firstTap = vi.fn();
		const secondTap = vi.fn();
		const action = horizontalDrag(node as unknown as HTMLElement, { set: vi.fn(), tap: firstTap });
		action?.update?.({ set: vi.fn(), tap: secondTap });
		node.dispatchEvent(pointer('pointerdown', 20));
		node.dispatchEvent(pointer('pointerup', 24));
		expect(firstTap).not.toHaveBeenCalled();
		expect(secondTap).toHaveBeenCalledOnce();
	});

	it('does not turn ordinary ten-pixel tap drift into a value change', () => {
		const node = new TestNode();
		const set = vi.fn();
		const tap = vi.fn();
		horizontalDrag(node as unknown as HTMLElement, { set, tap });
		node.dispatchEvent(pointer('pointerdown', 20));
		node.dispatchEvent(pointer('pointermove', 30));
		node.dispatchEvent(pointer('pointerup', 30));
		expect(tap).toHaveBeenCalledOnce();
		expect(set).not.toHaveBeenCalled();
	});

	it('cleans up a cancelled gesture without committing or tapping', () => {
		const node = new TestNode();
		const set = vi.fn();
		const tap = vi.fn();
		const action = horizontalDrag(node as unknown as HTMLElement, { set, tap });

		node.dispatchEvent(pointer('pointerdown', 20));
		node.dispatchEvent(pointer('pointercancel', 25));
		node.dispatchEvent(pointer('pointerup', 210));

		expect(set).not.toHaveBeenCalled();
		expect(tap).not.toHaveBeenCalled();
		expect(node.releasePointerCapture).toHaveBeenCalledWith(1);
		action?.destroy?.();
	});
});

describe('horizontalDrag vertical movement', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('abandons a gesture that goes vertical first, with no tap, hold or value', () => {
		vi.useFakeTimers();
		const node = new TestNode();
		const set = vi.fn();
		const tap = vi.fn();
		const hold = vi.fn();
		horizontalDrag(node as unknown as HTMLElement, { set, tap, hold });

		node.dispatchEvent(pointer('pointerdown', 20, 100));
		node.dispatchEvent(pointer('pointermove', 22, 130));
		// sideways movement after the scroll started must not turn into a drag
		node.dispatchEvent(pointer('pointermove', 150, 160));
		vi.advanceTimersByTime(600);
		node.dispatchEvent(pointer('pointerup', 150, 160));

		expect(set).not.toHaveBeenCalled();
		expect(tap).not.toHaveBeenCalled();
		expect(hold).not.toHaveBeenCalled();
		expect(node.releasePointerCapture).toHaveBeenCalledWith(1);
	});

	it('keeps a horizontal drag going when it later drifts vertically', () => {
		const node = new TestNode();
		const set = vi.fn();
		horizontalDrag(node as unknown as HTMLElement, { set });

		node.dispatchEvent(pointer('pointerdown', 20, 100));
		node.dispatchEvent(pointer('pointermove', 60, 102));
		node.dispatchEvent(pointer('pointermove', 110, 160));
		node.dispatchEvent(pointer('pointerup', 110, 160));

		expect(set).toHaveBeenLastCalledWith(50, true);
		expect(set).toHaveBeenCalledTimes(3);
	});

	it('still taps after small vertical drift', () => {
		const node = new TestNode();
		const tap = vi.fn();
		horizontalDrag(node as unknown as HTMLElement, { set: vi.fn(), tap });

		node.dispatchEvent(pointer('pointerdown', 20, 100));
		node.dispatchEvent(pointer('pointermove', 22, 108));
		node.dispatchEvent(pointer('pointerup', 22, 108));
		expect(tap).toHaveBeenCalledOnce();
	});
});

describe('horizontalDrag pointer tracking', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('ignores non-primary pointers and a second pointer while one is tracked', () => {
		const node = new TestNode();
		const set = vi.fn();
		horizontalDrag(node as unknown as HTMLElement, { set });

		node.dispatchEvent(pointer('pointerdown', 20, 0, 2, false));
		node.dispatchEvent(pointer('pointermove', 110, 0, 2, false));
		expect(set).not.toHaveBeenCalled();
		expect(node.setPointerCapture).not.toHaveBeenCalled();

		node.dispatchEvent(pointer('pointerdown', 20, 0, 1));
		node.dispatchEvent(pointer('pointerdown', 150, 0, 3));
		node.dispatchEvent(pointer('pointermove', 110, 0, 1));
		node.dispatchEvent(pointer('pointerup', 110, 0, 1));
		expect(node.setPointerCapture).toHaveBeenCalledOnce();
		expect(set).toHaveBeenLastCalledWith(50, true);
	});

	it('fires one hold when the tracked pointer goes down again', () => {
		vi.useFakeTimers();
		const node = new TestNode();
		const hold = vi.fn();
		horizontalDrag(node as unknown as HTMLElement, { set: vi.fn(), hold });

		node.dispatchEvent(pointer('pointerdown', 20));
		vi.advanceTimersByTime(300);
		node.dispatchEvent(pointer('pointerdown', 20));
		vi.advanceTimersByTime(600);
		expect(hold).toHaveBeenCalledOnce();
	});
});

describe('horizontalDrag tapSets', () => {
	it('commits the value under a stationary tap', () => {
		const node = new TestNode();
		const set = vi.fn();
		const end = vi.fn();
		horizontalDrag(node as unknown as HTMLElement, { set, end, tapSets: true });

		node.dispatchEvent(pointer('pointerdown', 60));
		node.dispatchEvent(pointer('pointerup', 62));
		expect(set).toHaveBeenCalledExactlyOnceWith(26, true);
		expect(end).toHaveBeenCalledWith(26);
	});

	it('ignores a right click', () => {
		const node = new TestNode();
		const set = vi.fn();
		horizontalDrag(node as unknown as HTMLElement, { set, tapSets: true });

		const down = pointer('pointerdown', 60);
		Object.defineProperty(down, 'button', { value: 2 });
		node.dispatchEvent(down);
		node.dispatchEvent(pointer('pointerup', 60));
		expect(set).not.toHaveBeenCalled();
	});

	it('leaves a stationary tap alone without the option', () => {
		const node = new TestNode();
		const set = vi.fn();
		horizontalDrag(node as unknown as HTMLElement, { set });

		node.dispatchEvent(pointer('pointerdown', 60));
		node.dispatchEvent(pointer('pointerup', 60));
		expect(set).not.toHaveBeenCalled();
	});
});

describe('onDndReceive', () => {
	it('forwards detail, stops bubbling, and detaches on destroy', () => {
		const node = new TestNode();
		const handler = vi.fn();
		const action = onDndReceive(node as unknown as HTMLElement, handler);
		const event = new Event('dndreceive', { bubbles: true }) as CustomEvent;
		Object.defineProperty(event, 'detail', { value: { id: 'card', newIndex: 2 } });
		const stop = vi.spyOn(event, 'stopPropagation');
		node.dispatchEvent(event);
		expect(handler).toHaveBeenCalledWith({ id: 'card', newIndex: 2 });
		expect(stop).toHaveBeenCalledOnce();
		action?.destroy?.();
		node.dispatchEvent(event);
		expect(handler).toHaveBeenCalledOnce();
	});
});
