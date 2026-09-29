// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FILE = `${'a'.repeat(32)}.png`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

const storage = vi.hoisted(() => {
	class ImageRejected extends Error {}
	return {
		ImageRejected,
		saveImage: vi.fn(),
		listImages: vi.fn(async () => []),
		readImage: vi.fn(),
		deleteImage: vi.fn()
	};
});

vi.mock('$lib/server/images', () => storage);

import { DELETE, POST } from './+server';
import { GET as FILE_GET } from './[file]/+server';

const post = (body: BodyInit) =>
	POST({
		request: new Request('http://localhost/_api/hearth_images', { method: 'POST', body })
	} as any);

describe('Hearth images endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('stores the request body and returns the stored file', async () => {
		storage.saveImage.mockResolvedValue({ file: FILE, size: PNG.length, modified: 1 });
		const response = await post(PNG);
		expect(await response.json()).toEqual({ file: FILE, size: PNG.length, modified: 1 });
		expect(new Uint8Array(storage.saveImage.mock.calls[0][0])).toEqual(PNG);
	});

	it('answers 400 for an upload the storage rejects', async () => {
		storage.saveImage.mockRejectedValue(new storage.ImageRejected('unsupported image type'));
		await expect(post('<svg/>')).rejects.toMatchObject({ status: 400 });
	});

	it('answers 404 when deleting an image that is not there', async () => {
		storage.deleteImage.mockResolvedValue(false);
		const request = new Request('http://localhost/_api/hearth_images', {
			method: 'DELETE',
			body: JSON.stringify({ file: FILE })
		});
		await expect(DELETE({ request } as any)).rejects.toMatchObject({ status: 404 });
	});

	it('serves a stored image as an inert, immutable file', async () => {
		storage.readImage.mockResolvedValue(Buffer.from(PNG));
		const response = await FILE_GET({ params: { file: FILE } } as any);
		expect(response.headers.get('Content-Type')).toBe('image/png');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Cache-Control')).toContain('immutable');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
	});

	it('answers 404 for a file that is not stored', async () => {
		storage.readImage.mockResolvedValue(undefined);
		await expect(FILE_GET({ params: { file: '../hearth.yaml' } } as any)).rejects.toMatchObject({
			status: 404
		});
	});
});
