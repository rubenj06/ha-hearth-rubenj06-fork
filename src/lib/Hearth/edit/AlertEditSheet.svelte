<script lang="ts">
	import { get } from 'svelte/store';
	import { lang } from '$lib/core/i18n';
	import { MAX_ALERT_SECONDS, normalizeVisibility, slugify, uniqueId } from '../config';
	import type { AlertRule, AlertSeverity, VisibilityCondition } from '../types';
	import { editor, hearthConfig, updateConfig } from '../store';
	import EditSheet from './EditSheet.svelte';
	import EntityField from './EntityField.svelte';
	import IconField from './IconField.svelte';
	import SelectField from './SelectField.svelte';
	import TextField from './TextField.svelte';
	import VisibilityField from './VisibilityField.svelte';

	let { index }: { index: number | null } = $props();

	// initial value only - the sheet is remounted per editor target via {#key}
	// svelte-ignore state_referenced_locally
	const initial = index !== null ? get(hearthConfig).alerts?.[index] : undefined;

	let title = $state(initial?.title ?? '');
	let message = $state(initial?.message ?? '');
	let icon = $state(initial?.icon ?? '');
	let severity = $state<AlertSeverity>(initial?.severity ?? 'info');
	let conditions = $state<VisibilityCondition[]>(
		(initial?.conditions ?? []).map((condition) => ({ ...condition }))
	);
	let seconds = $state(initial?.for_seconds ? String(initial.for_seconds) : '');
	let entity = $state(initial?.entity ?? '');
	let popup = $state(initial?.popup !== false);
	let autoClose = $state(initial?.auto_close !== false);

	let SEVERITY_OPTIONS = $derived([
		{ value: 'info', label: $lang('hearth_alert_severity_info') },
		{ value: 'warning', label: $lang('hearth_alert_severity_warning') },
		{ value: 'critical', label: $lang('hearth_alert_severity_critical') }
	]);

	let delay = $derived(seconds.trim() === '' ? 0 : Number(seconds));
	let delayError = $derived(
		Number.isInteger(delay) && delay >= 0 && delay <= MAX_ALERT_SECONDS
			? null
			: $lang('hearth_alert_delay_invalid')
	);
	let rules = $derived(normalizeVisibility($state.snapshot(conditions)));
	let valid = $derived(title.trim() !== '' && !!rules && !delayError);

	function close() {
		editor.set(null);
	}

	function back() {
		editor.set({ kind: 'settings' });
	}

	function build(id: string): AlertRule {
		return {
			...(initial ?? {}),
			id,
			title: title.trim(),
			message: message.trim() || undefined,
			icon: icon.trim() || undefined,
			severity,
			conditions: rules ?? [],
			for_seconds: delay > 0 ? delay : undefined,
			entity: entity.trim() || undefined,
			popup: popup ? undefined : false,
			auto_close: autoClose ? undefined : false
		};
	}

	// the list can change under the sheet (undo), so writes find the rule by id
	function position(alerts: AlertRule[]) {
		return initial ? alerts.findIndex((rule) => rule.id === initial.id) : -1;
	}

	function done() {
		updateConfig((config) => {
			const alerts = (config.alerts ??= []);
			const at = position(alerts);
			if (initial && at >= 0) alerts[at] = build(initial.id);
			else {
				const taken = alerts.map((rule) => rule.id);
				alerts.push(build(uniqueId(slugify(title) || 'alert', taken)));
			}
		});
		back();
	}

	function remove() {
		updateConfig((config) => {
			const alerts = config.alerts ?? [];
			const at = position(alerts);
			if (at >= 0) alerts.splice(at, 1);
			if (!alerts.length) config.alerts = undefined;
		});
		back();
	}
</script>

<EditSheet
	title={$lang(initial ? 'hearth_edit_alert' : 'hearth_add_alert')}
	onclose={close}
	onback={back}
	ondone={done}
	doneDisabled={!valid}
	onremove={initial ? remove : undefined}
>
	<div class="editor-fields">
		<TextField label={$lang('hearth_title')} bind:value={title} autofocus={!initial} />
		<TextField label={$lang('hearth_alert_message')} bind:value={message} />
		<SelectField
			label={$lang('hearth_alert_severity')}
			bind:value={severity}
			options={SEVERITY_OPTIONS}
		/>
		<IconField label={$lang('hearth_icon_optional')} bind:value={icon} />

		<div class="group-label">{$lang('hearth_alert_when')}</div>
		<VisibilityField bind:value={conditions} media={false} />
		<TextField
			label={$lang('hearth_alert_delay')}
			bind:value={seconds}
			placeholder="0"
			hint={$lang('hearth_alert_delay_hint')}
			error={delayError}
		/>

		<EntityField
			label={$lang('hearth_alert_entity')}
			bind:value={entity}
			hint={$lang('hearth_alert_entity_hint')}
		/>
		<label class="check">
			<input type="checkbox" bind:checked={popup} />
			<span>{$lang('hearth_alert_popup')}</span>
		</label>
		<label class="check">
			<input type="checkbox" bind:checked={autoClose} />
			<span>{$lang('hearth_alert_auto_close')}</span>
		</label>
	</div>
</EditSheet>
