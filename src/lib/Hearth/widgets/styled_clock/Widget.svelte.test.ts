import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectedLanguage } from '$lib/core/i18n';
import type { StyledClockWidget } from './descriptor';
import Widget from './Widget.svelte';

const clock = (fields: Partial<StyledClockWidget> = {}): StyledClockWidget => ({
	id: 'styled',
	type: 'styled_clock',
	timezone: 'Europe/Amsterdam',
	...fields
});

describe('styled clock widget', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// 14:05:09 in Amsterdam
		vi.setSystemTime(new Date(Date.UTC(2026, 0, 15, 13, 5, 9)));
		selectedLanguage.set('en');
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('draws an analog face by default with hands at the current time', () => {
		const { container } = render(Widget, { widget: clock() });
		const face = screen.getByRole('img');
		expect(face.tagName.toLowerCase()).toBe('svg');
		expect(face.getAttribute('aria-label')).toMatch(/02:05|14:05/);
		const minute = container.querySelector('.minute-hand')?.getAttribute('transform');
		expect(minute).toBe('rotate(30.9 50 50)');
		expect(container.querySelector('.second-hand')).toBeNull();
		expect(container.querySelector('.date')?.textContent).toContain('January 15');
	});

	it('adds a second hand when seconds are shown', () => {
		const { container } = render(Widget, { widget: clock({ show_seconds: true }) });
		expect(container.querySelector('.second-hand')?.getAttribute('transform')).toBe(
			'rotate(54 50 50)'
		);
	});

	it('shows flip cards with the 24-hour digits', () => {
		const { container } = render(Widget, {
			widget: clock({ style: 'flip', hour_format: '24', show_seconds: true })
		});
		const digits = [...container.querySelectorAll('.digit')].map((node) => node.textContent);
		expect(digits).toEqual(['1', '4', '0', '5', '0', '9']);
		expect(container.querySelector('.period')).toBeNull();
	});

	it('marks the day period on a 12-hour flip clock and can hide the date', () => {
		const { container } = render(Widget, {
			widget: clock({ style: 'flip', hour_format: '12', hide_date: true })
		});
		const digits = [...container.querySelectorAll('.digit')].map((node) => node.textContent);
		expect(digits).toEqual(['0', '2', '0', '5']);
		expect(container.querySelector('.period')?.textContent).toBe('PM');
		expect(container.querySelector('.date')).toBeNull();
	});
});
