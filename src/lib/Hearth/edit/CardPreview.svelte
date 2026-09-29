<script lang="ts">
	import { ICON } from '../iconSizes';
	import { lang } from '$lib/core/i18n';
	import type { EntityRef, OverviewCard } from '../types';
	import { cardDescriptor } from '../cards';
	import { provideHearthInteractionMode } from '../interaction';
	import CardRenderer from '../CardRenderer.svelte';
	import Icon from '../Icon.svelte';
	import PreviewPane from './PreviewPane.svelte';

	let {
		card,
		onentitiesreorder = undefined
	}: { card: OverviewCard; onentitiesreorder?: (entities: EntityRef[]) => void } = $props();

	provideHearthInteractionMode('preview');

	let reorder = $state(false);
	let reorderable = $derived(cardDescriptor(card.type)?.previewReorder ?? false);
	let interactive = $derived(
		reorderable || (cardDescriptor(card.type)?.previewInteractive ?? false)
	);
</script>

{#snippet reorderToggle()}
	<button
		type="button"
		class:active={reorder}
		aria-pressed={reorder}
		onclick={() => (reorder = !reorder)}
	>
		<Icon name="drag_indicator" size={ICON.inline} />
		{$lang(reorder ? 'hearth_finish_reorder' : 'hearth_reorder')}
	</button>
{/snippet}

<PreviewPane {interactive} actions={reorderable ? reorderToggle : undefined}>
	<CardRenderer {card} {onentitiesreorder} showEntityDragHandles={reorderable && reorder} />
</PreviewPane>

<style>
	button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.1 * var(--h-line-scale)));
		border-radius: var(--h-radius-xs);
		background: rgb(var(--h-surface-rgb) / calc(0.04 * var(--h-fill-scale)));
		color: var(--h-text-5);
		font: inherit;
		font-size: var(--h-type-label);
		cursor: pointer;
	}

	button.active {
		border-color: rgb(var(--h-accent-rgb) / calc(0.35 * var(--h-accent-scale)));
		background: rgb(var(--h-accent-rgb) / calc(0.1 * var(--h-accent-scale)));
		color: var(--h-accent-text);
	}

	@media (hover: hover) {
		button:hover {
			border-color: rgb(var(--h-accent-rgb) / calc(0.35 * var(--h-accent-scale)));
			background: rgb(var(--h-accent-rgb) / calc(0.1 * var(--h-accent-scale)));
			color: var(--h-accent-text);
		}
	}
</style>
