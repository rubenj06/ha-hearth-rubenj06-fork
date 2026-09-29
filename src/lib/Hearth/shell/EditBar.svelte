<script lang="ts">
	import { ICON } from '../iconSizes';
	import Ripple from '$lib/ui/actions/ripple';
	import { lang } from '$lib/core/i18n';
	import { PRESS_RIPPLE, railPositionOf } from '../config';
	import {
		cancelEdit,
		canRedo,
		canUndo,
		editor,
		enterEditMode,
		hearthConfig,
		hasUnsavedEdits,
		hearthEditMode,
		hearthLoadError,
		redoConfig,
		reportCopy,
		requestConfirmation,
		saveState,
		saveFailure,
		saveWithFeedback,
		undoConfig
	} from '../store';
	import Icon from '../Icon.svelte';

	let { hideEditToggle = false }: { hideEditToggle?: boolean } = $props();

	// the toggle sits at the rail's foot, so a lone right rail takes it along
	let toggleRight = $derived(railPositionOf($hearthConfig) === 'right');

	// The YAML serializer pulls in js-yaml, which stays out of the eager bundle.
	// Loading starts with the bar so the copy click does not wait on the
	// network, which would cost Safari's user activation for the clipboard.
	const transfer = import('../transfer');

	// the same YAML document the code editor and Versions export
	async function copySessionEdits() {
		const text = (await transfer).configDocument($hearthConfig);
		try {
			if (navigator.clipboard) {
				await navigator.clipboard.writeText(text);
			} else {
				const area = document.createElement('textarea');
				area.value = text;
				area.style.position = 'fixed';
				area.style.opacity = '0';
				document.body.append(area);
				area.select();
				const copied = document.execCommand('copy');
				area.remove();
				if (!copied) throw new Error('copy command was refused');
			}
			reportCopy('copied');
		} catch (error) {
			console.error(error);
			reportCopy('failed');
		}
	}

	function cancel() {
		if (!hasUnsavedEdits()) {
			cancelEdit();
			return;
		}
		requestConfirmation({
			title: $lang('hearth_discard_edits_title'),
			message: $lang('hearth_discard_edits_message'),
			confirmLabel: $lang('hearth_discard'),
			action: cancelEdit
		});
	}

	/*
	 * The bar wraps onto a second row on a phone when the save error and its
	 * actions join it. Its height goes to the shared parent as
	 * --h-edit-bar-height so the toasts above it can follow.
	 */
	let bar = $state<HTMLElement | null>(null);

	$effect(() => {
		const host = bar?.parentElement;
		if (!bar || !host) return;
		const element = bar;
		const measure = () =>
			host.style.setProperty('--h-edit-bar-height', `${element.offsetHeight}px`);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => {
			observer.disconnect();
			host.style.removeProperty('--h-edit-bar-height');
		};
	});

	function confirmOverwrite() {
		requestConfirmation({
			title: $lang('hearth_overwrite_newer_hearth_configuration'),
			message: $lang('hearth_this_replaces_the_version_saved_by'),
			confirmLabel: $lang('hearth_overwrite'),
			action: () => void saveWithFeedback(true)
		});
	}
</script>

