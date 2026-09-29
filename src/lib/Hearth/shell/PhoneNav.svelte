<script lang="ts">
	import { lang } from '$lib/core/i18n';
	import { motion } from '$lib/core/app/motion';
	import { ICON } from '../iconSizes';
	import { states } from '$lib/core/ha/entities';
	import { currentRoom, hearthConfig, hearthEditMode } from '../store';
	import { searchAvailable } from '../visibility';
	import Icon from '../Icon.svelte';

	/**
	 * Page switcher for narrow viewports, where the rail folds under the page
	 * and its navigation widget would be a screen away. Sticky at the top of
	 * the scroll container; hidden by CSS above the rail-folds breakpoint
	 * unless `always`, which a dashboard with no rail at all passes.
	 */
	let { onsearch, always = false }: { onsearch: () => void; always?: boolean } = $props();

	// the rail's own search widget is hidden here, so this button stands in for
	// it - unless that widget is hidden on mobile or by its visibility conditions.
	// With no rail nothing folds, so hidden on mobile does not count.
	let hasSearch = $derived(searchAvailable($hearthConfig.rail, $states, !always));

	// a page picked from search or a ?room= link can sit past the strip's edge
	let pills: Record<string, HTMLButtonElement | undefined> = {};
	$effect(() => {
		pills[$currentRoom]?.scrollIntoView?.({
			inline: 'nearest',
			block: 'nearest',
			behavior: $motion ? 'smooth' : 'auto'
		});
	});
</script>

<nav class="phone-nav" class:always aria-label={$lang('hearth_pages')}>
	<div class="pages">
		{#each $hearthConfig.rooms as room (room.id)}
			<button
				type="button"
				class="page pressable"
				class:active={$currentRoom === room.id}
				aria-current={$currentRoom === room.id ? 'page' : undefined}
				bind:this={pills[room.id]}
				onclick={() => currentRoom.set(room.id)}
			>
				<Icon name={room.icon} size={ICON.inline} />
				<span>{room.name}</span>
			</button>
		{/each}
	</div>
	{#if hasSearch && !$hearthEditMode}
		<button type="button" class="search pressable" aria-label={$lang('search')} onclick={onsearch}>
			<Icon name="search" size={ICON.control} />
		</button>
	{/if}
</nav>

<style>
	.phone-nav {
		display: none;
	}

	/* above the fold there is no scroller to stick in or screen edge to bleed
	   to: the strip is just the first row over the page */
	.phone-nav.always {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	/* see breakpoints.ts */
	@media (max-width: 900px) {
		.phone-nav {
			min-width: 0;
			position: sticky;
			top: 0;
			z-index: var(--h-layer-bar);
			display: flex;
			align-items: center;
			gap: 8px;
			/* back out to the screen edge, past whatever padding the folded
			   layout set - including the landscape notch inset */
			margin: 0 calc(-1 * var(--h-fold-pad-right, var(--h-pad-x))) 0
				calc(-1 * var(--h-fold-pad-left, var(--h-pad-x)));
			/* the layout leaves no room above the strip, so the top inset is the
			   strip's to carry; the sides match the layout's own padding so the
			   pills line up with the cards under them */
			padding: calc(8px + env(safe-area-inset-top)) var(--h-fold-pad-right, var(--h-pad-x)) 8px
				var(--h-fold-pad-left, var(--h-pad-x));
			/* opaque: the page passing behind a translucent strip shows through
			   the pills, which reads as a smudge */
			background: var(--h-bg-1);
		}
	}

	.pages {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
		flex: 1;
		min-width: 0;
		padding: 2px;
	}

	.pages::-webkit-scrollbar {
		display: none;
	}

	.page,
	.search {
		flex: none;
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.1 * var(--h-line-scale)));
		border-radius: var(--h-radius-pill);
		background: rgb(var(--h-surface-rgb) / calc(0.05 * var(--h-fill-scale)));
		backdrop-filter: var(--h-surface-blur);
		color: var(--h-text-3);
		font: inherit;
		font-size: var(--h-type-body);
		white-space: nowrap;
		cursor: pointer;
	}

	.search {
		width: 44px;
		padding: 0;
		justify-content: center;
	}

	.page.active {
		background: rgb(var(--h-accent-rgb) / calc(0.16 * var(--h-accent-scale)));
		border-color: rgb(var(--h-accent-rgb) / calc(0.4 * var(--h-accent-scale)));
		color: var(--h-accent-text);
	}

	/*
	 * A phone held sideways: the strip would take a sixth of the screen. Only
	 * the page being viewed keeps its label; the rest shrink to their icon and
	 * hand the name to assistive technology instead of dropping it. See
	 * breakpoints.ts.
	 */
	@media (max-width: 900px) and (max-height: 500px) and (orientation: landscape) {
		.page:not(.active) {
			width: 44px;
			padding: 0;
			justify-content: center;
		}

		.page:not(.active) span {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
</style>
