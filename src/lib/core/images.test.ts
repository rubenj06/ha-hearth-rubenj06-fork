import { describe, expect, it } from 'vitest';
import { imageFileOf, imageRef, referencedImageFiles, sniffImageType } from './images';

const FILE = `${'a'.repeat(32)}.webp`;

const bytes = (...parts: (number[] | string)[]) =>
	new Uint8Array(
		parts.flatMap((part) => (typeof part === 'string' ? [...Buffer.from(part)] : part))
	);

describe('sniffImageType', () => {
	it('reads each accepted format from its leading bytes', () => {
		expect(sniffImageType(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
		expect(sniffImageType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
		expect(sniffImageType(bytes('GIF89a'))).toBe('gif');
		expect(sniffImageType(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('webp');
		expect(sniffImageType(bytes([0, 0, 0, 0x1c], 'ftypavif'))).toBe('avif');
	});

	it('refuses markup whatever it is called', () => {
		expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
		expect(sniffImageType(bytes('<html><script>'))).toBeUndefined();
		expect(sniffImageType(new Uint8Array())).toBeUndefined();
	});
});

describe('image references', () => {
	it('round-trips a stored file name', () => {
		expect(imageFileOf(imageRef(FILE))).toBe(FILE);
	});

	it('does not treat URLs or malformed names as uploads', () => {
		expect(imageFileOf('https://example.com/a.jpg')).toBeUndefined();
		expect(imageFileOf('/local/hearth-images/a.jpg')).toBeUndefined();
		expect(imageFileOf('hearth-images/../configuration.yaml')).toBeUndefined();
		expect(imageFileOf(`hearth-images/${'a'.repeat(32)}.svg`)).toBeUndefined();
		expect(imageFileOf(undefined)).toBeUndefined();
	});

	it('finds uploads referenced anywhere in a config', () => {
		const other = `${'b'.repeat(32)}.jpg`;
		const config = {
			theme: { background_image: `url(hearth-images/${FILE})` },
			pages: [{ cards: [{ type: 'header', background_image: imageRef(other) }] }],
			unrelated: 'https://example.com/hearth-images/x.jpg'
		};
		expect([...referencedImageFiles(config)].sort()).toEqual([other, FILE].sort());
	});
});
