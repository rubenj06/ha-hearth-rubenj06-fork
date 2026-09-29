import { base } from '$app/paths';
import { imageFileOf, imageRef } from '$lib/core/images';

export interface LibraryImage {
	file: string;
	size: number;
	modified: number;
}

/** The address an image value loads from: uploads resolve under the app's base path, URLs pass through. */
export function imageSource(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	const file = imageFileOf(trimmed);
	if (!file) return trimmed;
	// absolute, so a CSS url() resolves the same wherever the variable is used
	return new URL(`${base}/_api/hearth_images/${file}`, location.href).href;
}

/** A theme's `url(...)` background with an uploaded image resolved to its address. */
export function resolveBackgroundImage(value: string | undefined): string | undefined {
	const match = value?.match(/^url\((['"]?)(hearth-images\/[^'")]+)\1\)$/);
	if (!match) return value;
	const source = imageSource(match[2]);
	return source ? `url("${source}")` : value;
}

const MAX_EDGE = 2560;
const QUALITY = 0.85;

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Scales a picked file down to wall-display size and re-encodes it, which
 * also drops camera metadata such as the location a photo was taken. GIFs
 * keep their animation and are sent unchanged, as is anything the browser
 * cannot decode; the server decides whether that is an image it accepts.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
	if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		return file;
	}
	try {
		const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		const context = canvas.getContext('2d');
		if (!context) return file;
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		// browsers without a WebP encoder return PNG for it; JPEG is smaller then
		const webp = await encode(canvas, 'image/webp');
		const encoded = webp?.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg');
		return encoded ?? file;
	} finally {
		bitmap.close();
	}
}

async function failure(response: Response, fallback: string): Promise<Error> {
	const detail = await response
		.json()
		.then((body) => body?.message)
		.catch(() => undefined);
	return new Error(`${detail ?? fallback} [${response.status}]`);
}

/** Uploads a picked file and returns the reference to store in the config. */
export async function uploadImage(file: Blob): Promise<string> {
	const body = await prepareImage(file);
	const response = await fetch(`${base}/_api/hearth_images`, {
		method: 'POST',
		headers: { 'Content-Type': body.type || 'application/octet-stream' },
		body
	});
	if (!response.ok) throw await failure(response, 'upload failed');
	const stored: LibraryImage = await response.json();
	return imageRef(stored.file);
}

export async function listLibraryImages(): Promise<LibraryImage[]> {
	const response = await fetch(`${base}/_api/hearth_images`);
	if (!response.ok) throw await failure(response, 'could not list images');
	return response.json();
}

export async function deleteLibraryImage(file: string): Promise<void> {
	const response = await fetch(`${base}/_api/hearth_images`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ file })
	});
	if (!response.ok && response.status !== 404) throw await failure(response, 'delete failed');
}
