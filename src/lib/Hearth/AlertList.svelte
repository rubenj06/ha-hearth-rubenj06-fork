<script lang="ts">
	import { ICON } from './iconSizes';
	import { lang } from '$lib/core/i18n';
	import { persistentNotifications } from '$lib/core/ha/connection';
	import { service } from '$lib/core/ha/commands';
	import { activeAlerts, alertIcon, alertListOpen, type HearthAlert } from './store';
	import { dismissAlert, type AlertHost } from './alertEngine';
	import Icon from './Icon.svelte';

	let { host }: { host: AlertHost } = $props();
	// svelte-ignore state_referenced_locally
	const { layer } = host;

	let notifications = $derived(Object.entries($persistentNotifications ?? {}));

	// rendered HTML per notification, keyed by id and remembered with the
	// message it came from so an updated message under the same id re-renders
	let rendered = $state<Record<string, { message: string; html: string }>>({});
	$effect(() => {
		const pending = notifications
			.map(([id, notification]) => [id, notification.message ?? ''] as const)
			.filter(([id, message]) => rendered[id]?.message !== message);
		if (!pending.length) return;
		let cancelled = false;
		host.loadMarkdown().then((render) => {
			if (cancelled) return;
			for (const [id, message] of pending) rendered[id] = { message, html: render(message) };
		});
		return () => {
			cancelled = true;
		};
	});

	function close() {
		alertListOpen.set(false);
	}

	function open(alert: HearthAlert) {
		if (!alert.entity) return;
		close();
		host.openDetail(alert.entity);
	}

	function dismissNotification(id: string) {
		service('persistent_notification', 'dismiss', { notification_id: id });
	}
</script>

<div
	class="overlay"
	role="presentation"
	onclick={(event) => event.target === event.currentTarget && close()}
	use:layer={{ close, trap: true, initialFocus: (node) => node.querySelector('.close') }}
>
	<div class="sheet" role="dialog" aria-modal="true" aria-label={$lang('notifications')}>
		<div class="header">
			<div class="name">{$lang('notifications')}</div>
			<button type="button" class="action close" aria-label={$lang('hearth_close')} onclick={close}>
				<Icon name="close" size={ICON.tile} />
			</button>
		</div>
		<div class="items">
			{#each $activeAlerts as alert (alert.key)}
				<div class="item {alert.severity}" data-alert={alert.key}>
					<Icon name={alertIcon(alert)} size={ICON.control} color="var(--alert-text)" />
					<div class="body">
						<div class="title">{alert.title}</div>
						{#if alert.message}<div class="message">{alert.message}</div>{/if}
					</div>
					{#if alert.entity}
						<button
							type="button"
							class="action"
							aria-label={$lang('hearth_alert_open')}
							onclick={() => open(alert)}
						>
							<Icon name="open_in_new" size={ICON.inline} />
						</button>
					{/if}
					<button
						type="button"
						class="action"
						aria-label={$lang('hearth_dismiss')}
						onclick={() => dismissAlert(alert.key)}
					>
						<Icon name="close" size={ICON.inline} />
					</button>
				</div>
			{/each}
			{#each notifications as [id, notification] (id)}
				<div class="item" data-notification={id}>
					<Icon name="notifications" size={ICON.control} />
					<div class="body">
						{#if notification.title}<div class="title">{notification.title}</div>{/if}
						{#if rendered[id]?.message === (notification.message ?? '')}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized in markdown.ts -->
							<div class="message">{@html rendered[id].html}</div>
						{:else}
							<div class="message">{notification.message ?? ''}</div>
						{/if}
					</div>
					<button
						type="button"
						class="action"
						aria-label={$lang('hearth_dismiss')}
						onclick={() => dismissNotification(id)}
					>
						<Icon name="close" size={ICON.inline} />
					</button>
				</div>
			{/each}
			{#if !$activeAlerts.length && !notifications.length}
				<div class="empty">{$lang('hearth_no_notifications')}</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		z-index: var(--h-layer-popup);
		background: var(--h-overlay);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.sheet {
		box-sizing: border-box;
		width: min(480px, 100%);
		max-height: calc(100dvh - 32px);
		overflow-y: auto;
		overscroll-behavior: contain;
		background: linear-gradient(180deg, var(--h-sheet-0), var(--h-sheet-1));
		border: 1px solid rgb(var(--h-accent-rgb) / calc(0.18 * var(--h-accent-scale)));
		border-radius: var(--h-radius-xl);
		padding: var(--h-modal-padding);
		box-shadow: var(--h-shadow-layer);
	}

	.header {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 16px;
	}

	.name {
		flex: 1;
		font-size: var(--h-type-title);
		font-weight: 600;
		color: var(--h-text-1);
	}

	.items {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.item {
		--alert-text: var(--h-icon);
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 12px;
		border-radius: var(--h-radius-sm);
		background: rgb(var(--h-surface-rgb) / calc(0.05 * var(--h-fill-scale)));
	}

	.body {
		flex: 1;
		min-width: 0;
		font-size: var(--h-type-secondary);
		color: var(--h-text-3);
		overflow-wrap: anywhere;
	}

	.title {
		font-weight: 600;
		color: var(--h-text-1);
		margin-bottom: 2px;
	}

	.message :global(p) {
		margin: 0;
	}

	.action {
		flex: none;
		width: 44px;
		height: 44px;
		margin: -10px -8px -10px 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--h-text-5);
		cursor: pointer;
		display: grid;
		place-items: center;
	}

	.action.close {
		margin: 0;
		background: rgb(var(--h-surface-rgb) / calc(0.06 * var(--h-fill-scale)));
		color: var(--h-icon);
	}

	.empty {
		padding: 12px;
		font-size: var(--h-type-secondary);
		color: var(--h-text-6);
		text-align: center;
	}

	.info {
		--alert-text: var(--h-cool-text);
	}

	.warning {
		--alert-text: var(--h-accent-text);
	}

	.critical {
		--alert-text: var(--h-bad-text);
	}

	/* see breakpoints.ts */
	@media (max-width: 900px) {
		.overlay {
			align-items: flex-end;
			padding: 0 env(safe-area-inset-right) 0 env(safe-area-inset-left);
		}

		.sheet {
			width: 100%;
			max-height: calc(100dvh - 24px);
			border-radius: var(--h-radius-xl) var(--h-radius-xl) 0 0;
			border-bottom: 0;
			padding: 22px 20px calc(24px + env(safe-area-inset-bottom));
		}
	}
</style>
