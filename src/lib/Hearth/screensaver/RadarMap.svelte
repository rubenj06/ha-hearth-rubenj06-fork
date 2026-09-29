<script lang="ts">
	import type { Map as LeafletMap, TileLayer } from 'leaflet';
	import { motion } from '$lib/core/app/motion';
	import { fill, lang, selectedLanguage } from '$lib/core/i18n';
	import { displayTimeZone } from '../store';
	import {
		fetchRadarFrames,
		planFrames,
		RADAR_ATTRIBUTION,
		RADAR_TILE_SIZE,
		type RadarFrame,
		type RadarView
	} from './radar';

	/*
	 * An animated radar map behind the sleep screen. Leaflet and its stylesheet
	 * load only here, so a dashboard without the radar background never pays
	 * for them. The map takes no input: taps fall through to the screensaver,
	 * which dismisses itself.
	 */

	let {
		view,
		onready
	}: {
		view: RadarView;
		/** Whether any radar frame is on screen; until then the map stays hidden. */
		onready?: (ready: boolean) => void;
	} = $props();

	const FRAME_MS = 500;
	const NEWEST_FRAME_MS = 2000;
	const REFRESH_MS = 10 * 60_000;
	// a first fetch that failed is retried sooner than the regular refresh
	const RETRY_MS = 60_000;
	// a frame whose tiles never settle stops holding up the next one
	const LOAD_TIMEOUT_MS = 15_000;
	const RADAR_OPACITY = 0.75;

	// primitives, so a new but equal view (an HA reconnect) keeps the map
	let latitude = $derived(view.latitude);
	let longitude = $derived(view.longitude);
	let zoom = $derived(view.zoom);
	let basemapTiles = $derived(view.tiles);
	let basemapAttribution = $derived(view.attribution);

	let container = $state<HTMLDivElement>();
	let hasFrames = $state(false);
	let shownTime = $state<number>();

	$effect(() => onready?.(hasFrames));

	let frameLabel = $derived(
		shownTime === undefined
			? ''
			: fill($lang('hearth_sleep_radar_time'), {
					time: new Date(shownTime * 1000).toLocaleTimeString($selectedLanguage, {
						hour: 'numeric',
						minute: '2-digit',
						...($displayTimeZone ? { timeZone: $displayTimeZone } : {})
					})
				})
	);

	interface FrameLayer {
		frame: RadarFrame;
		layer: TileLayer;
		tilesLoaded: number;
		failed: boolean;
		settled: boolean;
		stopLoading?: () => void;
	}

	$effect(() => {
		const element = container;
		if (!element) return;
		const center: [number, number] = [latitude, longitude];
		const mapZoom = zoom;
		const tiles = basemapTiles;
		const attribution = basemapAttribution;
		const animate = Boolean($motion);

		let disposed = false;
		let map: LeafletMap | undefined;
		let createLayer: ((frame: RadarFrame) => TileLayer) | undefined;
		// oldest first
		let frames: FrameLayer[] = [];
		// frames waiting to be added to the map, one at a time
		let queue: FrameLayer[] = [];
		let loading: FrameLayer | undefined;
		let shown: FrameLayer | undefined;
		let stepTimer: ReturnType<typeof setTimeout> | undefined;
		let refreshTimer: ReturnType<typeof setTimeout> | undefined;
		let controller: AbortController | undefined;

		const ready = () => frames.filter((entry) => entry.settled && entry.tilesLoaded > 0);

		function show(entry: FrameLayer) {
			shown?.layer.setOpacity(0);
			shown = entry;
			entry.layer.setOpacity(RADAR_OPACITY);
			shownTime = entry.frame.time;
		}

		function step() {
			const playable = ready();
			if (!playable.length) return;
			const next = playable[(playable.indexOf(shown!) + 1) % playable.length];
			show(next);
			if (playable.length > 1) {
				stepTimer = setTimeout(step, next === playable.at(-1) ? NEWEST_FRAME_MS : FRAME_MS);
			} else {
				stepTimer = undefined;
			}
		}

		function frameSettled() {
			const playable = ready();
			hasFrames = playable.length > 0;
			if (!playable.length) return;
			if (!animate) show(playable.at(-1)!);
			else if (!stepTimer || !shown || !frames.includes(shown)) {
				clearTimeout(stepTimer);
				step();
			}
		}

		/*
		 * Frames join the map one after another, each once the previous one has
		 * loaded, so a refresh never fires every tile request at once.
		 */
		function loadNext() {
			if (loading || disposed || !map) return;
			const entry = queue.shift();
			if (!entry) return;
			loading = entry;
			const settle = () => {
				entry.stopLoading?.();
				entry.settled = true;
				frameSettled();
				loadNext();
			};
			const timeout = setTimeout(() => {
				// tiles still hanging never report an error, but the frame has holes
				entry.failed = true;
				settle();
			}, LOAD_TIMEOUT_MS);
			entry.stopLoading = () => {
				clearTimeout(timeout);
				entry.layer.off('load', settle);
				entry.stopLoading = undefined;
				if (loading === entry) loading = undefined;
			};
			entry.layer.on('load', settle);
			entry.layer.addTo(map);
		}

		function replaceFrames(next: RadarFrame[]) {
			const create = createLayer;
			if (!create) return;
			const plan = planFrames(
				frames.map((entry) => ({ tiles: entry.frame.tiles, failed: entry.failed })),
				next,
				animate
			);
			for (const entry of frames) {
				if (!plan.drop.has(entry.frame.tiles)) continue;
				entry.stopLoading?.();
				entry.layer.remove();
				if (shown === entry) shown = undefined;
			}
			const added: FrameLayer[] = [];
			frames = plan.wanted.map((frame) => {
				const kept = frames.find(
					(entry) => entry.frame.tiles === frame.tiles && plan.keep.has(frame.tiles)
				);
				if (kept) return kept;
				const entry: FrameLayer = {
					frame,
					layer: create(frame),
					tilesLoaded: 0,
					failed: false,
					settled: false
				};
				entry.layer.on('tileload', () => {
					entry.tilesLoaded += 1;
					if (entry.settled) frameSettled();
				});
				entry.layer.on('tileerror', () => (entry.failed = true));
				added.push(entry);
				return entry;
			});
			// the newest frame first, so something shows as early as possible
			const pending = [...queue.filter((entry) => frames.includes(entry)), ...added].sort(
				(a, b) => a.frame.time - b.frame.time
			);
			const newest = pending.pop();
			queue = newest ? [newest, ...pending] : pending;
			frameSettled();
			loadNext();
		}

		async function refresh() {
			controller = new AbortController();
			let next: RadarFrame[] = [];
			try {
				next = await fetchRadarFrames(controller.signal);
			} catch (error) {
				if (!disposed) console.warn('radar frames unavailable', error);
			}
			if (disposed) return;
			if (next.length) replaceFrames(next);
			refreshTimer = setTimeout(refresh, frames.length ? REFRESH_MS : RETRY_MS);
		}

		void (async () => {
			let leaflet: typeof import('leaflet');
			try {
				const [module] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
				leaflet = module.default ?? module;
			} catch (error) {
				console.warn('map library unavailable', error);
				return;
			}
			if (disposed) return;
			map = leaflet
				.map(element, {
					zoomControl: false,
					dragging: false,
					touchZoom: false,
					doubleClickZoom: false,
					scrollWheelZoom: false,
					boxZoom: false,
					keyboard: false,
					attributionControl: false
				})
				.setView(center, mapZoom);
			leaflet.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
			leaflet
				.tileLayer(tiles, {
					maxZoom: 19,
					className: 'radar-basemap',
					attribution,
					// OpenStreetMap turns away tile requests that carry no Referer
					referrerPolicy: 'strict-origin-when-cross-origin'
				})
				.addTo(map);
			// 512 px radar tiles one zoom level down cover the same ground with a
			// quarter of the requests
			createLayer = (frame) =>
				leaflet.tileLayer(frame.tiles, {
					tileSize: RADAR_TILE_SIZE,
					zoomOffset: -1,
					opacity: 0,
					attribution: RADAR_ATTRIBUTION
				});
			leaflet
				.circleMarker(center, { radius: 6, className: 'radar-home', interactive: false })
				.addTo(map);
			await refresh();
		})();

		return () => {
			disposed = true;
			controller?.abort();
			clearTimeout(stepTimer);
			clearTimeout(refreshTimer);
			for (const entry of frames) entry.stopLoading?.();
			map?.remove();
			hasFrames = false;
			shownTime = undefined;
		};
	});
