import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HEARTH_CONFIG } from '../config';
import { resolveBackgroundImage } from '../images';
import { confirmRequestedAction, hearthConfig, requestedConfirmation } from '../store';
import ImageField from './ImageField.svelte';

const FILE = `${'a'.repeat(32)}.webp`;
const OTHER = `${'b'.repeat(32)}.jpg`;

describe('ImageField', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === 'POST') {
				return { ok: true, json: async () => ({ file: FILE, size: 3, modified: 1 }) };
			}
			if (init?.method === 'DELETE') return { ok: true, json: async () => ({ file: OTHER }) };
			return {
				ok: true,
				json: async () => [
					{ file: FILE, size: 2048, modified: 2 },
					{ file: OTHER, size: 4096, modified: 1 }
				]
			};
		});
		vi.stubGlobal('fetch', fetchMock);
		hearthConfig.set(structuredClone(DEFAULT_HEARTH_CONFIG));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		requestedConfirmation.set(null);
	});

	it('uploads a picked file and commits its reference', async () => {
		const onchange = vi.fn();
		const { container } = render(ImageField, { label: 'Background image', onchange });
		const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
		const file = new File([new Uint8Array([1, 2, 3])], 'room.png', { type: 'image/png' });
		await fireEvent.change(input, { target: { files: [file] } });

		await waitFor(() => expect(onchange).toHaveBeenCalledWith(`hearth-images/${FILE}`));
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toMatch(/\/_api\/hearth_images$/);
		expect(init.method).toBe('POST');
		expect(screen.getByLabelText('Background image')).toHaveProperty(
			'value',
			`hearth-images/${FILE}`
		);
	});

	it('shows why an upload was refused', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: async () => ({ message: 'unsupported image type' })
		});
		const { container } = render(ImageField, { label: 'Background image' });
		const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
		await fireEvent.change(input, { target: { files: [new File(['<svg/>'], 'x.svg')] } });
		expect(await screen.findByRole('alert')).toHaveProperty(
			'textContent',
			'Could not upload the image: unsupported image type [400]'
		);
	});

	it('picks an image from the library', async () => {
		const onchange = vi.fn();
		render(ImageField, { label: 'Background image', onchange });
		await fireEvent.click(screen.getByRole('button', { name: 'Uploaded images' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Use this image (4 KB)' }));
		expect(onchange).toHaveBeenCalledWith(`hearth-images/${OTHER}`);
	});

	it('warns before deleting an image the dashboard still uses, then clears it', async () => {
		hearthConfig.update((config) => ({
			...config,
			theme: { background_image: `url(hearth-images/${OTHER})` }
		}));
		const onchange = vi.fn();
		render(ImageField, { label: 'Background image', value: `hearth-images/${OTHER}`, onchange });
		await fireEvent.click(screen.getByRole('button', { name: 'Uploaded images' }));
		const deletes = await screen.findAllByRole('button', { name: 'Delete image' });
		await fireEvent.click(deletes[1]);

		expect(get(requestedConfirmation)?.message).toMatch(/still uses this image/);
		confirmRequestedAction();
		await waitFor(() => expect(onchange).toHaveBeenCalledWith(''));
		const [, init] = fetchMock.mock.calls.at(-1)!;
		expect(init).toMatchObject({ method: 'DELETE', body: JSON.stringify({ file: OTHER }) });
		expect(screen.getAllByRole('button', { name: 'Delete image' })).toHaveLength(1);
	});
});

describe('resolveBackgroundImage', () => {
	it('resolves an uploaded theme background to an absolute address', () => {
		expect(resolveBackgroundImage(`url(hearth-images/${FILE})`)).toBe(
			`url("${location.origin}/_api/hearth_images/${FILE}")`
		);
	});

	it('leaves other backgrounds alone', () => {
		expect(resolveBackgroundImage('url(/local/wall.jpg)')).toBe('url(/local/wall.jpg)');
		expect(resolveBackgroundImage('none')).toBe('none');
		expect(resolveBackgroundImage(undefined)).toBeUndefined();
	});
});
