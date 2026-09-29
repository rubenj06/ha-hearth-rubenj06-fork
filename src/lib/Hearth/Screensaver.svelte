<script lang="ts">
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { motion } from '$lib/core/app/motion';
	import { MOTION } from '$lib/core/theme';
	import { lang, selectedLanguage } from '$lib/core/i18n';
	import { derived } from 'svelte/store';
	import { config as haConfig } from '$lib/core/ha/connection';
	import { entityAvailable, states } from '$lib/core/ha/entities';
	import {
		activeAlerts,
		displayTimeZone,
		hearthConfig,
		hearthEditMode,
		screensaverPreview,
		wakeScreen
	} from './store';
	import { clockTimeOptions } from './clock';
	import { timer } from '$lib/core/app/clock';
	import { layer } from '$lib/ui/layers';
	import { swallowNextClick } from '$lib/ui/gestures';
	import { imageSource } from './images';
	import { radarView } from './screensaver/radar';
	import { conditionIcon } from './widgets/weather/conditions';
	import Icon from './Icon.svelte';
	import { ICON } from './iconSizes';

	// without minutes the screensaver never arms itself and shows only on preview
	let { minutes }: { minutes?: number } = $props();

	let active = $state(false);

	$effect(() => {
		if ($screensaverPreview) active = true;
	});

	let lastActivity = Date.now();
	let idleTimer: ReturnType<typeof setTimeout>;
	// an alert card on screen must stay readable, so the idle clock waits for it
	let alertShowing = false;

	function scheduleIdle() {
		clearTimeout(idleTimer);
		if (active || alertShowing || !minutes) return;
		const remaining = Math.max(0, minutes * 60_000 - (Date.now() - lastActivity));
		idleTimer = setTimeout(() => (active = true), remaining);
	}

	// pointermove fires continuously, so cap timestamp writes to one per second
	function recordActivity() {
		const stamp = Date.now();
		if (stamp - lastActivity < 1000) return;
		lastActivity = stamp;
		scheduleIdle();
	}

	// the one way out: every wake source (tap, key, Escape, an alert) ends here. An idle
	// stamp older than the timeout would rearm the screensaver at once.
	function hide() {
		lastActivity = Date.now();
		active = false;
		screensaverPreview.set(false);
		scheduleIdle();
	}

	function dismiss(event: Event) {
		// swallow so the wake tap/keypress never reaches the dashboard
		event.preventDefault();
		event.stopPropagation();
		if (event.type === 'pointerdown') swallowNextClick();
		hide();
	}

	$effect(() => {
		const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart'] as const;
		for (const name of events) window.addEventListener(name, recordActivity, { passive: true });
		scheduleIdle();
		return () => {
			for (const name of events) window.removeEventListener(name, recordActivity);
			clearTimeout(idleTimer);
		};
	});

	// an alert or a popup Home Assistant opened must be seen, so it wakes the
	// screen; the store's current value at subscribe time is not a request
	$effect(() => {
		let initial = true;
		return wakeScreen.subscribe(() => {
			if (!initial) hide();
			initial = false;
		});
	});

	$effect(() =>
		derived(
			[activeAlerts, hearthEditMode],
			([$alerts, $editing]) => !$editing && $alerts.some((alert) => alert.popup)
		).subscribe((showing) => {
			alertShowing = showing;
			scheduleIdle();
		})
	);

	let configuredClock = $derived($hearthConfig.rail.find((widget) => widget.type === 'clock'));
	let activeTimezone = $derived($displayTimeZone);
	let now = $derived($timer);
	let drift = $derived($hearthConfig.screensaver_drift ?? false);
	let brightness = $derived($hearthConfig.screensaver_brightness ?? 32);
	let showDate = $derived($hearthConfig.screensaver_show_date ?? true);
	let clockSize = $derived($hearthConfig.screensaver_clock_size ?? 'medium');
	let background = $derived($hearthConfig.screensaver_background ?? 'none');
	let image = $derived(
		background === 'image' ? imageSource($hearthConfig.screensaver_image) : undefined
	);
	let imageFailed = $state(false);
	$effect(() => {
		// a new image, and every new sleep, gets another chance to load
		void image;
		if (active) imageFailed = false;
	});
	let radarReady = $state(false);
	$effect(() => {
		// the map goes with the overlay, so each sleep waits for frames again
		if (!active || !radar) radarReady = false;
	});
	let radar = $derived(
		background === 'radar' ? radarView($hearthConfig.screensaver_radar, $haConfig) : undefined
	);
	let weatherId = $derived($hearthConfig.screensaver_weather_entity);
	let weather = $derived(weatherId ? $states?.[weatherId] : undefined);
	let weatherLine = $derived.by(() => {
		if (!weather || !entityAvailable(weather)) return undefined;
		const condition = weather.state;
		const temperature = weather.attributes?.temperature;
		const label = $lang(`weather_${condition.replaceAll('-', '_')}`);
		return {
			icon: conditionIcon(condition),
			text:
				typeof temperature === 'number'
					? `${label} ${Intl.NumberFormat($selectedLanguage).format(Math.round(temperature))}°`
					: label
		};
	});
	// the radar counts once it shows frames; offline it is the plain background
	let hasBackground = $derived(Boolean((radar && radarReady) || (image && !imageFailed)));
	// over a map or photo the dimmest settings would vanish, so text keeps a floor
	let textBrightness = $derived(hasBackground ? Math.max(brightness, 60) : brightness);
	let time = $derived(
		now.toLocaleTimeString(
			$selectedLanguage,
			clockTimeOptions(activeTimezone, configuredClock?.hour_format)
		)
	);
	let date = $derived(
		now.toLocaleDateString($selectedLanguage, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			...(activeTimezone ? { timeZone: activeTimezone } : {})
		})
	);
