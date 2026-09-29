import { afterEach, describe, expect, it, vi } from 'vitest';
import { longPress } from './interaction';

function pointer(type: string, clientX: number, clientY = 0, isPrimary = true) {
	const event = new Event(type) as PointerEvent;
	Object.defineProperties(event, {
		clientX: { value: clientX },
		clientY: { value: clientY },
		pointerId: { value: 1 },
		isPrimary: { value: isPrimary }
	});
	return event;
}

describe('longPress', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('holds after 500ms without movement', () => {
		vi.useFakeTimers();
		const node = new EventTarget();
		const hold = vi.fn();
		longPress(node as unknown as HTMLElement, { hold });

		node.dispatchEvent(pointer('pointerdown', 20));
		vi.advanceTimersByTime(500);
		expect(hold).toHaveBeenCalledOnce();
	});

	it('ignores non-primary pointers', () => {
		vi.useFakeTimers();
		const node = new EventTarget();
		const hold = vi.fn();
		longPress(node as unknown as HTMLElement, { hold });

		node.dispatchEvent(pointer('pointerdown', 20, 0, false));
		vi.advanceTimersByTime(600);
		expect(hold).not.toHaveBeenCalled();
	});

	it('replaces the pending timer on a repeated pointerdown, so a cancel stops it', () => {
		vi.useFakeTimers();
		const node = new EventTarget();
		const hold = vi.fn();
		longPress(node as unknown as HTMLElement, { hold });

		node.dispatchEvent(pointer('pointerdown', 20));
		vi.advanceTimersByTime(200);
		node.dispatchEvent(pointer('pointerdown', 20));
		node.dispatchEvent(pointer('pointerup', 20));
		vi.advanceTimersByTime(600);
		expect(hold).not.toHaveBeenCalled();
	});
});
