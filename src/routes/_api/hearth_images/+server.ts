import { json, error } from '@sveltejs/kit';
import { deleteImage, ImageRejected, listImages, saveImage } from '$lib/server/images';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ setHeaders }) => {
	try {
		setHeaders({ 'Cache-Control': 'max-age=0' });
		return json(await listImages());
	} catch (err: any) {
		error(500, err.message);
	}
};

/** The request body is the image file itself; its format is read from the bytes. */
export const POST: RequestHandler = async ({ request }) => {
	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await request.arrayBuffer());
	} catch (err: any) {
		// adapter-node refuses bodies over BODY_SIZE_LIMIT while reading
		error(413, err?.message ?? 'upload too large');
	}

	try {
		return json(await saveImage(bytes));
	} catch (err: any) {
		if (err instanceof ImageRejected) error(400, err.message);
		error(500, err.message);
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body.file !== 'string') error(400, 'invalid body');

	let deleted;
	try {
		deleted = await deleteImage(body.file);
	} catch (err: any) {
		error(500, err.message);
	}
	if (!deleted) error(404, 'image not found');
	return json({ file: body.file });
};
