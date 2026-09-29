<script lang="ts">
	import { lang } from '$lib/core/i18n';
	import { validTimeZone, type ClockHourFormat } from '../../clock';
	import type { StyledClockStyle } from '../../model/widgets/styled_clock';
	import type { WidgetEditorProps } from '../types';
	import type { StyledClockWidget } from './descriptor';
	import SelectField from '../../edit/SelectField.svelte';
	import TextField from '../../edit/TextField.svelte';

	let { initial: initialProp, onchange }: WidgetEditorProps<StyledClockWidget> = $props();

	// remounted per target and type, so the initial value is all the form needs
	// svelte-ignore state_referenced_locally
	const initial = initialProp;

	let style = $state<StyledClockStyle>(initial?.style ?? 'analog');
	let timezone = $state(initial?.timezone ?? '');
	let hourFormat = $state<ClockHourFormat>(initial?.hour_format ?? 'auto');
	let showSeconds = $state(initial?.show_seconds ?? false);
	let showDate = $state(!initial?.hide_date);
	let timezoneValid = $derived(!timezone.trim() || !!validTimeZone(timezone));

	$effect(() => {
		onchange({
			fields: {
				style: style === 'flip' ? 'flip' : undefined,
				timezone: validTimeZone(timezone),
				hour_format: hourFormat === 'auto' ? undefined : hourFormat,
				show_seconds: showSeconds || undefined,
				hide_date: showDate ? undefined : true
			},
			valid: timezoneValid
		});
	});
</script>

<SelectField
	label={$lang('hearth_style')}
	bind:value={style}
	options={[
		{ value: 'analog', label: $lang('hearth_clock_style_analog') },
		{ value: 'flip', label: $lang('hearth_clock_style_flip') }
	]}
/>
<TextField label={$lang('hearth_time_zone')} bind:value={timezone} placeholder="Europe/Amsterdam" />
{#if !timezoneValid}<div class="field-error">{$lang('hearth_use_an_iana_time_zone_such')}</div>{/if}
{#if style === 'flip'}
	<SelectField
		label={$lang('hearth_hour_format')}
		bind:value={hourFormat}
		options={[
			{ value: 'auto', label: $lang('hearth_locale_default') },
			{ value: '12', label: $lang('hearth_12_hour') },
			{ value: '24', label: $lang('hearth_24_hour') }
		]}
	/>
{/if}
<label class="check"
	><input type="checkbox" bind:checked={showSeconds} /> {$lang('hearth_show_seconds')}</label
>
<label class="check"
	><input type="checkbox" bind:checked={showDate} /> {$lang('hearth_show_date')}</label
>
