<script lang="ts">
	import { ICON } from './iconSizes';
	import { lang } from '$lib/core/i18n';
	import Icon from './Icon.svelte';

	let {
		onclick,
		tone = 'default'
	}: {
		onclick: () => void;
		/** `art` reads over album art and photos, whatever the theme. */
		tone?: 'default' | 'art';
	} = $props();
</script>

<button
	type="button"
	class="close-button"
	class:art={tone === 'art'}
	aria-label={$lang('hearth_close')}
	{onclick}
>
	<Icon name="close" size={ICON.tile} />
</button>

<style>
	.close-button {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		border-radius: var(--h-radius-xs);
		background: none;
		color: var(--h-icon);
		font: inherit;
		cursor: pointer;
		transition: transform var(--h-motion-fast) ease;
	}

	@media (hover: hover) {
		.close-button:hover {
			color: var(--h-text-3);
		}
	}

	.close-button:active {
		transform: scale(0.9);
	}

	.close-button.art {
		color: var(--h-on-art-2);
	}
</style>
