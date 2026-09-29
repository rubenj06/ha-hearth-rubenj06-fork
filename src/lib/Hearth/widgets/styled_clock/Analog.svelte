<script lang="ts">
	import { handAngles, type ClockParts } from './time';

	let { parts, spoken, showSeconds }: { parts: ClockParts; spoken: string; showSeconds: boolean } =
		$props();

	let angles = $derived(handAngles(parts));
	const MARKS = Array.from({ length: 60 }, (_, index) => index);
</script>

<svg class="face" viewBox="0 0 100 100" role="img" aria-label={spoken}>
	<circle class="dial" cx="50" cy="50" r="48" />
	{#each MARKS as mark (mark)}
		<line
			class="mark"
			class:hour={mark % 5 === 0}
			x1="50"
			y1="5"
			x2="50"
			y2={mark % 15 === 0 ? 13 : mark % 5 === 0 ? 11 : 7.5}
			transform="rotate({mark * 6} 50 50)"
		/>
	{/each}
	<line
		class="hand hour-hand"
		x1="50"
		y1="54"
		x2="50"
		y2="27"
		transform="rotate({angles.hour} 50 50)"
	/>
	<line
		class="hand minute-hand"
		x1="50"
		y1="56"
		x2="50"
		y2="13"
		transform="rotate({angles.minute} 50 50)"
	/>
	{#if showSeconds}
		<line
			class="hand second-hand"
			x1="50"
			y1="60"
			x2="50"
			y2="10"
			transform="rotate({angles.second} 50 50)"
		/>
	{/if}
	<circle class="pin" cx="50" cy="50" r="2.4" />
</svg>

<style>
	.face {
		display: block;
		width: 100%;
		max-width: 180px;
		aspect-ratio: 1;
	}

	.dial {
		fill: rgb(var(--h-line-rgb) / calc(0.05 * var(--h-line-scale)));
		stroke: rgb(var(--h-line-rgb) / calc(0.16 * var(--h-line-scale)));
		stroke-width: 1;
	}

	.mark {
		stroke: var(--h-text-5);
		stroke-width: 0.6;
		stroke-linecap: round;
	}

	.mark.hour {
		stroke: var(--h-text-3);
		stroke-width: 1.6;
	}

	.hand {
		stroke: var(--h-text-1);
		stroke-linecap: round;
	}

	.hour-hand {
		stroke-width: 4;
	}

	.minute-hand {
		stroke-width: 2.6;
	}

	.second-hand {
		stroke: var(--h-accent-bright);
		stroke-width: 1;
	}

	.pin {
		fill: var(--h-text-1);
	}
</style>
