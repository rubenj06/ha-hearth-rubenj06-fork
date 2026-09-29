<script lang="ts">
	import { ICON } from './iconSizes';
	import { lang } from '$lib/core/i18n';
	import { activeAlerts, alertIcon, type HearthAlert } from './store';
	import { dismissAlert, type AlertHost } from './alertEngine';
	import Icon from './Icon.svelte';

	let { host, onopen }: { host: AlertHost; onopen: (alert: HearthAlert) => void } = $props();
	// svelte-ignore state_referenced_locally
	const { layer } = host;

	let shown = $derived($activeAlerts.filter((alert) => alert.popup));
</script>

<!-- several alerts stack in one layer, newest on top; Escape dismisses the top one -->
{#if shown.length}
	<div
		class="alert-backdrop"
		role="presentation"
		use:layer={{ close: () => dismissAlert(shown[0].key), trap: true, initialFocus: true }}
	>
		<div class="alert-stack">
			{#each shown as alert (alert.key)}
				<div
					class="alert-card {alert.severity}"
					role="alertdialog"
					aria-modal="true"
					aria-label={alert.title}
					data-alert={alert.key}
				>
					<Icon name={alertIcon(alert)} size={ICON.tile} color="var(--alert-text)" />
					<div class="alert-copy">
						<strong>{alert.title}</strong>
						{#if alert.message}<span>{alert.message}</span>{/if}
					</div>
					<div class="alert-actions">
						{#if alert.entity}
							<button type="button" class="alert-button" onclick={() => onopen(alert)}>
								{$lang('hearth_alert_open')}
							</button>
						{/if}
						<button type="button" class="alert-button" onclick={() => dismissAlert(alert.key)}>
							{$lang('hearth_dismiss')}
						</button>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.alert-backdrop {
		position: absolute;
		inset: 0;
		z-index: var(--h-layer-alert);
		display: grid;
		place-items: center;
		padding: 20px;
		overflow-y: auto;
		background: var(--h-scrim);
		backdrop-filter: blur(8px);
	}

	.alert-stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: min(460px, 100%);
	}

	.alert-card {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 14px;
		padding: var(--h-modal-padding);
		border-radius: var(--h-radius-xl);
		background: linear-gradient(180deg, var(--h-sheet-0), var(--h-sheet-1));
		border: 1px solid rgb(var(--alert-rgb) / calc(0.55 * var(--h-accent-scale)));
		box-shadow: var(--h-shadow-layer);
	}

	.alert-copy {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.alert-copy strong {
		font-size: var(--h-type-subtitle);
		color: var(--h-text-1);
	}

	.alert-copy span {
		font-size: var(--h-type-body);
		color: var(--h-text-4);
	}

	.alert-actions {
		grid-column: 1 / -1;
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	/* the look of buttons.css's secondary button; importing that file here
	   would split it out of the page's own stylesheet */
	.alert-button {
		min-height: 44px;
		padding: 10px 20px;
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.08 * var(--h-line-scale)));
		border-radius: var(--h-radius-xs);
		background: rgb(var(--h-surface-rgb) / calc(0.06 * var(--h-fill-scale)));
		color: var(--h-text-3);
		font: inherit;
		font-size: var(--h-type-body);
		font-weight: 600;
		cursor: pointer;
	}

	.info {
		--alert-rgb: var(--h-cool-rgb);
		--alert-text: var(--h-cool-text);
	}

	.warning {
		--alert-rgb: var(--h-accent-rgb);
		--alert-text: var(--h-accent-text);
	}

	.critical {
		--alert-rgb: var(--h-bad-rgb);
		--alert-text: var(--h-bad-text);
	}
</style>
