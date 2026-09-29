<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import '@fontsource-variable/geist-mono';
	import '@fontsource-variable/hanken-grotesk';
	import '@material-symbols/font-400/rounded.css';
	import { onDestroy } from 'svelte';
	import { configuration } from '$lib/core/app/configuration';
	import { disposeHaptics, haptics, startPressFeedback } from '$lib/core/app/haptics';
	import { motion } from '$lib/core/app/motion';
	import {
		connected,
		connectionError,
		failedAttempts,
		tokenNeeded,
		type ConnectionError
	} from '$lib/core/ha/connection';
	import { lang, selectedLanguage, translation } from '$lib/core/i18n';
	import { states } from '$lib/core/ha/entities';
	import { startConnection, stopConnection } from '$lib/core/ha/connection';
	import { setCommandGate } from '$lib/core/ha/commands';
	import { get } from 'svelte/store';
	import TokenPrompt from '$lib/Hearth/TokenPrompt.svelte';
	import ThemeStyle from '$lib/Hearth/shell/ThemeStyle.svelte';
	import { normalizeHearthConfig } from '$lib/Hearth/normalize';
	import {
		configurationLoadError,
		hearthConfig,
		hearthLoadError,
		hearthLoadErrorKind,
		hearthNeedsSetup,
		hearthRevision,
		hearthEditMode
	} from '$lib/Hearth/store';
	import HearthDashboard from '$lib/Hearth/HearthDashboard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let tokenPromptOpen = $state(false);
	// opens once when a token becomes necessary; the boot screen button reopens it after a dismiss
	$effect(() => {
		if ($tokenNeeded) tokenPromptOpen = true;
	});

	// attempts run every 3s, so the cause shows after about 6s; that also covers
	// the HA panel iframe while its parent session is still arriving
	const STALLED_AFTER_ATTEMPTS = 3;
	const connectionHints: Record<ConnectionError, string> = {
		cannot_connect: 'hearth_connection_failed_cannot_connect',
		https_to_http: 'hearth_connection_failed_https_to_http',
		panel_auth: 'hearth_connection_failed_panel_auth',
		invalid_auth: 'hearth_connection_failed_unknown',
		unknown: 'hearth_connection_failed_unknown'
	};
	let stalledError = $derived(
		$failedAttempts >= STALLED_AFTER_ATTEMPTS ? $connectionError : undefined
	);

	// one-time store seeding; `data` only changes on a full page load
	// svelte-ignore state_referenced_locally
	$configuration = data?.configuration;
	// svelte-ignore state_referenced_locally
	$hearthConfig = normalizeHearthConfig(data?.hearth);
	// svelte-ignore state_referenced_locally
	$hearthLoadError = data?.hearthError ?? null;
	// svelte-ignore state_referenced_locally
	$hearthLoadErrorKind = data?.hearthErrorKind ?? null;
	// svelte-ignore state_referenced_locally
	$configurationLoadError = data?.configurationError ?? null;
	// svelte-ignore state_referenced_locally
	$hearthNeedsSetup = data?.hearthNeedsSetup ?? false;
	// svelte-ignore state_referenced_locally
	$hearthRevision = data?.hearthRevision ?? 0;
	// svelte-ignore state_referenced_locally
	$translation = data?.translations ?? {};
	// svelte-ignore state_referenced_locally
	$selectedLanguage = data?.configuration?.locale || 'en';
	if (browser) document.documentElement.lang = $selectedLanguage;

	// motion:false in configuration.yaml disables transitions app-wide, and so
	// does the OS reduced-motion setting unless motion is explicitly true
	const reducedMotion = browser && matchMedia('(prefers-reduced-motion: reduce)').matches;
	// svelte-ignore state_referenced_locally
	if (
		data?.configuration?.motion === false ||
		(reducedMotion && data?.configuration?.motion !== true)
	) {
		motion.set(0);
	}

	// svelte-ignore state_referenced_locally
	haptics.set(data?.configuration?.haptics === true);
	const stopPressFeedback = browser ? startPressFeedback() : undefined;

	if (browser) startConnection($configuration);

	// reconnect when a long-lived access token is entered
	$effect(() => {
		if ($configuration?.token && browser) startConnection($configuration);
	});

	// taps arrange cards while the layout editor is open and must not reach a device
	setCommandGate(() => !get(hearthEditMode));
	onDestroy(() => {
		stopConnection();
		stopPressFeedback?.();
		disposeHaptics();
		setCommandGate(() => true);
	});
