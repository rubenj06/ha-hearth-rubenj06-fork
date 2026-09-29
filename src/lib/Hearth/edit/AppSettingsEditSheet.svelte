<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { configuration } from '$lib/core/app/configuration';
	import { deviceName, saveDeviceName } from '$lib/core/app/device';
	import { haptics, hapticsSupported, sampleVibration, vibrate } from '$lib/core/app/haptics';
	import { motion } from '$lib/core/app/motion';
	import { MOTION } from '$lib/core/theme';
	import { lang, selectedLanguage, translation } from '$lib/core/i18n';
	import { editor, requestConfirmation, type Editor } from '../store';
	import EditSheet from './EditSheet.svelte';
	import SelectField from './SelectField.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import Switch from '../Switch.svelte';

	let languages = $state<{ value: string; label: string }[]>([]);
	let locale = $state($selectedLanguage || 'en');
	let reduceMotion = $state($motion === 0);
	let touchFeedback = $state($haptics);
	let feedbackSupported = $state(true);
	let token = $state($configuration?.token ?? '');
	let customJs = $state($configuration?.custom_js ?? false);
	// may come from a ?device= override, which is not this browser's to keep
	const shownDevice = $deviceName;
	let device = $state(shownDevice);
	let installedVersion = $state<string>();
	let saveError = $state<string | null>(null);
	// the revision the server holds after another session saved first
	let conflictRevision = $state<number | null>(null);
	let saving = $state(false);

	function staged() {
		return { locale, reduceMotion, touchFeedback, token, customJs, device };
	}

	let touchFeedbackSub = $derived(
		$lang(feedbackSupported ? 'hearth_touch_feedback_sub' : 'hearth_touch_feedback_unsupported')
	);

	const initial = JSON.stringify(staged());
	let dirty = $derived(JSON.stringify(staged()) !== initial);

	onMount(async () => {
		feedbackSupported = hapticsSupported();
		try {
			const [languageResponse, versionResponse] = await Promise.all([
				fetch(`${base}/_api/list_languages`),
				fetch(`${base}/_api/version`)
			]);
			if (languageResponse.ok) {
				const codes: string[] = await languageResponse.json();
				languages = codes.map((code) => {
					const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) || code;
					return { value: code, label: name.charAt(0).toUpperCase() + name.slice(1) };
				});
			}
			if (versionResponse.ok) installedVersion = (await versionResponse.json())?.installed;
		} catch (error) {
			console.error(error);
		}
	});

	/** Every exit short of Done, so staged edits are never dropped silently. */
	function leave(next: Editor | null) {
		if (!dirty) {
			editor.set(next);
			return;
		}
		requestConfirmation({
			title: $lang('unsaved_changes_title'),
			message: $lang('unsaved_changes'),
			confirmLabel: $lang('hearth_discard'),
			action: () => editor.set(next)
		});
	}

	/** `revision` overrides the one loaded with the page, for an explicit overwrite. */
	async function done(revision?: number) {
		if (saving) return;
		saving = true;
		saveError = null;
		conflictRevision = null;

		const next = {
			...($configuration ?? {}),
			locale,
			...(revision === undefined ? {} : { revision })
		};
		if (reduceMotion) next.motion = false;
		else delete next.motion;
		if (touchFeedback) next.haptics = true;
		else delete next.haptics;
		if (token.trim()) next.token = token.trim();
		else delete next.token;
		if (customJs) next.custom_js = true;
		else delete next.custom_js;

		try {
			const json: Record<string, unknown> = { ...next };
			delete json.hassUrl;
			const response = await fetch(`${base}/_api/save_config`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(json)
			});
			if (response.status === 409) {
				const body = await response.json().catch(() => null);
				conflictRevision = Number.isInteger(body?.revision) ? body.revision : null;
				saveError = $lang('hearth_app_settings_changed');
				vibrate('error');
				return;
			}
			if (!response.ok) {
				saveError = `${$lang('hearth_save_failed')} [${response.status}]`;
				vibrate('error');
				return;
			}

			$configuration = { ...next, revision: (await response.json()).revision };
			$selectedLanguage = locale;
			$motion = reduceMotion ? 0 : MOTION.base;
			$haptics = touchFeedback;
			if (device !== shownDevice) saveDeviceName(device);
			vibrate('success');
			document.documentElement.lang = locale || 'en';

			const translationResponse = await fetch(`${base}/_api/get_translation`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ locale })
			});
			if (translationResponse.ok) $translation = await translationResponse.json();
			editor.set(null);
		} catch (error) {
			console.error(error);
			saveError = $lang('hearth_save_failed');
			vibrate('error');
		} finally {
			saving = false;
		}
	}

	function handleKeyFocus(event: FocusEvent) {
		const target = event.target as HTMLInputElement;
		target.type = event.type === 'focus' ? 'text' : 'password';
	}

	function confirmOverwrite(revision: number) {
		requestConfirmation({
			title: $lang('hearth_overwrite_newer_app_settings'),
			message: $lang('hearth_overwrite_app_settings_message'),
			confirmLabel: $lang('hearth_overwrite'),
			action: () => void done(revision)
		});
	}

	function handleLogout() {
		requestConfirmation({
			title: $lang('hearth_logout_confirm'),
			message: $lang('hearth_logout_confirm_message'),
			confirmLabel: $lang('log_out'),
			action: () => {
				localStorage.removeItem('hearthTokens');
				location.reload();
			}
		});
	}
