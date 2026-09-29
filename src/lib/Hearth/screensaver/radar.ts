import { RADAR_ZOOM, type ScreensaverRadar } from '../config';

/*
 * RainViewer's public Weather Maps API: free for personal use, radar tiles up
 * to zoom 7, and since 2026 only the Universal Blue colour scheme. Tiles are
 * requested at 512 px (one zoom level down) to keep a full screen of frames
 * well under the per-IP rate limit.
 */
export const RAINVIEWER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const RADAR_COLOR_SCHEME = 2;
const RADAR_OPTIONS = '1_1'; // smoothed, snow drawn in its own colours
export const RADAR_TILE_SIZE = 512;
export const RADAR_ATTRIBUTION = '<a href="https://www.rainviewer.com/">RainViewer</a>';

/*
 * OpenStreetMap's own tile server: keyless, fine for a single display that
 * requests only what it shows, and it must credit OSM. There is no dark
 * variant, so the dark style is a CSS filter over these tiles. (CARTO's
 * basemaps now watermark every tile requested without an API key.)
 */
export const BASEMAP_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const BASEMAP_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export interface RadarFrame {
	time: number;
	/** Leaflet tile URL template for this frame. */
	tiles: string;
}

export interface RadarView {
	latitude: number;
	longitude: number;
	zoom: number;
	basemap: 'dark' | 'light';
	/** Basemap tile template; OpenStreetMap when unset. */
	tiles: string;
	/** Basemap credit as HTML, ready for Leaflet's attribution control. */
	attribution: string;
	/** Whether the tiles are OpenStreetMap's, which the dark style filters. */
	osm: boolean;
}

interface HomeLocation {
	latitude?: number;
	longitude?: number;
}

const isCoordinate = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

/**
 * Where the radar map looks. An explicit location needs both coordinates;
 * anything less falls back to the Home Assistant home. Without either there
 * is nothing to show.
 */
export function radarView(
	radar: ScreensaverRadar | undefined,
	home: HomeLocation | undefined
): RadarView | undefined {
	const explicit = isCoordinate(radar?.latitude) && isCoordinate(radar?.longitude);
	const source = explicit ? radar : home;
	if (!isCoordinate(source?.latitude) || !isCoordinate(source?.longitude)) return undefined;
	return {
		latitude: source.latitude,
		longitude: source.longitude,
		zoom: Math.min(RADAR_ZOOM.max, Math.max(RADAR_ZOOM.min, radar?.zoom ?? RADAR_ZOOM.fallback)),
		basemap: radar?.basemap ?? 'dark',
		tiles: radar?.tile_url ?? BASEMAP_TILES,
		attribution: radar?.tile_url ? escapeHtml(radar.attribution ?? '') : BASEMAP_ATTRIBUTION,
		osm: !radar?.tile_url
	};
}

function escapeHtml(text: string): string {
	return text.replace(
		/[&<>"']/g,
		(char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
	);
}

/*
 * A full screen of 512 px tiles is 15 to 25 requests per frame, and every
 * frame stays decoded in memory. Six frames (an hour) keep a first load well
 * under RainViewer's burst limit and the bitmaps small enough for a tablet.
 */
export const RADAR_FRAME_LIMIT = 6;

export interface FrameLayerState {
	tiles: string;
	/** Some tile of this frame failed to load, so it has holes. */
	failed: boolean;
}

export interface FramePlan {
	/** The frames to show, oldest first. */
	wanted: RadarFrame[];
	/** Existing layers that can stay as they are. */
	keep: Set<string>;
	/** Existing layers to remove: gone from the list, or failed and rebuilt. */
	drop: Set<string>;
}

/**
 * Which radar layers a new frame list needs. Only the newest frames are
 * kept (one when not animating); a layer that lost tiles is rebuilt rather
 * than reused, so a refresh repairs holes left by a rate limit or a dropout.
 */
export function planFrames(
	existing: FrameLayerState[],
	frames: RadarFrame[],
	animate: boolean
): FramePlan {
	const wanted = frames.slice(-(animate ? RADAR_FRAME_LIMIT : 1));
	const wantedTiles = new Set(wanted.map((frame) => frame.tiles));
	const keep = new Set<string>();
	const drop = new Set<string>();
	for (const layer of existing) {
		if (wantedTiles.has(layer.tiles) && !layer.failed) keep.add(layer.tiles);
		else drop.add(layer.tiles);
	}
	return { wanted, keep, drop };
}

/** The past radar frames in a weather-maps.json body, oldest first; empty when unusable. */
export function parseRadarFrames(body: unknown): RadarFrame[] {
	const maps = body as { host?: unknown; radar?: { past?: unknown } } | null;
	const host = maps?.host;
	const past = maps?.radar?.past;
	if (typeof host !== 'string' || !host.startsWith('https://') || !Array.isArray(past)) return [];
	return past
		.filter(
			(frame): frame is { time: number; path: string } =>
				typeof frame?.time === 'number' &&
				typeof frame?.path === 'string' &&
				frame.path.startsWith('/')
		)
		.sort((a, b) => a.time - b.time)
		.map(({ time, path }) => ({
			time,
			tiles: `${host}${path}/${RADAR_TILE_SIZE}/{z}/{x}/{y}/${RADAR_COLOR_SCHEME}/${RADAR_OPTIONS}.png`
		}));
}

export async function fetchRadarFrames(signal?: AbortSignal): Promise<RadarFrame[]> {
	const response = await fetch(RAINVIEWER_MAPS_URL, { signal });
	if (!response.ok) throw new Error(`radar frames unavailable [${response.status}]`);
	return parseRadarFrames(await response.json());
}
