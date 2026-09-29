<script lang="ts">
	import { ICON } from './iconSizes';
	import { horizontalDrag } from './drag';
	import type { SliderUpdateMode } from '$lib/core/app/configuration';
	import { formatReading, stepDecimals } from './format';
	import Icon from './Icon.svelte';

	let {
		label,
		icon,
		value,
		variant,
		min = 0,
		max = 100,
		step = 1,
		unit = '%',
		updateMode = 'continuous',
		onchange
	}: {
		label: string;
		icon: string;
		value: number;
		variant: 'amber' | 'blue';
		min?: number;
		max?: number;
		/** the entity's own step; drags and keys snap to it */
		step?: number;
		unit?: string;
		updateMode?: SliderUpdateMode;
		onchange: (value: number, commit?: boolean) => void;
	} = $props();

	let span = $derived(max > min ? max - min : 1);
	let reading = $derived(formatReading(value, unit, stepDecimals(step)));
	let fill = $derived(Math.max(0, Math.min(100, ((value - min) / span) * 100)));

	function snap(raw: number) {
		const stepped = min + Math.round((raw - min) / step) * step;
		// steps like 0.1 accumulate float noise
		return Math.min(max, Math.max(min, Number(stepped.toPrecision(12))));
	}

	function handleKey(event: KeyboardEvent) {
		const moves: Record<string, number> = {
			ArrowRight: value + step,
			ArrowUp: value + step,
			ArrowLeft: value - step,
			ArrowDown: value - step,
			PageUp: value + step * 10,
			PageDown: value - step * 10,
			Home: min,
			End: max
		};
		if (!(event.key in moves)) return;
		event.preventDefault();
		onchange(snap(moves[event.key]), true);
	}
</script>

<div class="label">{label}</div>
<div
	class="bar"
	role="slider"
	tabindex="0"
	aria-label={label}
	aria-valuemin={min}
	aria-valuemax={max}
	aria-valuenow={value}
	aria-valuetext={reading}
	onkeydown={handleKey}
	use:horizontalDrag={{
		set: (next, commit) => onchange(snap(min + (next / 100) * span), commit),
		updateMode,
		precise: true,
		tapSets: true
	}}
>
	<div class="fill {variant}" style:width="{fill}%"></div>
	<div class="readout">
		<Icon name={icon} size={ICON.tile} color="var(--h-text-1)" />
		<span class="value">{reading}</span>
	</div>
</div>

<style>
	.label {
		font-family: var(--h-font-mono);
		font-size: var(--h-type-label);
		letter-spacing: 2px;
		text-transform: uppercase;
		color: var(--h-label);
		margin: 22px 0 10px;
	}

	.bar {
		position: relative;
		height: 74px;
		border-radius: var(--h-radius-card);
		background: var(--h-track);
		overflow: hidden;
		cursor: pointer;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.fill {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
	}

	.fill.amber {
		background: linear-gradient(90deg, var(--h-accent-deep), var(--h-accent-bright));
	}

	.fill.blue {
		background: linear-gradient(90deg, rgb(var(--h-cool-rgb)), var(--h-cool-light));
	}

	.readout {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 22px;
		pointer-events: none;
	}

	.value {
		font-size: var(--h-type-stat);
		font-weight: 700;
		color: var(--h-text-1);
		text-shadow: 0 1px 3px var(--h-track);
	}
</style>
