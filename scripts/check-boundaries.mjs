import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';

/*
 * Import boundary check. Layers are matched by path prefix and may only import
 * from the layers listed in `allowed` (plus themselves, node_modules and
 * SvelteKit virtual modules). Covers static imports, re-exports and dynamic import() in .ts,
 * .js, .svelte and .css files (including vi.mock specifiers and @import).
 */

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const LAYERS = [
	{
		name: 'model',
		match: [
			'src/lib/Hearth/model/',
			'src/lib/Hearth/config.ts',
			'src/lib/Hearth/types.ts',
			'src/lib/Hearth/schema.ts',
			'src/lib/Hearth/normalizers.ts',
			'src/lib/Hearth/normalize.ts',
			'src/lib/Hearth/format.ts',
			'src/lib/Hearth/clock.ts'
		],
		allowed: ['core']
	},
	{
		name: 'hearth',
		match: ['src/lib/Hearth/'],
		allowed: ['model', 'core', 'ui']
	},
	{ name: 'server', match: ['src/lib/server/'], allowed: ['core'] },
	{ name: 'ui', match: ['src/lib/ui/'], allowed: ['core'] },
	{ name: 'core', match: ['src/lib/core/'], allowed: [] },
	{
		name: 'routes',
		match: ['src/routes/', 'src/hooks.server.ts'],
		allowed: ['hearth', 'model', 'core', 'ui', 'server']
	}
];

function layerOf(file) {
	return LAYERS.find((layer) => layer.match.some((prefix) => file.startsWith(prefix)))?.name;
}

function allowedFrom(layer) {
	const definition = LAYERS.find((entry) => entry.name === layer);
	return new Set([layer, ...(definition?.allowed ?? [])]);
}

async function* walk(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else if (/\.(ts|js|svelte|css)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) yield path;
	}
}

// the optional whitespace after import/export also catches minified-style
// `import{x}from'./y'`, which Prettier never writes but a hand edit might
const IMPORT_PATTERN =
	/(?:import|export)\s*[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]|vi\.mock\(\s*['"]([^'"]+)['"]|@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/g;

function resolveTarget(fromFile, specifier) {
	// SvelteKit generates ./$types next to every route; it is not a layer
	if (specifier === './$types') return null;
	const path = specifier.startsWith('$lib/')
		? posix.join('src/lib', specifier.slice(5))
		: specifier.startsWith('./') || specifier.startsWith('../')
			? posix.normalize(posix.join(posix.dirname(fromFile), specifier))
			: null;
	if (!path) return null;
	// Static fixtures and package metadata are data, outside the source layers.
	if (!path.startsWith('src/')) return null;
	return (
		[path, `${path}.ts`, `${path}.js`, `${path}/index.ts`].find((candidate) =>
			existsSync(join(ROOT, candidate))
		) ?? path
	);
}

let failures = 0;
for await (const absolute of walk(SRC)) {
	const file = relative(ROOT, absolute).split('\\').join('/');
	const layer = layerOf(file);
	if (!layer) {
		console.error(`${file}: source file has no architectural layer`);
		failures += 1;
		continue;
	}
	const allowed = allowedFrom(layer);
	const source = await readFile(absolute, 'utf8');
	for (const match of source.matchAll(IMPORT_PATTERN)) {
		const specifier = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
		const target = resolveTarget(file, specifier);
		if (!target) continue;
		const targetLayer = layerOf(target);
		if (targetLayer && allowed.has(targetLayer)) continue;
		failures += 1;
		const line = source.slice(0, match.index).split('\n').length;
		console.error(`${file}:${line} ${layer} may not import ${targetLayer} (${specifier})`);
	}
}

if (failures) {
	console.error(`Boundary check failed with ${failures} violation(s).`);
	process.exitCode = 1;
} else {
	console.log('Boundary check passed.');
}
