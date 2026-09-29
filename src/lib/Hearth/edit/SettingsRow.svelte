<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ICON } from '../iconSizes';
	import Ripple from '$lib/ui/actions/ripple';
	import { PRESS_RIPPLE } from '../config';
	import Icon from '../Icon.svelte';

	/*
	 * One line of a settings list. With `onclick` the whole row is a button that
	 * opens something (a chevron says so); without it the row holds its control,
	 * passed as children, beside the label.
	 */
	let {
		label,
		sub,
		icon,
		onclick,
		danger = false,
		chevron = true,
		children
	}: {
		label: string;
		sub?: string;
		icon?: string;
		onclick?: () => void;
		danger?: boolean;
		chevron?: boolean;
		children?: Snippet;
	} = $props();
</script>

{#snippet main()}
	<div class="row-main">
		<div class="row-label">{label}</div>
		{#if sub}<div class="row-sub">{sub}</div>{/if}
	</div>
{/snippet}

{#if onclick}
	<button
		type="button"
		class="row action pressable"
		class:danger
		use:Ripple={PRESS_RIPPLE}
		{onclick}
	>
		{#if icon}<Icon name={icon} size={ICON.control} />{/if}
		{@render main()}
		{#if chevron}<Icon name="chevron_right" size={ICON.control} />{/if}
	</button>
{:else}
	<div class="row">
		{@render main()}
		{@render children?.()}
	</div>
{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		box-sizing: border-box;
		padding: 12px 16px;
		min-height: 56px;
		border: 0;
		background: none;
		font: inherit;
		text-align: left;
		color: var(--h-icon);
	}

	/* rows are separate instances, so the compiler cannot see the sibling */
	:global(.row) + .row {
		border-top: 1px solid rgb(var(--h-line-rgb) / calc(0.06 * var(--h-line-scale)));
	}

	.row-main {
		flex: 1;
		min-width: 0;
	}

	.row-label {
		font-size: var(--h-type-body);
		color: var(--h-text-2);
	}

	.row-sub {
		font-size: var(--h-type-small);
		color: var(--h-text-6);
		margin-top: 2px;
	}

	.row.action {
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
	}

	@media (hover: hover) {
		.row.action:hover {
			background: rgb(var(--h-surface-rgb) / calc(0.04 * var(--h-fill-scale)));
		}
	}

	.row.danger .row-label {
		color: var(--h-bad-text);
	}
</style>
