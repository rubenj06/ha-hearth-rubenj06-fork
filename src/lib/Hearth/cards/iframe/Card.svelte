<script lang="ts">
	import { lang } from '$lib/core/i18n';
	import type { IframeCard } from './descriptor';

	let { card }: { card: IframeCard } = $props();
</script>

<div class="section" data-no-swipe>
	{#if card.title}
		<div class="section-title">{card.title}</div>
	{/if}
	<!-- the embedded page may run and talk to its own origin, but it cannot
	     navigate this dashboard, open dialogs or take over the screen -->
	<iframe
		src={card.url}
		title={card.title ?? $lang('hearth_card_iframe_name')}
		sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
		referrerpolicy="strict-origin-when-cross-origin"
		style:height="{card.height ?? 400}px"
	></iframe>
</div>

<style>
	.section-title {
		margin-bottom: 10px;
		font-size: var(--h-type-secondary);
		font-weight: 500;
		letter-spacing: 0.5px;
		color: var(--h-text-4);
	}

	/* the px height is only the flex basis: a filling slot grows the frame into
	   the column's leftover, and a height-bounded column may shrink it */
	iframe {
		display: block;
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
		border: 0;
		border-radius: var(--h-radius-md);
		background: rgb(var(--h-surface-rgb) / calc(0.045 * var(--h-fill-scale)));
	}
</style>
