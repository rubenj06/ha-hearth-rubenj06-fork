import { act, fireEvent, render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../static/translations/en.json';
import { states } from '$lib/core/ha/entities';
import { hassEntity } from '$lib/core/ha/testing';
import { selectedLanguage } from '$lib/core/i18n';
import { DEFAULT_HEARTH_CONFIG, type RailWidget } from '../config';
import {
	activeAlerts,
	alertListOpen,
	cancelEdit,
	enterEditMode,
	hearthConfig,
	hearthEditMode,
	popup
} from '../store';
import RailWidgetRenderer from '../RailWidgetRenderer.svelte';

vi.mock('$lib/core/ha/connection', async (original) => ({
	...(await original<typeof import('$lib/core/ha/connection')>()),
	connected: readable(true)
}));

vi.mock('$lib/core/ha/history', async (original) => ({
	...(await original<typeof import('$lib/core/ha/history')>()),
	startDataRefresh: (load: () => Promise<unknown>, apply: (value: unknown) => void) => {
		void load().then(apply);
		return () => {};
	},
	cachedData: (_key: string, load: () => Promise<unknown>) => load(),
	fetchStateHistory: async () => ({}),
	fetchStatisticSeries: async () => null,
	fetchStatistics: async () => ({}),
	fetchCalendarEvents: async () => [],
	// late on Wednesday in UTC, already Thursday in Auckland
	subscribeForecast: async (
		_entity: string,
		_type: string,
		onForecast: (days: { datetime: string; temperature: number }[]) => void
	) => {
		onForecast([
			{ datetime: '2026-09-22T12:00:00Z', temperature: 18 },
			{ datetime: '2026-09-23T13:00:00Z', temperature: 19 }
		]);
		return () => {};
	}
}));

const widget = (config: Partial<RailWidget> & { type: RailWidget['type'] }) =>
	({ id: config.type, ...config }) as RailWidget;

describe('rail widgets', () => {
	beforeEach(() => {
		selectedLanguage.set('en');
		states.set({
			'weather.home': hassEntity('weather.home', 'unavailable'),
			'sensor.power': hassEntity('sensor.power', '12', { unit_of_measurement: 'W' }),
			'timer.tea': hassEntity('timer.tea', 'unavailable')
		});
	});

	afterEach(() => {
		if (get(hearthEditMode)) cancelEdit();
		hearthConfig.set(structuredClone(DEFAULT_HEARTH_CONFIG));
		popup.set(null);
	});

	it('shows an unreachable weather entity as unknown, not as a sunny reading', () => {
		const { container } = render(RailWidgetRenderer, {
			widget: widget({ type: 'weather', entity: 'weather.home' })
		});
		expect(container.textContent).not.toContain('-°');
		expect(container.textContent).not.toContain('clear_day');
		expect(container.textContent).toContain(en.unavailable);
	});

	it('names forecast days in the dashboard time zone', async () => {
		hearthConfig.set({
			...structuredClone(DEFAULT_HEARTH_CONFIG),
			rail: [{ id: 'clock', type: 'clock', timezone: 'Pacific/Auckland' }]
		});
		states.set({ 'weather.home': hassEntity('weather.home', 'sunny', { temperature: 20 }) });
		const { container } = render(RailWidgetRenderer, {
			widget: widget({ type: 'weather', entity: 'weather.home' })
		});
		await act();
		expect(container.querySelector('.day')?.textContent).toBe('THU');
	});

	it('shows no count for an unreachable timer', () => {
		render(RailWidgetRenderer, { widget: widget({ type: 'timer', entity: 'timer.tea' }) });
		expect(screen.queryByText('0:00')).toBeNull();
		expect(screen.getByText('-')).toBeTruthy();
	});

	it('hides an empty notification list until editing', async () => {
		const { container } = render(RailWidgetRenderer, {
			widget: widget({ type: 'notifications' })
		});
		expect(container.textContent).not.toContain(en.hearth_no_notifications);
		await act(() => enterEditMode());
		expect(container.textContent).toContain(en.hearth_no_notifications);
	});

	it('counts raised alerts and opens the list on a tap', async () => {
		activeAlerts.set([
			{ key: 'rule:fridge', title: 'Fridge door open', severity: 'warning', popup: true, since: 1 }
		]);
		render(RailWidgetRenderer, { widget: widget({ type: 'notifications' }) });
		const summary = screen.getByRole('button', { name: 'Notifications (1)' });
		expect(summary.textContent).toContain('Fridge door open');
		await fireEvent.click(summary);
		expect(get(alertListOpen)).toBe(true);
		activeAlerts.set([]);
		alertListOpen.set(false);
	});

	it('keeps an all-clear status widget findable while editing', async () => {
		const { container } = render(RailWidgetRenderer, { widget: widget({ type: 'status' }) });
		expect(container.textContent?.trim()).toBe('');
		await act(() => enterEditMode());
		expect(container.textContent).toContain(en.hearth_status_all_clear);
	});

	it('says there is no history for an empty timeline, as the line chart does', async () => {
		render(RailWidgetRenderer, {
			widget: widget({ type: 'chart', entity: 'sensor.power', style: 'history' })
		});
		await act();
		expect(screen.getByText(en.hearth_no_recorded_history_for_the_last)).toBeTruthy();
	});

	it('opens the entity detail from the whole glance row', async () => {
		render(RailWidgetRenderer, { widget: widget({ type: 'chart', entity: 'sensor.power' }) });
		await fireEvent.click(screen.getByRole('button', { name: /sensor\.power/ }));
		expect(get(popup)).toMatchObject({ kind: 'detail', entity: 'sensor.power' });

		popup.set(null);
		render(RailWidgetRenderer, {
			widget: widget({ type: 'status', text: 'Power', entity: 'sensor.power' })
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Power 12' }));
		expect(get(popup)).toMatchObject({ entity: 'sensor.power' });

		popup.set(null);
		states.set({ ...get(states), 'calendar.family': hassEntity('calendar.family', 'off') });
		render(RailWidgetRenderer, {
			widget: widget({ type: 'calendar', entities: ['calendar.family'] })
		});
		// the calendar hides with nothing coming up, so open it from its editing placeholder
		await act(() => enterEditMode());
		await fireEvent.click(
			screen.getByRole('button', { name: new RegExp(en.hearth_no_upcoming_events) })
		);
		expect(get(popup)).toMatchObject({ entity: 'calendar.family' });
	});

	it('leaves only the edit chip reacting while editing, except the page list', async () => {
		const { container } = render(RailWidgetRenderer, {
			widget: widget({ type: 'timer', entity: 'timer.tea' })
		});
		// jsdom does not reflect inert to the attribute, so read the property
		const content = () => container.querySelector<HTMLElement>('.widget-content');
		expect(content()?.inert).toBeFalsy();
		await act(() => enterEditMode());
		expect(content()?.inert).toBe(true);

		const nav = render(RailWidgetRenderer, { widget: widget({ type: 'nav' }) });
		expect(nav.container.querySelector<HTMLElement>('.widget-content')?.inert).toBeFalsy();
		expect(nav.container.querySelector('[aria-current="page"]')?.getAttribute('data-id')).toBe(
			'home'
		);
	});
});
