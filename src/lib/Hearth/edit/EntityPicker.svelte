<script lang="ts">
	import { ICON } from '../iconSizes';
	import { lang, fill } from '$lib/core/i18n';
	import { activateOnKeyboard } from '../interaction';
	import { states } from '$lib/core/ha/entities';
	import Ripple from '$lib/ui/actions/ripple';
	import { PRESS_RIPPLE } from '../config';
	import { domainIcon } from '$lib/core/domains';
	import Icon from '../Icon.svelte';
	import CloseButton from '../CloseButton.svelte';
	import { layer } from '$lib/ui/layers';

	let {
		domains = [],
		onselect,
		onclose
	}: {
		domains?: string[];
		onselect: (entityId: string) => void;
		onclose: () => void;
	} = $props();

	const MAX_ROWS = 100;

	let query = $state('');

	let matches = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return Object.entries($states ?? {})
			.filter(([entityId]) => domains.length === 0 || domains.includes(entityId.split('.')[0]))
			.map(([entityId, entity]) => ({
				entityId,
				name: String(entity.attributes?.friendly_name ?? entityId),
				state: entity.state
			}))
			.filter(
				(entry) =>
					!needle ||
					entry.name.toLowerCase().includes(needle) ||
					entry.entityId.toLowerCase().includes(needle)
			)
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	function pick(entityId: string) {
		onselect(entityId);
		onclose();
	}

	function focusOnMount(node: HTMLInputElement) {
		node.focus();
	}
</script>

<div
	class="overlay"
	onclick={(event) => event.target === event.currentTarget && onclose()}
	role="presentation"
	use:layer={{ close: onclose, trap: true }}
>
	<div
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-label={$lang('hearth_choose_entity')}
		tabindex="-1"
	>
		<div class="search">
			<Icon name="search" size={ICON.control} />
			<input
				type="text"
				bind:value={query}
				placeholder={$lang('hearth_search_entities')}
				spellcheck="false"
				use:focusOnMount
			/>
			<CloseButton onclick={onclose} />
		</div>
		<div class="list">
			{#each matches.slice(0, MAX_ROWS) as entry (entry.entityId)}
				<div
					class="row pressable"
					use:Ripple={PRESS_RIPPLE}
					onclick={() => pick(entry.entityId)}
					role="button"
					tabindex="0"
					onkeydown={(event) => activateOnKeyboard(event, () => pick(entry.entityId))}
				>
					<span class="row-icon"
						><Icon name={domainIcon(entry.entityId)} size={ICON.control} /></span
					>
					<span class="row-text">
						<span class="row-name">{entry.name}</span>
						<span class="row-id">{entry.entityId}</span>
					</span>
					<span class="row-state">{entry.state}</span>
				</div>
			{:else}
				<div class="hint">{$lang('hearth_no_matching_entities')}</div>
			{/each}
			{#if matches.length > MAX_ROWS}
				<div class="hint">
					{fill($lang('hearth_more_matches'), { count: matches.length - MAX_ROWS })}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: var(--h-layer-picker);
		background: var(--h-overlay);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.panel {
		width: min(720px, calc(100vw - 32px));
		height: min(720px, calc(100dvh - 48px));
		display: flex;
		flex-direction: column;
		background: radial-gradient(620px 420px at 25% -10%, var(--h-sheet-0), var(--h-sheet-1) 60%);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.08 * var(--h-line-scale)));
		border-radius: var(--h-radius-xl);
		padding: var(--h-modal-padding);
		box-shadow: var(--h-shadow-layer);
	}

	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 14px;
		border-radius: var(--h-radius-xs);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.1 * var(--h-line-scale)));
		background: var(--h-track);
		color: var(--h-icon);
		margin-bottom: 12px;
	}

	.search:focus-within {
		border-color: rgb(var(--h-accent-rgb) / calc(0.4 * var(--h-accent-scale)));
	}

	.search input {
		flex: 1;
		min-width: 0;
		padding: 12px 0;
		border: none;
		background: none;
		color: var(--h-text-2);
		font-family: inherit;
		font-size: var(--h-type-body);
		outline: none;
	}

	.search input::placeholder {
		color: var(--h-text-6);
	}

	/* iOS Safari zooms the page into any input set under 16px */
	@media (pointer: coarse) {
		.search input {
			font-size: max(16px, var(--h-type-body)); /* literal ok: the iOS no-zoom floor */
		}
	}

	.list {
		flex: 1;
		overflow-y: auto;
		scrollbar-gutter: stable;
		margin: 0 -6px;
		padding: 0 6px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 10px;
		border-radius: var(--h-radius-xs);
		cursor: pointer;
	}

	@media (hover: hover) {
		.row:hover {
			background: rgb(var(--h-surface-rgb) / calc(0.06 * var(--h-fill-scale)));
		}
	}

	.row-icon {
		display: flex;
		color: var(--h-icon);
	}

	.row-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.row-name {
		font-size: var(--h-type-body);
		color: var(--h-text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row-id {
		font-family: var(--h-font-mono);
		font-size: var(--h-type-label);
		color: var(--h-text-5);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row-state {
		max-width: 90px;
		font-size: var(--h-type-small);
		color: var(--h-text-5);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hint {
		padding: 12px 10px;
		font-size: var(--h-type-small);
		color: var(--h-text-6);
		text-align: center;
	}

	/* see breakpoints.ts */
	@media (max-width: 900px) {
		.overlay {
			align-items: stretch;
			/* the insets keep an installed app's status bar, home indicator and a
			   landscape cutout off the panel's edges */
			padding: calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right))
				calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left));
		}

		/* stretched rather than sized from the viewport, so it follows the
		   overlay when an on-screen keyboard shrinks the page */
		.panel {
			width: 100%;
			height: auto;
			padding: 16px;
			border-radius: var(--h-radius-md);
		}
	}
</style>
