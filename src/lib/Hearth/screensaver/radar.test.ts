import { describe, expect, it } from 'vitest';
import { parseRadarFrames, planFrames, radarView } from './radar';

const home = { latitude: 51.1, longitude: 17 };

describe('radarView', () => {
	it('centers on the Home Assistant home by default', () => {
		expect(radarView(undefined, home)).toMatchObject({
			latitude: 51.1,
			longitude: 17,
			zoom: 6,
			basemap: 'dark'
		});
	});

	it('prefers an explicit location', () => {
		expect(
			radarView({ latitude: 52.23, longitude: 21.01, zoom: 4, basemap: 'light' }, home)
		).toMatchObject({ latitude: 52.23, longitude: 21.01, zoom: 4, basemap: 'light' });
	});

	it('falls back to home when only one coordinate is set', () => {
		expect(radarView({ latitude: 0 }, home)).toMatchObject(home);
	});

	it('keeps an explicit location at 0, 0', () => {
		expect(radarView({ latitude: 0, longitude: 0 }, home)).toMatchObject({
			latitude: 0,
			longitude: 0
		});
	});

	it('shows nothing without any location', () => {
		expect(radarView({ zoom: 5 }, undefined)).toBeUndefined();
	});

	it('clamps the zoom to what RainViewer serves', () => {
		expect(radarView({ zoom: 11 }, home)?.zoom).toBe(7);
	});
});

describe('parseRadarFrames', () => {
	it('builds 512 px Universal Blue tile templates, oldest first', () => {
		expect(
			parseRadarFrames({
				host: 'https://tilecache.rainviewer.com',
				radar: {
					past: [
						{ time: 1200, path: '/v2/radar/b' },
						{ time: 600, path: '/v2/radar/a' },
						{ time: 'soon', path: '/v2/radar/c' }
					]
				}
			})
		).toEqual([
			{ time: 600, tiles: 'https://tilecache.rainviewer.com/v2/radar/a/512/{z}/{x}/{y}/2/1_1.png' },
			{ time: 1200, tiles: 'https://tilecache.rainviewer.com/v2/radar/b/512/{z}/{x}/{y}/2/1_1.png' }
		]);
	});

	it('returns nothing for an unusable body', () => {
		expect(parseRadarFrames(null)).toEqual([]);
		expect(parseRadarFrames({ host: 'http://plain', radar: { past: [] } })).toEqual([]);
		expect(parseRadarFrames({ host: 'https://x', radar: {} })).toEqual([]);
	});
});

describe('planFrames', () => {
	const frames = Array.from({ length: 13 }, (_, index) => ({
		time: index,
		tiles: `https://t/${index}/{z}/{x}/{y}.png`
	}));

	it('keeps only the six newest frames, or the newest one without motion', () => {
		expect(planFrames([], frames, true).wanted.map((frame) => frame.time)).toEqual([
			7, 8, 9, 10, 11, 12
		]);
		expect(planFrames([], frames, false).wanted.map((frame) => frame.time)).toEqual([12]);
	});

	it('reuses healthy layers, rebuilds failed ones and drops stale ones', () => {
		const plan = planFrames(
			[
				{ tiles: frames[6].tiles, failed: false },
				{ tiles: frames[7].tiles, failed: false },
				{ tiles: frames[8].tiles, failed: true }
			],
			frames,
			true
		);
		expect([...plan.keep]).toEqual([frames[7].tiles]);
		expect([...plan.drop].sort()).toEqual([frames[6].tiles, frames[8].tiles].sort());
	});

	it('rebuilds the only frame without motion when it timed out loading', () => {
		const plan = planFrames([{ tiles: frames[12].tiles, failed: true }], frames, false);
		expect(plan.keep.size).toBe(0);
		expect([...plan.drop]).toEqual([frames[12].tiles]);
		expect(plan.wanted).toEqual([frames[12]]);
	});
});

describe('radarView basemap', () => {
	it('uses OpenStreetMap unless a tile URL is set', () => {
		expect(radarView(undefined, home)).toMatchObject({
			tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
			osm: true
		});
		expect(radarView(undefined, home)?.attribution).toContain('OpenStreetMap');
	});

	it('shows a custom provider credit as text, never markup', () => {
		expect(
			radarView(
				{ tile_url: 'https://tiles.example/{z}/{x}/{y}.png', attribution: '<b>Me</b> & co' },
				home
			)
		).toMatchObject({
			tiles: 'https://tiles.example/{z}/{x}/{y}.png',
			attribution: '&lt;b&gt;Me&lt;/b&gt; &amp; co',
			osm: false
		});
	});
});
