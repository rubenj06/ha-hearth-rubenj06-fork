<script lang="ts">
	import { timer } from '$lib/core/app/clock';
	import { selectedLanguage } from '$lib/core/i18n';
	import { clockTimeOptions, validTimeZone } from '../../clock';
	import type { StyledClockWidget } from './descriptor';
	import { clockParts } from './time';

	// the faces load on demand so the styled clock stays out of the eager bundle
	const faces = {
		analog: () => import('./Analog.svelte'),
		flip: () => import('./Flip.svelte')
	};

	let { widget }: { widget: StyledClockWidget } = $props();

	let now = $derived($timer);
	let timeZone = $derived(validTimeZone(widget.timezone));
	let parts = $derived(clockParts(now, $selectedLanguage, timeZone, widget.hour_format));
	// what a screen reader announces instead of the drawing
	let spoken = $derived(
		now.toLocaleTimeString(
			$selectedLanguage,
			clockTimeOptions(timeZone, widget.hour_format, widget.show_seconds)
		)
	);
	let date = $derived(
		now.toLocaleDateString($selectedLanguage, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			...(timeZone ? { timeZone } : {})
		})
	);
</script>

<div class="styled-clock" class:flip={widget.style === 'flip'}>
	{#await faces[widget.style ?? 'analog']() then { default: Face }}
		<Face {parts} {spoken} showSeconds={widget.show_seconds ?? false} />
	{/await}
	{#if !widget.hide_date}<div class="date">{date}</div>{/if}
</div>

<style>
	.styled-clock {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.date {
		font-size: var(--h-type-emphasis);
		color: var(--h-text-4);
		margin-top: 10px;
		letter-spacing: 0.2px;
	}
</style>
