import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	confirmRequestedAction,
	dismissConfirmation,
	editor,
	requestedConfirmation
} from '../store';
import { configuration } from '$lib/core/app/configuration';
import { deviceName, saveDeviceName } from '$lib/core/app/device';
import en from '../../../../static/translations/en.json';
import AppSettingsEditSheet from './AppSettingsEditSheet.svelte';

function stageAChange() {
	return fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
}

describe('AppSettingsEditSheet', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => null }));
		editor.set({ kind: 'appSettings' });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		dismissConfirmation();
		editor.set(null);
	});

	it('closes straight away with nothing staged', async () => {
		render(AppSettingsEditSheet);
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(get(requestedConfirmation)).toBeNull();
		expect(get(editor)).toBeNull();
	});

	it('asks before close drops staged changes', async () => {
		render(AppSettingsEditSheet);
		await stageAChange();
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(get(editor)).toEqual({ kind: 'appSettings' });
		expect(get(requestedConfirmation)?.confirmLabel).toBe('Discard');
		confirmRequestedAction();
		expect(get(editor)).toBeNull();
	});

	it('asks before Escape drops staged changes', async () => {
		render(AppSettingsEditSheet);
		await stageAChange();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
		expect(get(editor)).toEqual({ kind: 'appSettings' });
		expect(get(requestedConfirmation)).not.toBeNull();
	});

	it('asks before back drops staged changes', async () => {
		render(AppSettingsEditSheet);
		await stageAChange();
		await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
		expect(get(editor)).toEqual({ kind: 'appSettings' });
		confirmRequestedAction();
		expect(get(editor)).toEqual({ kind: 'settings' });
	});

	it('asks before opening Custom CSS drops staged changes', async () => {
		render(AppSettingsEditSheet);
		await stageAChange();
		await fireEvent.click(screen.getByRole('button', { name: /Custom CSS/ }));
		expect(get(editor)).toEqual({ kind: 'appSettings' });
		confirmRequestedAction();
		expect(get(editor)).toEqual({ kind: 'customCss' });
	});

	it('closes without asking once a staged change is toggled back', async () => {
		render(AppSettingsEditSheet);
		await stageAChange();
		await stageAChange();
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(get(requestedConfirmation)).toBeNull();
		expect(get(editor)).toBeNull();
	});

	it('names its header action Save, since it writes to the server', () => {
		render(AppSettingsEditSheet);
		expect(screen.getByRole('button', { name: en.save })).toBeTruthy();
		expect(screen.queryByRole('button', { name: en.done })).toBeNull();
	});

	it('asks through the shared dialog before logging out', async () => {
		const confirmSpy = vi.fn(() => true);
		vi.stubGlobal('confirm', confirmSpy);
		render(AppSettingsEditSheet);
		await fireEvent.click(screen.getByRole('button', { name: new RegExp(en.log_out) }));
		expect(confirmSpy).not.toHaveBeenCalled();
		expect(get(requestedConfirmation)).toMatchObject({
			title: en.hearth_logout_confirm,
			confirmLabel: en.log_out
		});
	});
});

describe('AppSettingsEditSheet revision conflict', () => {
	const saves: Record<string, unknown>[] = [];

	beforeEach(() => {
		saves.length = 0;
		configuration.set({ locale: 'en', revision: 4 } as never);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (address: string, init?: RequestInit) => {
				if (!address.endsWith('/_api/save_config'))
					return { ok: false, json: async (): Promise<unknown> => null };
				const body: { revision?: number } = JSON.parse(String(init?.body));
				saves.push(body);
				return body.revision === 7
					? { ok: true, status: 200, json: async (): Promise<unknown> => ({ revision: 8 }) }
					: {
							ok: false,
							status: 409,
							json: async (): Promise<unknown> => ({ error: 'conflict', revision: 7 })
						};
			})
		);
		editor.set({ kind: 'appSettings' });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		dismissConfirmation();
		editor.set(null);
		configuration.set(undefined as never);
	});

	it('explains the conflict and overwrites with the revision the server returned', async () => {
		render(AppSettingsEditSheet);
		await stageAChange();
		await fireEvent.click(screen.getByRole('button', { name: en.save }));
		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain(en.hearth_app_settings_changed);
		expect(alert.textContent).not.toContain('409');
		expect(screen.getByRole('button', { name: en.hearth_reload })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: en.hearth_overwrite }));
		expect(get(requestedConfirmation)?.title).toBe(en.hearth_overwrite_newer_app_settings);
		confirmRequestedAction();
		await waitFor(() => expect(get(editor)).toBeNull());
		expect(saves.map((save) => save.revision)).toEqual([4, 7]);
		expect(get(configuration)?.revision).toBe(8);
	});
});

describe('AppSettingsEditSheet device name', () => {
	beforeEach(() => {
		configuration.set({ locale: 'en', revision: 1 } as never);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (address: string) =>
				address.endsWith('/_api/save_config')
					? { ok: true, status: 200, json: async (): Promise<unknown> => ({ revision: 2 }) }
					: { ok: false, json: async (): Promise<unknown> => null }
			)
		);
		editor.set({ kind: 'appSettings' });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		editor.set(null);
		configuration.set(undefined as never);
		saveDeviceName('');
	});

	it('keeps the name in this browser once saved', async () => {
		render(AppSettingsEditSheet);
		await fireEvent.input(screen.getByLabelText(en.hearth_device_name), {
			target: { value: ' kitchen ' }
		});
		await fireEvent.click(screen.getByRole('button', { name: en.save }));
		await waitFor(() => expect(get(editor)).toBeNull());
		expect(get(deviceName)).toBe('kitchen');
		expect(localStorage.getItem('hearthDevice')).toBe('kitchen');
	});

	it('leaves a name from the URL out of storage when another setting is saved', async () => {
		localStorage.removeItem('hearthDevice');
		deviceName.set('hall');
		render(AppSettingsEditSheet);
		await stageAChange();
		await fireEvent.click(screen.getByRole('button', { name: en.save }));
		await waitFor(() => expect(get(editor)).toBeNull());
		expect(localStorage.getItem('hearthDevice')).toBeNull();
		expect(get(deviceName)).toBe('hall');
	});
});
