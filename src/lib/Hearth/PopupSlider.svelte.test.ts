import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import PopupSlider from './PopupSlider.svelte';

function pointer(type: string, clientX: number) {
	const event = new Event(type) as PointerEvent;
	Object.defineProperties(event, {
		clientX: { value: clientX },
		pointerId: { value: 1 }
	});
	return event;
}

describe('PopupSlider', () => {
	it('reaches every step of a wide range by dragging, not only whole percents', () => {
		const onchange = vi.fn();
		render(PopupSlider, {
			label: 'Level',
			icon: 'tune',
			value: 0,
			variant: 'blue',
			min: 0,
			max: 1000,
			step: 1,
			updateMode: 'release',
			onchange
		});
		const bar = screen.getByRole('slider');
		bar.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect;
		bar.setPointerCapture = vi.fn();
		bar.releasePointerCapture = vi.fn();
		bar.dispatchEvent(pointer('pointerdown', 0));
		bar.dispatchEvent(pointer('pointermove', 201));
		bar.dispatchEvent(pointer('pointerup', 201));
		expect(onchange).toHaveBeenLastCalledWith(201, true);
	});

	it('commits the value at a tapped spot', () => {
		const onchange = vi.fn();
		render(PopupSlider, {
			label: 'Level',
			icon: 'tune',
			value: 0,
			variant: 'amber',
			updateMode: 'release',
			onchange
		});
		const bar = screen.getByRole('slider');
		bar.getBoundingClientRect = () => ({ left: 0, width: 200 }) as DOMRect;
		bar.setPointerCapture = vi.fn();
		bar.releasePointerCapture = vi.fn();
		bar.dispatchEvent(pointer('pointerdown', 150));
		bar.dispatchEvent(pointer('pointerup', 150));
		expect(onchange).toHaveBeenCalledExactlyOnceWith(75, true);
	});
});