</script>

<EditSheet
	title={$lang('hearth_application_settings')}
	onclose={() => leave(null)}
	onback={() => leave({ kind: 'settings' })}
	ondone={() => done()}
	doneLabel={$lang('save')}
	doneDisabled={saving}
>
	<div class="settings">
		<div class="section-note">{$lang('hearth_changes_are_staged_until_you_choose')}</div>
		<div class="rows">
			{#if languages.length}
				<SettingsRow label={$lang('language')}>
					<SelectField inline label={$lang('language')} bind:value={locale} options={languages} />
				</SettingsRow>
			{/if}
			<SettingsRow label={$lang('hearth_reduce_motion')}>
				<Switch
					checked={reduceMotion}
					label={$lang('hearth_reduce_motion')}
					onchange={(checked) => (reduceMotion = checked)}
				/>
			</SettingsRow>
			<SettingsRow label={$lang('hearth_touch_feedback')} sub={touchFeedbackSub}>
				<Switch
					checked={touchFeedback}
					label={$lang('hearth_touch_feedback')}
					onchange={(checked) => {
						touchFeedback = checked;
						// the choice is staged, so the sample bypasses the store
						if (touchFeedback) sampleVibration('press');
					}}
				/>
			</SettingsRow>
			<SettingsRow label={$lang('hearth_long_lived_token')} sub={$lang('hearth_token_hint')}>
				<input
					class="inline-text"
					type="password"
					bind:value={token}
					placeholder="eyJ..."
					autocomplete="new-password"
					spellcheck="false"
					onfocus={handleKeyFocus}
					onblur={handleKeyFocus}
				/>
			</SettingsRow>
			<SettingsRow label={$lang('hearth_device_name')} sub={$lang('hearth_device_name_sub')}>
				<input
					class="inline-text"
					type="text"
					aria-label={$lang('hearth_device_name')}
					bind:value={device}
					placeholder="kitchen"
					autocomplete="off"
					spellcheck="false"
				/>
			</SettingsRow>
			<SettingsRow label={$lang('hearth_custom_js')} sub={$lang('hearth_custom_js_sub')}>
				<Switch
					checked={customJs}
					label={$lang('hearth_custom_js')}
					onchange={(checked) => (customJs = checked)}
				/>
			</SettingsRow>
			<SettingsRow label={$lang('version')}>
				<span class="row-value">{installedVersion ?? $lang('hearth_loading')}</span>
			</SettingsRow>
		</div>
		{#if saveError}
			<div class="error" role="alert">
				<span>{saveError}</span>
				{#if conflictRevision !== null}
					<span class="error-actions">
						<button
							type="button"
							class="hearth-button danger"
							onclick={() => conflictRevision !== null && confirmOverwrite(conflictRevision)}
						>
							{$lang('hearth_overwrite')}
						</button>
						<button type="button" class="hearth-button secondary" onclick={() => location.reload()}>
							{$lang('hearth_reload')}
						</button>
					</span>
				{/if}
			</div>
		{/if}

		<div class="rows">
			<SettingsRow
				icon="css"
				label={$lang('hearth_custom_css')}
				sub={$lang('hearth_custom_css_sub')}
				onclick={() => leave({ kind: 'customCss' })}
			/>
			<SettingsRow
				icon="logout"
				label={$lang('log_out')}
				sub={$lang('hearth_clears_the_home_assistant_session')}
				danger
				chevron={false}
				onclick={handleLogout}
			/>
		</div>
	</div>
</EditSheet>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 18px;
		max-width: 560px;
		margin: 0 auto;
		width: 100%;
	}

	.section-note,
	.error {
		font-size: var(--h-type-small);
		color: var(--h-text-6);
	}

	.error {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		color: var(--h-bad-text);
	}

	.error-actions {
		display: flex;
		gap: 8px;
		margin-left: auto;
	}

	.rows {
		border-radius: var(--h-radius-sm);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.08 * var(--h-line-scale)));
		background: var(--h-track);
		overflow: hidden;
	}

	.row-value {
		font-size: var(--h-type-body);
		color: var(--h-text-3);
	}

	.inline-text {
		width: min(240px, 45%);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.1 * var(--h-line-scale)));
		border-radius: var(--h-radius-xs);
		background: rgb(var(--h-surface-rgb) / calc(0.06 * var(--h-fill-scale)));
		color: var(--h-text-2);
		font: inherit;
		font-size: var(--h-type-body);
		padding: 8px 12px;
		outline: none;
	}
</style>
