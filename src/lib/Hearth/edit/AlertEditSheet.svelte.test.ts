import { fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import en from '../../../../static/translations/en.json';
import { DEFAULT_HEARTH_CONFIG } from '../config';
import { cancelEdit, editor, enterEditMode, hearthConfig } from '../store';
import AlertEditSheet from './AlertEditSheet.svelte';

describe('AlertEditSheet', () => {
	beforeEach(() => {
		hearthConfig.set({
			...structuredClone(DEFAULT_HEARTH_CONFIG),
			alerts: [
				{
					id: 'fridge',
					title: 'Fridge door open',
					severity: 'warning',
					conditions: [{ entity: 'binary_sensor.fridge_door', state: 'on' }],
					for_seconds: 120
				}
			]
		});
		enterEditMode();
	});

	afterEach(() => {
		cancelEdit();
		hearthConfig.set(structuredClone(DEFAULT_HEARTH_CONFIG));
	});

	it('saves an edited rule and returns to settings', async () => {
		render(AlertEditSheet, { index: 0 });
		await fireEvent.input(screen.getByLabelText(en.hearth_title), {
			target: { value: 'Fridge still open' }
		});
		await fireEvent.input(screen.getByLabelText(en.hearth_alert_delay), {
			target: { value: '60' }
		});
		await fireEvent.click(screen.getByRole('button', { name: en.done }));
		expect(get(hearthConfig).alerts).toEqual([
			{
				id: 'fridge',
				title: 'Fridge still open',
				message: undefined,
				icon: undefined,
				severity: 'warning',
				conditions: [{ entity: 'binary_sensor.fridge_door', state: 'on' }],
				for_seconds: 60,
				entity: undefined,
				popup: undefined,
				auto_close: undefined
			}
		]);
		expect(get(editor)).toEqual({ kind: 'settings' });
	});

	it('blocks Done for a delay that is not a whole number of seconds', async () => {
		render(AlertEditSheet, { index: 0 });
		await fireEvent.input(screen.getByLabelText(en.hearth_alert_delay), {
			target: { value: '1.5' }
		});
		expect(screen.getByText(en.hearth_alert_delay_invalid)).toBeTruthy();
		expect(screen.getByRole('button', { name: en.done })).toHaveProperty('disabled', true);
	});

	it('needs a condition before a new rule can be added', () => {
		render(AlertEditSheet, { index: null });
		expect(screen.getByRole('button', { name: en.done })).toHaveProperty('disabled', true);
	});
});
