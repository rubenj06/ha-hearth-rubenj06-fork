<script lang="ts">
	import { onMount } from 'svelte';
	import { activeAlerts, alertListOpen, hearthEditMode, popup, type HearthAlert } from './store';
	import { dismissAlert, startAlerts, type AlertHost } from './alertEngine';
	import AlertList from './AlertList.svelte';
	import AlertPopup from './AlertPopup.svelte';

	let { host }: { host: AlertHost } = $props();

	onMount(() => startAlerts(host));

	// the list shares the popup layer and comes later in the page, so it
	// would cover an entity popup opened while it is up
	$effect(() => {
		if ($hearthEditMode || $popup) alertListOpen.set(false);
	});

	function openFromAlert(alert: HearthAlert) {
		if (!alert.entity) return;
		dismissAlert(alert.key);
		host.openDetail(alert.entity);
	}
</script>

{#if $alertListOpen}
	<AlertList {host} />
{/if}
<!--
	The cards sit above popups. While any entity popup is open, whoever opened
	it, they step away and give up Escape and focus so the popup can be used;
	they return when it closes.
-->
{#if !$hearthEditMode && !$popup && $activeAlerts.some((alert) => alert.popup)}
	<AlertPopup {host} onopen={openFromAlert} />
{/if}