</script>

<!--
	While showing, the screensaver is the top layer: Escape dismisses it instead
	of whatever sheet it covers. It takes focus so keydown targets it rather than
	the dashboard, and hands focus back to where it was on wake.
-->
{#if active}
	<div
		class="screensaver"
		tabindex="-1"
		role="button"
		aria-label={$lang('hearth_dismiss_screensaver')}
		in:fade={{ duration: $motion ? MOTION.theme * 2 : 0, easing: cubicOut }}
		out:fade={{ duration: $motion ? MOTION.fast : 0 }}
		onpointerdown={dismiss}
		onkeydown={dismiss}
		use:layer={{ close: hide, initialFocus: true }}
	>
		<div class="backdrop" style:--screensaver-brightness={String(brightness / 100)}>
			{#if radar}
				{#await import('./screensaver/RadarMap.svelte') then RadarMap}
					<RadarMap.default view={radar} onready={(ready) => (radarReady = ready)} />
				{:catch}
					<!-- offline or a failed chunk: the plain background stays -->
				{/await}
			{:else if image && !imageFailed}
				<img class="photo" src={image} alt="" onerror={() => (imageFailed = true)} />
			{/if}
		</div>
		{#if hasBackground}<div class="scrim"></div>{/if}
		<div
			class="screensaver-content clock-{clockSize}"
			class:drift={drift && Boolean($motion)}
			style:--screensaver-brightness={String(textBrightness / 100)}
		>
			<div class="clock">{time}</div>
			{#if showDate}<div class="date">{date}</div>{/if}
			{#if weatherLine}
				<div class="weather">
					<Icon name={weatherLine.icon} size={ICON.control} />
					<span>{weatherLine.text}</span>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.screensaver {
		position: fixed;
		inset: 0;
		z-index: var(--h-layer-screensaver);
		display: grid;
		place-items: center;
		background: #030201 /* literal ok: pure black for OLED burn-in */;
		font-family: var(--h-font-ui);
		outline: none;
		cursor: default;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		/* the dimmest setting still leaves the map or photo readable */
		opacity: calc(0.15 + 0.85 * var(--screensaver-brightness));
	}

	.photo {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* darkens the middle so the clock reads over a busy map or photo */
	.scrim {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(
				ellipse at center,
				rgb(0 0 0 / 0.6) 0%,
				rgb(0 0 0 / 0.25) 60%,
				rgb(0 0 0 / 0.1) 100%
			)
			/* literal ok: black scrim over map or photo */;
	}

	.screensaver-content {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.screensaver-content.drift {
		animation: screensaver-drift 90s ease-in-out infinite alternate; /* literal ok: slow drift period, not a transition */
	}

	.clock {
		font-size: clamp(var(--h-type-clock), 14vw, 160px); /* literal ok: scales with the screen */
		font-weight: 600;
		line-height: 1;
		letter-spacing: -4px;
		color: rgb(var(--h-line-rgb) / var(--screensaver-brightness));
	}

	.clock-small .clock {
		font-size: clamp(var(--h-type-hero), 9vw, 104px); /* literal ok: scales with the screen */
		letter-spacing: -2px;
	}

	.clock-large .clock {
		font-size: clamp(var(--h-type-clock), 22vw, 260px); /* literal ok: scales with the screen */
		letter-spacing: -6px;
	}

	.date {
		font-size: var(--h-type-title);
		margin-top: 18px;
		letter-spacing: 0.2px;
		color: rgb(var(--h-line-rgb) / calc(var(--screensaver-brightness) * 0.75));
	}

	.weather {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		font-size: var(--h-type-subtitle);
		color: rgb(var(--h-line-rgb) / calc(var(--screensaver-brightness) * 0.75));
	}

	@keyframes screensaver-drift {
		0% {
			transform: translate(-7vw, -5vh);
		}
		33% {
			transform: translate(6vw, -2vh);
		}
		66% {
			transform: translate(-3vw, 6vh);
		}
		100% {
			transform: translate(7vw, 4vh);
		}
	}
</style>