</script>

<div class="radar" class:ready={hasFrames}>
	<div
		class="radar-map"
		class:dark={view.basemap === 'dark' && view.osm}
		bind:this={container}
		data-testid="radar-map"
	></div>
	{#if frameLabel}<div class="frame-time">{frameLabel}</div>{/if}
</div>

<style>
	.radar,
	.radar-map {
		position: absolute;
		inset: 0;
	}

	.radar {
		/* taps belong to the screensaver, which wakes the dashboard */
		pointer-events: none;
		opacity: 0;
		transition: opacity var(--h-motion-theme);
	}

	/* a map with no radar to show is only a street map, so it stays hidden */
	.radar.ready {
		opacity: 1;
	}

	/* how old the radar on screen is, so a stalled feed is visible */
	.frame-time {
		position: absolute;
		right: 6px;
		bottom: 18px;
		z-index: 1000 /* literal ok: above Leaflet's own panes */;
		font-size: var(--h-type-caption);
		color: rgb(255 255 255 / 0.55) /* literal ok: matches the map attribution */;
	}

	.radar-map:global(.leaflet-container) {
		background: transparent;
		font-family: var(--h-font-ui);
	}

	/* OSM has no dark tiles: invert them and turn the hues back */
	.radar-map.dark :global(.radar-basemap) {
		filter: invert(1) hue-rotate(180deg) grayscale(0.6) brightness(0.8) contrast(1.1);
	}

	.radar-map :global(.leaflet-control-attribution) {
		background: rgb(0 0 0 / 0.35) /* literal ok: map attribution plate */;
		color: rgb(255 255 255 / 0.55) /* literal ok: map attribution text */;
		font-size: var(--h-type-caption);
		padding: 0 6px;
	}

	.radar-map :global(.leaflet-control-attribution a) {
		color: inherit;
	}

	.radar-map :global(.radar-home) {
		fill: rgb(var(--h-accent-rgb));
		fill-opacity: 1;
		stroke: rgb(255 255 255 / 0.9) /* literal ok: marker ring on any basemap */;
		stroke-width: 2;
	}
</style>