</script>

<svelte:head>
	<!-- eslint-disable-next-line hearth/no-bare-text -- product name, not copy -->
	<title>Hearth</title>
	<link rel="manifest" href="{base}/hearth.webmanifest" />
	<meta name="theme-color" content="#16110c" />
</svelte:head>

{#if $states}
	<HearthDashboard />
{:else}
	<ThemeStyle />
	{#if $configuration?.hassUrl}
		<section class="boot">
			{#if !$tokenNeeded && !stalledError}
				<div class="boot-mark" aria-hidden="true"></div>
			{/if}
			<div class="boot-status" role="status">
				{#if $tokenNeeded}
					<strong>{$lang('hearth_sign_in_required')}</strong>
					<span>
						{$lang(
							$configuration.token ? 'hearth_token_rejected_hint' : 'hearth_sign_in_token_missing'
						)}
					</span>
				{:else if stalledError}
					<strong>{$lang('hearth_connection_failed')}</strong>
					<span>{$lang(connectionHints[stalledError])}</span>
					<span>{$lang('hearth_connection_retrying')}</span>
				{:else}
					<strong>
						{$lang(
							$connected ? 'hearth_loading_home_assistant' : 'hearth_connecting_to_home_assistant'
						)}
					</strong>
					<span>{$lang('hearth_appears_after_first_snapshot')}</span>
				{/if}
			</div>
			{#if $tokenNeeded}
				<button type="button" onclick={() => (tokenPromptOpen = true)}>
					{$lang('hearth_sign_in')}
				</button>
			{:else if stalledError}
				<button type="button" onclick={() => startConnection($configuration)}>
					{$lang('hearth_retry')}
				</button>
			{/if}
		</section>
	{:else}
		<section class="boot" role="alert">
			<strong>{$lang('hearth_hass_url_missing')}</strong>
			<span>{$lang('hearth_hass_url_missing_hint')}</span>
		</section>
	{/if}
{/if}

{#if tokenPromptOpen}<TokenPrompt onclose={() => (tokenPromptOpen = false)} />{/if}

<!-- modules -->
{#if $configuration?.custom_js}
	{#await import('$lib/ui/CustomJs.svelte') then CustomJs}
		<CustomJs.default />
	{/await}
{/if}

<!-- custom css -->
{#await import('$lib/ui/CustomCss.svelte') then CustomCss}
	<CustomCss.default />
{/await}

<style>
	.boot {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 12px;
		width: 100%;
		height: 100vh;
		height: 100dvh;
		padding: 24px;
		background: var(--h-bg-1, #16110c); /* literal ok: fallback if theme tokens are missing */
		color: var(--h-text-1, #f6eee5); /* literal ok: fallback if theme tokens are missing */
		font-family: var(--h-font-ui, 'Hanken Grotesk Variable', sans-serif);
		text-align: center;
	}

	.boot-mark {
		width: 36px;
		height: 36px;
		border: 3px solid rgb(var(--h-accent-rgb, 240 166 61) / calc(0.22 * var(--h-accent-scale, 1)));
		border-top-color: rgb(var(--h-accent-rgb, 240 166 61));
		border-radius: 50%;
		animation: spin 900ms linear infinite; /* literal ok: spinner period, not a transition */
	}

	.boot-status {
		display: grid;
		justify-items: center;
		gap: 12px;
		max-width: 480px;
	}

	.boot strong {
		font-size: var(--h-type-title, 20px);
	}

	.boot span {
		font-size: var(--h-type-body, 14px);
		color: var(--h-text-4, #a99b8b); /* literal ok: fallback if theme tokens are missing */
	}

	.boot button {
		margin-top: 4px;
		border: 1px solid rgb(var(--h-accent-rgb, 240 166 61) / calc(0.35 * var(--h-accent-scale, 1)));
		border-radius: var(--h-radius-xs, 12px);
		padding: 10px 18px;
		background: transparent;
		color: var(--h-accent-text, #f0a63d); /* literal ok: fallback if theme tokens are missing */
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}

	:global(html[data-motion='off']) .boot-mark {
		animation: none;
	}
</style>
