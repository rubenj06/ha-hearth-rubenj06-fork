// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteImage, ImageRejected, listImages, readImage, saveImage } from './images';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let directory: string;

beforeEach(async () => {
	directory = join(await mkdtemp(join(tmpdir(), 'hearth-images-')), 'hearth-images');
});

afterEach(async () => {
	await rm(join(directory, '..'), { recursive: true, force: true });
});

describe('image storage', () => {
	it('stores an upload under its content hash and reads it back', async () => {
		const stored = await saveImage(PNG, directory);
		expect(stored.file).toMatch(/^[a-f0-9]{32}\.png$/);
		expect(stored.size).toBe(PNG.length);
		expect(new Uint8Array((await readImage(stored.file, directory))!)).toEqual(PNG);
		expect((await listImages(directory)).map((image) => image.file)).toEqual([stored.file]);
	});

	it('keeps one file for the same image uploaded twice', async () => {
		const first = await saveImage(PNG, directory);
		const second = await saveImage(PNG, directory);
		expect(second.file).toBe(first.file);
		expect(await readdir(directory)).toEqual([first.file]);
	});

	it('rejects anything that is not an accepted raster image', async () => {
		const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
		await expect(saveImage(svg, directory)).rejects.toBeInstanceOf(ImageRejected);
		await expect(saveImage(new Uint8Array(), directory)).rejects.toBeInstanceOf(ImageRejected);
	});

	it('lists nothing before the first upload', async () => {
		expect(await listImages(directory)).toEqual([]);
	});

	it('never reads or deletes outside the directory', async () => {
		await saveImage(PNG, directory);
		await writeFile(join(directory, '..', 'secret.yaml'), 'token: x');
		expect(await readImage('../secret.yaml', directory)).toBeUndefined();
		expect(await deleteImage('../secret.yaml', directory)).toBe(false);
	});

	it('does not follow a symlink planted under a valid name', async () => {
		const target = join(directory, '..', 'secret.yaml');
		await writeFile(target, 'token: x');
		const planted = `${'c'.repeat(32)}.png`;
		await saveImage(PNG, directory);
		await symlink(target, join(directory, planted));
		expect(await readImage(planted, directory)).toBeUndefined();
		expect((await listImages(directory)).map((image) => image.file)).not.toContain(planted);
	});

	it('deletes a stored image once', async () => {
		const { file } = await saveImage(PNG, directory);
		expect(await deleteImage(file, directory)).toBe(true);
		expect(await deleteImage(file, directory)).toBe(false);
		expect(await listImages(directory)).toEqual([]);
	});
});