{#if $hearthEditMode}
	<div class="edit-bar" bind:this={bar}>
		{#if $saveState === 'conflict'}
			<span class="save-error">{$lang('hearth_config_changed')}</span>
			<button
				type="button"
				class="bar-button pressable"
				use:Ripple={PRESS_RIPPLE}
				onclick={copySessionEdits}
			>
				{$lang('hearth_copy_edits')}
			</button>
			<button
				type="button"
				class="bar-button dangerous pressable"
				use:Ripple={PRESS_RIPPLE}
				onclick={confirmOverwrite}
			>
				{$lang('hearth_overwrite')}
			</button>
			<button
				type="button"
				class="bar-button pressable"
				use:Ripple={PRESS_RIPPLE}
				onclick={() => location.reload()}
			>
				{$lang('hearth_reload')}
			</button>
		{:else if $saveState === 'error'}
			<span class="save-error">
				{$lang('hearth_save_failed')}{#if $saveFailure}: {$saveFailure}{/if}
			</span>
		{/if}
		<button
			type="button"
			class="bar-icon pressable"
			aria-label={$lang('settings')}
			onclick={() => editor.set({ kind: 'settings' })}
		>
			<Icon name="settings" size={ICON.control} />
		</button>
		<button
			type="button"
			class="bar-icon pressable"
			aria-label={$lang('theme')}
			onclick={() => editor.set({ kind: 'theme' })}
		>
			<Icon name="palette" size={ICON.control} />
		</button>
		<button
			type="button"
			class="bar-icon"
			disabled={!$canUndo}
			aria-label={$lang('undo')}
			onclick={undoConfig}
		>
			<Icon name="undo" size={ICON.control} />
		</button>
		<button
			type="button"
			class="bar-icon"
			disabled={!$canRedo}
			aria-label={$lang('hearth_redo')}
			onclick={redoConfig}
		>
			<Icon name="redo" size={ICON.control} />
		</button>
		<button type="button" class="bar-button pressable" use:Ripple={PRESS_RIPPLE} onclick={cancel}
			>{$lang('cancel')}</button
		>
		<button
			type="button"
			class="bar-button primary pressable"
			use:Ripple={PRESS_RIPPLE}
			onclick={() => saveWithFeedback()}>{$lang('save')}</button
		>
	</div>
{:else if !hideEditToggle && !$hearthLoadError}
	<button
		type="button"
		class="edit-toggle pressable"
		class:right={toggleRight}
		aria-label={$lang('hearth_edit_configuration')}
		onclick={enterEditMode}
	>
		<Icon name="edit" size={ICON.control} />
		<span>{$lang('hearth_edit_configuration')}</span>
	</button>
{/if}

<style>
	/* a labeled row at the rail's foot rather than an anonymous floating pencil */
	.edit-toggle {
		position: absolute;
		/* the insets clear an installed app's home indicator and a landscape cutout */
		left: calc(14px + var(--h-pad-x) + env(safe-area-inset-left));
		bottom: calc(14px + var(--h-pad-y) + env(safe-area-inset-bottom));
		z-index: var(--h-layer-bar);
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border-radius: var(--h-radius-sm);
		color: var(--h-text-4);
		font-size: var(--h-type-body);
		cursor: pointer;
		opacity: 0.75;
		border: 0;
		background: rgb(var(--h-surface-rgb) / calc(0.035 * var(--h-fill-scale)));
		font-family: inherit;
	}

	/* see breakpoints.ts: folded, there is no rail column to follow */
	@media (min-width: 901px) {
		.edit-toggle.right {
			left: auto;
			right: calc(14px + var(--h-pad-x) + env(safe-area-inset-right));
		}
	}

	@media (hover: hover) {
		.edit-toggle:hover {
			opacity: 1;
			color: var(--h-text-3);
			background: rgb(var(--h-surface-rgb) / calc(0.06 * var(--h-fill-scale)));
		}
	}

	.edit-bar {
		position: absolute;
		bottom: calc(18px + var(--h-pad-y));
		left: 50%;
		transform: translateX(-50%);
		z-index: var(--h-layer-toast);
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: var(--h-radius-md);
		background: linear-gradient(180deg, var(--h-sheet-0), var(--h-sheet-1));
		border: 1px solid rgb(var(--h-accent-rgb) / calc(0.18 * var(--h-accent-scale)));
		box-shadow: var(--h-shadow-toast);
	}

	.save-error {
		font-size: var(--h-type-secondary);
		color: var(--h-bad-text);
		padding: 0 8px;
	}

	.bar-icon {
		display: inline-flex;
		color: var(--h-text-3);
		cursor: pointer;
		padding: 4px;
		border: 0;
		background: none;
		font: inherit;
	}

	.bar-icon:disabled {
		color: var(--h-icon-dim);
		cursor: default;
	}

	.bar-button {
		padding: 10px 20px;
		border-radius: var(--h-radius-xs);
		font-size: var(--h-type-body);
		font-weight: 600;
		cursor: pointer;
		color: var(--h-text-3);
		background: rgb(var(--h-surface-rgb) / calc(0.06 * var(--h-fill-scale)));
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.08 * var(--h-line-scale)));
		user-select: none;
		-webkit-user-select: none;
		font-family: inherit;
	}

	.bar-button.primary {
		background: linear-gradient(135deg, var(--h-accent-deep), var(--h-accent-bright));
		border: none;
		color: var(--h-on-accent);
	}

	.bar-button.dangerous {
		color: var(--h-bad-text);
		border-color: rgb(var(--h-bad-rgb) / calc(0.35 * var(--h-accent-scale)));
	}
	/* see breakpoints.ts */
	@media (max-width: 900px) {
		.edit-bar {
			left: calc(8px + env(safe-area-inset-left));
			right: calc(8px + env(safe-area-inset-right));
			bottom: calc(8px + env(safe-area-inset-bottom));
			transform: none;
			gap: 6px;
			padding: 8px;
			flex-wrap: wrap;
			justify-content: flex-end;
		}

		.bar-button {
			padding: 10px 14px;
		}
	}
</style>
