<script lang="ts">
	import { ICON } from '../../iconSizes';
	import { connected } from '$lib/core/ha/connection';
	import { subscribeForecast } from '$lib/core/ha/history';
	import { lang, selectedLanguage } from '$lib/core/i18n';
	import { entityAvailable, states } from '$lib/core/ha/entities';
	import { openEntityDetail } from '$lib/Hearth/details';
	import { displayTimeZone } from '../../store';
	import Icon from '../../Icon.svelte';
	import { conditionIcon } from './conditions';

	import type { WeatherWidget } from './descriptor';

	let { widget }: { widget: WeatherWidget } = $props();
	let weatherEntity = $derived(widget.entity);

	interface ForecastDay {
		day: string;
		temp: string;
	}

	let entity = $derived(weatherEntity ? $states?.[weatherEntity] : undefined);
	// an unreachable entity reads as unknown, never as a sunny day
	let available = $derived(entityAvailable(entity));
	let condition = $derived(available ? (entity?.state ?? '') : '');
	let temperature = $derived(entity?.attributes?.temperature);
	let apparent = $derived(entity?.attributes?.apparent_temperature);
	let sub = $derived(
		(condition ? $lang(`weather_${condition.replaceAll('-', '_')}`) : '') +
			(typeof apparent === 'number'
				? ` · ${$lang('apparent_temperature')} ${Intl.NumberFormat($selectedLanguage).format(Math.round(apparent))}°`
				: '')
	);

	let forecast = $state<ForecastDay[]>([]);

	$effect(() => {
		const entityId = weatherEntity;
		const locale = $selectedLanguage;
		const timeZone = $displayTimeZone;
		forecast = [];
		if (!$connected || !entityId) return;

		let cancelled = false;
		let unsubscribe: (() => void) | undefined;
		subscribeForecast(entityId, 'daily', (days) => {
			forecast = days.slice(1, 4).map((day) => ({
				day: new Date(day.datetime)
					.toLocaleDateString(locale, { weekday: 'short', ...(timeZone ? { timeZone } : {}) })
					.toUpperCase(),
				temp: `${Math.round(day.temperature ?? 0)}°`
			}));
		})
			.then((unsub) => {
				if (cancelled) unsub();
				else unsubscribe = unsub;
			})
			.catch(() => {
				// forecast unsupported, columns stay hidden
			});

		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	});
</script>

{#snippet content()}
	<div class="row">
		<Icon
			name={available ? conditionIcon(condition) : 'cloud_off'}
			size={ICON.control}
			color={available ? 'rgb(var(--h-accent-rgb))' : 'var(--h-icon)'}
			fill={available}
		/>
		<div class="current">
			<div class="temp">
				{available && typeof temperature === 'number'
					? `${Intl.NumberFormat($selectedLanguage).format(Math.round(temperature))}°`
					: '-'}
			</div>
			<div class="sub">{available ? sub : $lang('unavailable')}</div>
		</div>
		<div class="forecast">
			{#each forecast as day (day.day)}
				<div>
					<div class="day">{day.day}</div>
					<div class="value">{day.temp}</div>
				</div>
			{/each}
		</div>
	</div>
{/snippet}
{#if entity}
	<button type="button" class="card pressable" onclick={() => openEntityDetail(entity.entity_id)}>
		{@render content()}
	</button>
{:else}
	<div class="card">{@render content()}</div>
{/if}

<style>
	.card {
		margin-top: 28px;
		margin-bottom: 8px;
		padding: var(--h-card-padding);
		border-radius: var(--h-radius-card);
		background: rgb(var(--h-surface-rgb) / calc(0.05 * var(--h-fill-scale)));
		backdrop-filter: var(--h-surface-blur);
		box-shadow: var(--h-card-shadow);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.07 * var(--h-line-scale)));
		display: block;
		width: 100%;
		font: inherit;
		color: inherit;
		text-align: left;
	}

	button.card {
		cursor: pointer;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	/* one row always: the conditions text truncates, the forecast never wraps */
	.current {
		min-width: 0;
		flex: 1;
	}

	.current .sub {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.temp {
		font-size: var(--h-type-stat);
		font-weight: 600;
		color: var(--h-text-1);
	}

	.sub {
		font-size: var(--h-type-secondary);
		color: var(--h-text-4);
	}

	.forecast {
		margin-left: auto;
		flex: 0 0 auto;
		display: flex;
		gap: 14px;
		text-align: center;
	}

	.day {
		font-size: var(--h-type-label);
		color: var(--h-text-5);
	}

	.value {
		font-size: var(--h-type-secondary);
		color: var(--h-text-3);
		margin-top: 4px;
	}
</style>
