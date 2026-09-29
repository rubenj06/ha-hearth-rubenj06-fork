import { error } from '@sveltejs/kit';
import { IMAGE_TYPES, type ImageExtension } from '$lib/core/images';
import { readImage } from '$lib/server/images';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const bytes = await readImage(params.file).catch(() => undefined);
	if (!bytes) error(404, 'image not found');

	const extension = params.file.slice(params.file.lastIndexOf('.') + 1) as ImageExtension;
	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': IMAGE_TYPES[extension],
			'Content-Length': String(bytes.length),
			// the name is the content's hash, so a stored file never changes
			'Cache-Control': 'public, max-age=31536000, immutable',
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'; sandbox"
		}
	});
};
