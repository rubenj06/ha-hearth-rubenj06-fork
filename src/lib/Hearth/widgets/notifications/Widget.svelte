<script lang="ts">
	import EmptyState from '../../EmptyState.svelte';
	import { ICON } from '../../iconSizes';
	import { fill, lang } from '$lib/core/i18n';
	import { persistentNotifications } from '$lib/core/ha/connection';
	import { activeAlerts, alertIcon, alertListOpen, hearthEditMode } from '../../store';
	import type { NotificationsWidget } from './descriptor';
	import Icon from '../../Icon.svelte';

	let { widget }: { widget: NotificationsWidget } = $props();

	let notifications = $derived(Object.values($persistentNotifications ?? {}));
	let count = $derived($activeAlerts.length + notifications.length);
	// the newest alert leads; a Home Assistant notification only when there is none
	let lead = $derived(
		$activeAlerts[0] ?? (notifications[0] && { ...notifications[0], severity: 'info' as const })
	);
</script>

<!-- nothing to show hides the widget; the editor keeps it findable, dimmed -->
{#if count || $hearthEditMode}
	<div class="notifications" class:inactive={!count} data-widget={widget.id}>
		{#if lead}
			<button
				type="button"
				class="summary {lead.severity}"
				aria-label={fill($lang('hearth_notifications_count'), { count })}
				onclick={() => !$hearthEditMode && alertListOpen.set(true)}
			>
				<span class="glyph">
					<Icon
						name={$activeAlerts.length ? alertIcon(lead) : 'notifications'}
						size={ICON.control}
						color="var(--alert-text)"
					/>
					<span class="badge">{count}</span>
				</span>
				<span class="lead">{lead.title || $lang('notifications')}</span>
				<Icon name="chevron_right" size={ICON.control} />
			</button>
		{:else}
			<EmptyState inline text={$lang('hearth_no_notifications')} />
		{/if}
	</div>
{/if}

<style>
	.notifications {
		padding: 6px 0;
	}

	.notifications.inactive {
		opacity: 0.45;
	}

	.summary {
		--alert-text: var(--h-icon);
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 44px;
		padding: 10px 12px;
		border: 0;
		border-radius: var(--h-radius-sm);
		background: rgb(var(--h-surface-rgb) / calc(0.05 * var(--h-fill-scale)));
		backdrop-filter: var(--h-surface-blur);
		color: var(--h-text-5);
		font: inherit;
		text-align: start;
		cursor: pointer;
	}

	.warning {
		--alert-text: var(--h-accent-text);
	}

	.critical {
		--alert-text: var(--h-bad-text);
	}

	.glyph {
		position: relative;
		display: grid;
	}

	.badge {
		position: absolute;
		top: -6px;
		right: -8px;
		min-width: 16px;
		padding: 0 4px;
		border-radius: var(--h-radius-hair);
		background: rgb(var(--h-accent-rgb) / calc(0.9 * var(--h-accent-scale)));
		color: var(--h-on-accent);
		font-size: var(--h-type-label);
		font-weight: 700;
		line-height: 16px;
		text-align: center;
	}

	.lead {
		flex: 1;
		min-width: 0;
		font-size: var(--h-type-secondary);
		font-weight: 600;
		color: var(--h-text-1);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
