<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<meta name="description" content="Hearth — a dashboard for Home Assistant" />
</svelte:head>

{@render children()}

<style>
	:global(html) {
		box-sizing: border-box;
		font-size: 100%;
		/* iOS would otherwise inflate text after a rotation to landscape */
		-webkit-text-size-adjust: 100%;
		text-size-adjust: 100%;
		/* press feedback is ours (.pressable, ripple); inherited by everything */
		-webkit-tap-highlight-color: transparent;
	}
	/*
	 * No long-press callout or text selection on controls, and no double-tap
	 * zoom delay. :where keeps these at zero specificity so a component's own
	 * touch-action (pan-y on tiles, none on sliders) still wins. Text inputs
	 * are left out on purpose; iOS stops typing in fields that inherit
	 * user-select: none.
	 */
	:global(
		:where(
			button,
			a[href],
			summary,
			[role='button'],
			[role='option'],
			[role='radio'],
			[role='slider'],
			[role='switch'],
			input:is([type='checkbox'], [type='radio'], [type='range'])
		)
	) {
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
		touch-action: manipulation;
	}
	:global(body) {
		margin: 0;
		background: var(--h-bg-1, #16110c);
		font-family: var(--h-font-ui, sans-serif);
	}
	:global(*, *::before, *::after) {
		box-sizing: inherit;
	}
</style>
