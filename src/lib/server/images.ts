import { createHash, randomUUID } from 'crypto';
import { join } from 'path';
import { lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { IMAGE_FILE_PATTERN, IMAGE_MAX_BYTES, sniffImageType } from '$lib/core/images';

export const IMAGES_DIR = './data/hearth-images';

export interface StoredImage {
	file: string;
	size: number;
	/** Milliseconds since the epoch. */
	modified: number;
}

export class ImageRejected extends Error {}

/**
 * Stores an upload under a name derived from its content, so the same image
 * uploaded twice is one file and a stored file never changes.
 */
export async function saveImage(bytes: Uint8Array, directory = IMAGES_DIR): Promise<StoredImage> {
	if (!bytes.length) throw new ImageRejected('empty upload');
	if (bytes.length > IMAGE_MAX_BYTES) throw new ImageRejected('image too large');
	const extension = sniffImageType(bytes);
	if (!extension) throw new ImageRejected('unsupported image type');

	const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
	const file = `${hash}.${extension}`;
	const path = join(directory, file);
	await mkdir(directory, { recursive: true });

	const existing = await lstat(path).catch(() => undefined);
	if (existing) {
		if (!existing.isFile()) throw new ImageRejected('invalid image target');
		return { file, size: existing.size, modified: existing.mtimeMs };
	}

	const temporary = `${path}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, bytes, { flag: 'wx' });
		await rename(temporary, path);
	} catch (error) {
		await unlink(temporary).catch(() => {});
		throw error;
	}
	return { file, size: bytes.length, modified: Date.now() };
}

export async function listImages(directory = IMAGES_DIR): Promise<StoredImage[]> {
	let names: string[];
	try {
		names = await readdir(directory);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
		throw error;
	}
	const images = await Promise.all(
		names
			.filter((name) => IMAGE_FILE_PATTERN.test(name))
			.map(async (file) => {
				const info = await lstat(join(directory, file)).catch(() => undefined);
				return info?.isFile() ? { file, size: info.size, modified: info.mtimeMs } : undefined;
			})
	);
	return images
		.filter((image) => image !== undefined)
		.sort((a, b) => b.modified - a.modified || a.file.localeCompare(b.file));
}

/** The image's bytes, or undefined for a name that is not a stored plain file. */
export async function readImage(file: string, directory = IMAGES_DIR): Promise<Buffer | undefined> {
	if (!IMAGE_FILE_PATTERN.test(file)) return undefined;
	const path = join(directory, file);
	// symlinks planted in the directory are not followed
	const info = await lstat(path).catch(() => undefined);
	if (!info?.isFile()) return undefined;
	return readFile(path);
}

/** Removes a stored image; false when there was none by that name. */
export async function deleteImage(file: string, directory = IMAGES_DIR): Promise<boolean> {
	if (!IMAGE_FILE_PATTERN.test(file)) return false;
	try {
		await unlink(join(directory, file));
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
		throw error;
	}
}
