import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../static/translations/en.json';
import { DEFAULT_HEARTH_CONFIG } from '../config';
import {
	cancelEdit,
	confirmRequestedAction,
	copyState,
	dismissConfirmation,
	enterEditMode,
	hearthConfig,
	hearthEditMode,
	requestedConfirmation,
	saveState,
	updateConfig
} from '../store';
import { configDocument } from '../transfer';
import EditBar from './EditBar.svelte';

function renderBar() {
	return render(EditBar);
}

describe('EditBar', () => {
	beforeEach(() => {
		hearthConfig.set(structuredClone(DEFAULT_HEARTH_CONFIG));
		enterEditMode();
	});

	afterEach(() => {
		dismissConfirmation();
		cancelEdit();
		saveState.set('idle');
		copyState.set('idle');
		vi.unstubAllGlobals();
	});

	it('leaves the area import to the settings sheet', () => {
		renderBar();
		expect(screen.queryByRole('button', { name: en.hearth_setup })).toBeNull();
	});

	it('cancels at once when nothing changed', async () => {
		renderBar();
		await fireEvent.click(screen.getByRole('button', { name: en.cancel }));
		expect(get(requestedConfirmation)).toBeNull();
		expect(get(hearthEditMode)).toBe(false);
	});

	it('asks before Cancel throws away edits', async () => {
		renderBar();
		updateConfig((config) => {
			config.rooms[0].name = 'Renamed';
		});
		await fireEvent.click(screen.getByRole('button', { name: en.cancel }));
		expect(get(hearthEditMode)).toBe(true);
		expect(get(requestedConfirmation)).toMatchObject({
			title: en.hearth_discard_edits_title,
			confirmLabel: en.hearth_discard
		});
		confirmRequestedAction();
		expect(get(hearthEditMode)).toBe(false);
		expect(get(hearthConfig).rooms[0].name).toBe(DEFAULT_HEARTH_CONFIG.rooms[0].name);
	});

	it('publishes its height to the parent so the toasts can clear it', async () => {
		// jsdom lays nothing out; stand in for a bar wrapped onto two rows
		const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(104);
		try {
			const { container, unmount } = renderBar();
			await waitFor(() =>
				expect(container.style.getPropertyValue('--h-edit-bar-height')).toBe('104px')
			);
			unmount();
			expect(container.style.getPropertyValue('--h-edit-bar-height')).toBe('');
		} finally {
			height.mockRestore();
		}
	});

	describe('copying edits after a conflict', () => {
		beforeEach(() => saveState.set('conflict'));

		it('copies the YAML document and reports it without touching the save state', async () => {
			const writeText = vi.fn().mockResolvedValue(undefined);
			vi.stubGlobal('navigator', { clipboard: { writeText } });
			renderBar();
			await fireEvent.click(screen.getByRole('button', { name: en.hearth_copy_edits }));
			await waitFor(() => expect(get(copyState)).toBe('copied'));
			expect(writeText).toHaveBeenCalledWith(configDocument(get(hearthConfig)));
			expect(get(saveState)).toBe('conflict');
		});

		it('reports a failed copy as a copy failure, not a failed save', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			vi.stubGlobal('navigator', {
				clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
			});
			renderBar();
			await fireEvent.click(screen.getByRole('button', { name: en.hearth_copy_edits }));
			await waitFor(() => expect(get(copyState)).toBe('failed'));
			expect(get(saveState)).toBe('conflict');
			expect(screen.queryByText(en.hearth_save_failed)).toBeNull();
		});
	});
});
