import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const link = response.headers.get('link');
	if (!link || !response.headers.get('content-type')?.startsWith('text/html')) return response;
	// SvelteKit lists every preloaded chunk in a Link header, which pushes the
	// response headers past the 4k buffer of an nginx proxy in front of Home
	// Assistant ingress. Outside prerendering it writes no matching <link> tags,
	// so move the preloads into the page instead of dropping them.
	const tags = link
		.split(/,\s*(?=<)/)
		.map((entry) => {
			const [target, ...parameters] = entry.split(/;\s*/);
			const attributes = parameters.filter((parameter) => parameter !== 'nopush');
			return `<link href="${target.slice(1, -1)}" ${attributes.join(' ')}>`;
		})
		.join('\n\t\t');
	const body = (await response.text()).replace('</head>', `\t${tags}\n\t</head>`);
	const headers = new Headers(response.headers);
	headers.delete('link');
	headers.delete('content-length');
	return new Response(body, { status: response.status, headers });
};
