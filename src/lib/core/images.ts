/*
 * Uploaded images are stored content-addressed under data/hearth-images and
 * referenced from the config as `hearth-images/<file>`. The reference carries
 * no base path, since the Ingress path changes per session; it is resolved to
 * a URL only when rendered.
 */

export const IMAGE_REF_PREFIX = 'hearth-images/';

/** Largest accepted upload, in bytes. */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;

export const IMAGE_TYPES = {
	png: 'image/png',
	jpg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif'
} as const;

export type ImageExtension = keyof typeof IMAGE_TYPES;

export const IMAGE_FILE_PATTERN = /^[a-f0-9]{32}\.(png|jpg|gif|webp|avif)$/;

export function imageRef(file: string): string {
	return IMAGE_REF_PREFIX + file;
}

/** The stored file name an image reference points at, or undefined for anything else. */
export function imageFileOf(value: string | undefined): string | undefined {
	if (!value?.startsWith(IMAGE_REF_PREFIX)) return undefined;
	const file = value.slice(IMAGE_REF_PREFIX.length);
	return IMAGE_FILE_PATTERN.test(file) ? file : undefined;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
	return signature.every((byte, index) => bytes[offset + index] === byte);
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/**
 * The image format from the file's own leading bytes. The declared content
 * type is never trusted: a file served back from this origin must be the
 * raster image it claims to be, never markup a browser could render.
 */
export function sniffImageType(bytes: Uint8Array): ImageExtension | undefined {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
	if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'gif';
	if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'webp';
	if (
		startsWith(bytes, ascii('ftyp'), 4) &&
		['avif', 'avis'].some((brand) => startsWith(bytes, ascii(brand), 8))
	) {
		return 'avif';
	}
	return undefined;
}

/** Every uploaded image a config value references, found anywhere in its tree. */
export function referencedImageFiles(value: unknown, found = new Set<string>()): Set<string> {
	if (typeof value === 'string') {
		for (const match of value.matchAll(/hearth-images\/([a-f0-9]{32}\.[a-z]+)/g)) {
			if (IMAGE_FILE_PATTERN.test(match[1])) found.add(match[1]);
		}
	} else if (Array.isArray(value)) {
		for (const entry of value) referencedImageFiles(entry, found);
	} else if (value && typeof value === 'object') {
		for (const entry of Object.values(value)) referencedImageFiles(entry, found);
	}
	return found;
}
