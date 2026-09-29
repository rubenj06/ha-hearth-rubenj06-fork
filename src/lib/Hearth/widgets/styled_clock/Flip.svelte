<script lang="ts">
	import type { ClockParts } from './time';

	let { parts, spoken, showSeconds }: { parts: ClockParts; spoken: string; showSeconds: boolean } =
		$props();

	let groups = $derived(showSeconds ? parts.digits : parts.digits.slice(0, 2));
</script>

<div class="flip" role="img" aria-label={spoken}>
	{#each groups as group, index (index)}
		{#if index > 0}<span class="colon" aria-hidden="true">:</span>{/if}
		<span class="pair" class:small={index === 2} aria-hidden="true">
			{#each group.split('') as digit, position (position)}
				<span class="card">
					<!-- a changed digit remounts and replays the flip -->
					{#key digit}<span class="digit">{digit}</span>{/key}
				</span>
			{/each}
		</span>
	{/each}
	{#if parts.dayPeriod}<span class="period" aria-hidden="true">{parts.dayPeriod}</span>{/if}
</div>

<style>
	.flip {
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--h-text-1);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.pair {
		display: flex;
		gap: 4px;
		font-size: var(--h-type-hero);
	}

	.pair.small {
		font-size: var(--h-type-display-sm);
	}

	.card {
		position: relative;
		display: block;
		padding: 8px 6px;
		border-radius: var(--h-radius-md);
		background: rgb(var(--h-line-rgb) / calc(0.1 * var(--h-line-scale)));
		perspective: 300px;
		overflow: hidden;
	}

	/* the hinge across the middle of every card */
	.card::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 1px;
		background: rgb(var(--h-surface-rgb) / calc(0.6 * var(--h-fill-scale)));
	}

	.digit {
		display: block;
		transform-origin: 50% 50%;
		animation: flip-in var(--h-motion-slow) ease-out;
	}

	.colon {
		font-size: var(--h-type-display);
		color: var(--h-text-4);
		padding: 0 2px;
	}

	.period {
		align-self: flex-end;
		font-size: var(--h-type-body);
		color: var(--h-text-4);
		margin-left: 4px;
	}

	@keyframes flip-in {
		from {
			transform: rotateX(90deg);
			opacity: 0.3;
		}
		to {
			transform: rotateX(0deg);
			opacity: 1;
		}
	}

	@media (max-width: 900px) {
		.pair {
			font-size: var(--h-type-display);
		}
	}
</style>
