<script lang="ts">
	import { integerFromInput, numberFromInput } from './numbers';
	import { ICON } from '../iconSizes';
	import { fill, lang } from '$lib/core/i18n';
	import { config as haConfig } from '$lib/core/ha/connection';
	import {
		isTileUrl,
		RADAR_ZOOM,
		railPositionOf,
		type RailPosition,
		type ScreensaverRadar
	} from '../config';
	import {
		editor,
		hearthConfig,
		screensaverPreview,
		setupWizardOpen,
		updateConfig
	} from '../store';
	import EditSheet from './EditSheet.svelte';
	import EntityField from './EntityField.svelte';
	import Icon from '../Icon.svelte';
	import ImageField from './ImageField.svelte';
	import SelectField from './SelectField.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import TextField from './TextField.svelte';
	import Switch from '../Switch.svelte';
	import { wakeLockState } from '../wakeLock';

	let screensaver = $derived(String($hearthConfig.screensaver_minutes ?? 0));
	let screensaverDrift = $derived($hearthConfig.screensaver_drift ?? false);
	let screensaverBrightness = $derived(String($hearthConfig.screensaver_brightness ?? 32));
	let showDate = $derived($hearthConfig.screensaver_show_date ?? true);
	let clockSize = $derived($hearthConfig.screensaver_clock_size ?? 'medium');
	let weatherEntity = $derived($hearthConfig.screensaver_weather_entity ?? '');
	let background = $derived($hearthConfig.screensaver_background ?? 'none');
	let backgroundImage = $derived($hearthConfig.screensaver_image ?? '');
	let radar = $derived($hearthConfig.screensaver_radar ?? {});
	let useHomeLocation = $derived(radar.latitude === undefined || radar.longitude === undefined);
	// without a home location in Home Assistant, only custom coordinates can work
	let homeKnown = $derived(
		Number.isFinite($haConfig?.latitude) && Number.isFinite($haConfig?.longitude)
	);
	let coordinateInvalid = $state({ latitude: false, longitude: false });
	let tileUrlInvalid = $state(false);
	let keepScreenOn = $derived($hearthConfig.keep_screen_on ?? true);
	let scrollEdgeBlur = $derived($hearthConfig.scroll_edge_blur ?? true);
	let railPosition = $derived(railPositionOf($hearthConfig));
	let swipeMobile = $derived($hearthConfig.swipe_navigation_mobile ?? false);
	let swipeDesktop = $derived($hearthConfig.swipe_navigation_desktop ?? false);
	let paddingX = $derived($hearthConfig.padding_x ?? 0);
	let paddingY = $derived($hearthConfig.padding_y ?? 0);

	let SCREENSAVER_OPTIONS = $derived([
		{ value: '0', label: $lang('off') },
		{ value: '1', label: $lang('hearth_after_1_minute') },
		{ value: '5', label: $lang('hearth_after_5_minutes') },
		{ value: '10', label: $lang('hearth_after_10_minutes') },
		{ value: '15', label: $lang('hearth_after_15_minutes') },
		{ value: '30', label: $lang('hearth_after_30_minutes') },
		{ value: '60', label: $lang('hearth_after_1_hour') }
	]);
	let SCREENSAVER_BRIGHTNESS_OPTIONS = $derived([
		{ value: '18', label: $lang('hearth_very_dim') },
		{ value: '32', label: $lang('hearth_dim') },
		{ value: '50', label: $lang('fan_speed_medium') },
		{ value: '75', label: $lang('hearth_bright') }
	]);

	let RAIL_POSITION_OPTIONS = $derived([
		{ value: 'left', label: $lang('hearth_sidebar_left') },
		{ value: 'right', label: $lang('hearth_sidebar_right') },
		{ value: 'both', label: $lang('hearth_sidebar_both') },
		{ value: 'none', label: $lang('hearth_sidebar_none') }
	]);

	function setRailPosition(value: string) {
		updateConfig((config) => {
			config.rail_position = value === 'left' ? undefined : (value as RailPosition);
		});
	}

	let CLOCK_SIZE_OPTIONS = $derived([
		{ value: 'small', label: $lang('hearth_small') },
		{ value: 'medium', label: $lang('fan_speed_medium') },
		{ value: 'large', label: $lang('hearth_large') }
	]);
	let BACKGROUND_OPTIONS = $derived([
		{ value: 'none', label: $lang('hearth_sleep_background_none') },
		{ value: 'image', label: $lang('hearth_sleep_background_image') },
		{ value: 'radar', label: $lang('hearth_sleep_background_radar') }
	]);
	let BASEMAP_OPTIONS = $derived([
		{ value: 'dark', label: $lang('hearth_dark') },
		{ value: 'light', label: $lang('hearth_light') }
	]);
	let COORDINATES = $derived([
		{ axis: 'latitude', label: $lang('hearth_sleep_latitude'), limit: 90 },
		{ axis: 'longitude', label: $lang('hearth_sleep_longitude'), limit: 180 }
	] as const);
	const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
	const ZOOM_OPTIONS = Array.from({ length: RADAR_ZOOM.max - RADAR_ZOOM.min + 1 }, (_, index) => {
		const zoom = String(RADAR_ZOOM.min + index);
		return { value: zoom, label: zoom };
	});

	function setScreensaver(value: string) {
		const minutes = integerFromInput(value);
		updateConfig((config) => {
			config.screensaver_minutes = minutes > 0 ? minutes : undefined;
		});
	}

	function setScreensaverDrift(enabled: boolean) {
		updateConfig((config) => {
			config.screensaver_drift = enabled ? true : undefined;
		});
	}

	function setScreensaverBrightness(value: string) {
		const brightness = integerFromInput(value);
		updateConfig((config) => {
			config.screensaver_brightness = brightness === 32 ? undefined : brightness;
		});
	}

	function setShowDate(enabled: boolean) {
		updateConfig((config) => {
			config.screensaver_show_date = enabled ? undefined : false;
		});
	}

	function setClockSize(value: string) {
		updateConfig((config) => {
			config.screensaver_clock_size = value === 'small' || value === 'large' ? value : undefined;
		});
	}

	function setWeatherEntity(value: string) {
		updateConfig((config) => {
			config.screensaver_weather_entity = value.trim() || undefined;
		});
	}

	function setBackground(value: string) {
		updateConfig((config) => {
			config.screensaver_background = value === 'image' || value === 'radar' ? value : undefined;
		});
	}

	function setBackgroundImage(value: string) {
		updateConfig((config) => {
			config.screensaver_image = value.trim() || undefined;
		});
	}

	/** Applies a change to the radar settings, dropping keys that are back at their default. */
	function setRadar(patch: Partial<ScreensaverRadar>) {
		updateConfig((config) => {
			const next: ScreensaverRadar = { ...config.screensaver_radar, ...patch };
			if (next.zoom === RADAR_ZOOM.fallback) next.zoom = undefined;
			if (next.basemap === 'dark') next.basemap = undefined;
			const kept = Object.entries(next).filter(([, value]) => value !== undefined);
			config.screensaver_radar = kept.length ? Object.fromEntries(kept) : undefined;
		});
	}

	// turning the home location off starts the fields from the home coordinates
	function setUseHomeLocation(enabled: boolean) {
		const round = (value: number | undefined) =>
			value === undefined ? undefined : Math.round(value * 10_000) / 10_000;
		setRadar(
			enabled
				? { latitude: undefined, longitude: undefined }
				: { latitude: round($haConfig?.latitude), longitude: round($haConfig?.longitude) }
		);
	}

	function setCoordinate(axis: 'latitude' | 'longitude', limit: number, value: string) {
		const coordinate = numberFromInput(value);
		const valid = Number.isFinite(coordinate) && Math.abs(coordinate) <= limit;
		coordinateInvalid[axis] = !valid;
		if (valid) setRadar({ [axis]: coordinate });
	}

	function setTileUrl(value: string) {
		const url = value.trim();
		tileUrlInvalid = url !== '' && !isTileUrl(url);
		if (!tileUrlInvalid) setRadar({ tile_url: url || undefined });
	}

	function setKeepScreenOn(enabled: boolean) {
		updateConfig((config) => {
			config.keep_screen_on = enabled ? undefined : false;
		});
	}

	function setScrollEdgeBlur(enabled: boolean) {
		updateConfig((config) => {
			config.scroll_edge_blur = enabled ? undefined : false;
		});
	}

	function setSwipe(key: 'swipe_navigation_mobile' | 'swipe_navigation_desktop', enabled: boolean) {
		updateConfig((config) => {
			config[key] = enabled ? true : undefined;
		});
	}

	function setPadding(axis: 'padding_x' | 'padding_y', value: string) {
		const pixels = integerFromInput(value);
		updateConfig((config) => {
			config[axis] = Number.isFinite(pixels) && pixels > 0 ? Math.min(pixels, 300) : undefined;
		});
	}

	function close() {
		editor.set(null);
	}
</script>

<!-- every row applies as it changes, so the header action only closes -->
<EditSheet
	title={$lang('settings')}
	onclose={close}
	ondone={close}
	doneLabel={$lang('hearth_close')}
>
	<div class="settings">
		<section>
			<div class="section-title">{$lang('hearth_sleep_screen')}</div>
			<div class="rows">
				<SettingsRow label={$lang('hearth_screensaver')}>
					<SelectField
						inline
						label={$lang('hearth_screensaver')}
						value={screensaver}
						options={SCREENSAVER_OPTIONS}
						onchange={setScreensaver}
					/>
				</SettingsRow>
				<SettingsRow
					icon="bedtime"
					label={$lang('hearth_preview_sleep_screen')}
					chevron={false}
					onclick={() => screensaverPreview.set(true)}
				/>
				<SettingsRow label={$lang('hearth_sleep_clock_size')}>
					<SelectField
						inline
						label={$lang('hearth_sleep_clock_size')}
						value={clockSize}
						options={CLOCK_SIZE_OPTIONS}
						onchange={setClockSize}
					/>
				</SettingsRow>
				<SettingsRow label={$lang('hearth_sleep_show_date')}>
					<Switch
						checked={showDate}
						label={$lang('hearth_sleep_show_date')}
						onchange={setShowDate}
					/>
				</SettingsRow>
				<SettingsRow
					label={$lang('hearth_screensaver_drift')}
					sub={$lang('hearth_slowly_moves_the_clock_to_protect')}
				>
					<Switch
						checked={screensaverDrift}
						label={$lang('hearth_screensaver_drift')}
						onchange={setScreensaverDrift}
					/>
				</SettingsRow>
				<SettingsRow label={$lang('hearth_screensaver_brightness')}>
					<SelectField
						inline
						label={$lang('hearth_screensaver_brightness')}
						value={screensaverBrightness}
						options={SCREENSAVER_BRIGHTNESS_OPTIONS}
						onchange={setScreensaverBrightness}
					/>
				</SettingsRow>
				<SettingsRow label={$lang('hearth_sleep_background')}>
					<SelectField
						inline
						label={$lang('hearth_sleep_background')}
						value={background}
						options={BACKGROUND_OPTIONS}
						onchange={setBackground}
					/>
				</SettingsRow>
				{#if background === 'radar'}
					<SettingsRow label={$lang('hearth_sleep_radar_map_style')}>
						<SelectField
							inline
							label={$lang('hearth_sleep_radar_map_style')}
							value={radar.basemap ?? 'dark'}
							options={BASEMAP_OPTIONS}
							onchange={(value) => setRadar({ basemap: value === 'light' ? 'light' : 'dark' })}
						/>
					</SettingsRow>
					<SettingsRow
						label={$lang('hearth_sleep_radar_zoom')}
						sub={$lang('hearth_sleep_radar_zoom_sub')}
					>
						<SelectField
							inline
							label={$lang('hearth_sleep_radar_zoom')}
							value={String(radar.zoom ?? RADAR_ZOOM.fallback)}
							options={ZOOM_OPTIONS}
							onchange={(value) => setRadar({ zoom: integerFromInput(value) })}
						/>
					</SettingsRow>
					{#if homeKnown}
						<SettingsRow
							label={$lang('hearth_sleep_use_home_location')}
							sub={$lang('hearth_sleep_use_home_location_sub')}
						>
							<Switch
								checked={useHomeLocation}
								label={$lang('hearth_sleep_use_home_location')}
								onchange={setUseHomeLocation}
							/>
						</SettingsRow>
					{/if}
					{#if !homeKnown || !useHomeLocation}
						{#each COORDINATES as { axis, label, limit } (axis)}
							<SettingsRow
								{label}
								sub={coordinateInvalid[axis]
									? fill($lang('hearth_sleep_coordinate_invalid'), { limit })
									: undefined}
							>
								<span class="unit-input">
									<span class="stepper field-frame">
										<input
											class="coordinate"
											type="number"
											step="any"
											min={-limit}
											max={limit}
											aria-label={label}
											aria-invalid={coordinateInvalid[axis] || undefined}
											value={radar[axis]}
											onchange={(event) => setCoordinate(axis, limit, event.currentTarget.value)}
										/>
									</span>
								</span>
							</SettingsRow>
						{/each}
					{/if}
				{/if}
				<div class="row-fields">
					{#if background === 'radar'}
						<TextField
							label={$lang('hearth_sleep_tile_url')}
							value={radar.tile_url ?? ''}
							placeholder={OSM_TILES}
							hint={$lang('hearth_sleep_tile_url_hint')}
							error={tileUrlInvalid ? $lang('hearth_sleep_tile_url_invalid') : undefined}
							onchange={setTileUrl}
						/>
						{#if radar.tile_url}
							<TextField
								label={$lang('hearth_sleep_tile_attribution')}
								value={radar.attribution ?? ''}
								onchange={(value) => setRadar({ attribution: value.trim() || undefined })}
							/>
						{/if}
					{/if}
					{#if background === 'image'}
						<ImageField
							label={$lang('hearth_background_image')}
							value={backgroundImage}
							onchange={setBackgroundImage}
						/>
					{/if}
					<EntityField
						label={$lang('hearth_sleep_weather_entity')}
						hint={$lang('hearth_sleep_weather_entity_hint')}
						domains={['weather']}
						value={weatherEntity}
						onchange={setWeatherEntity}
					/>
				</div>
			</div>
		</section>

		<section>
			<div class="section-title">{$lang('hearth_display_2')}</div>
			<div class="rows">
				<SettingsRow
					label={$lang('hearth_keep_screen_awake')}
					sub={$lang('hearth_while_the_dashboard_is_open')}
				>
					<Switch
						checked={keepScreenOn}
						label={$lang('hearth_keep_screen_awake')}
						onchange={setKeepScreenOn}
					/>
				</SettingsRow>
				{#if keepScreenOn && ($wakeLockState === 'unsupported' || $wakeLockState === 'denied')}
					<div class="setting-warning" role="alert">
						<Icon name="warning" size={ICON.control} />
						<span>
							{#if $wakeLockState === 'unsupported'}
								{$lang('hearth_screen_wake_lock_is_unavailable_open')}
							{:else}
								{$lang('hearth_the_browser_denied_the_screen_wake')}
							{/if}
						</span>
					</div>
				{/if}
				<SettingsRow
					label={$lang('hearth_scroll_edge_blur')}
					sub={$lang('hearth_blurs_content_where_a_list_runs_off')}
				>
					<Switch
						checked={scrollEdgeBlur}
						label={$lang('hearth_scroll_edge_blur')}
						onchange={setScrollEdgeBlur}
					/>
				</SettingsRow>
				<SettingsRow
					label={$lang('hearth_sidebar')}
					sub={$lang(
						railPosition === 'none'
							? 'hearth_sidebar_widgets_hidden_but_kept'
							: 'hearth_where_widgets_sit_on_wide_screens'
					)}
				>
					<SelectField
						inline
						label={$lang('hearth_sidebar')}
						value={railPosition}
						options={RAIL_POSITION_OPTIONS}
						onchange={setRailPosition}
					/>
				</SettingsRow>
				<SettingsRow
					label={$lang('hearth_swipe_between_pages_on_phones')}
					sub={$lang('hearth_swipe_sideways_over_the_page')}
				>
					<Switch
						checked={swipeMobile}
						label={$lang('hearth_swipe_between_pages_on_phones')}
						onchange={(enabled) => setSwipe('swipe_navigation_mobile', enabled)}
					/>
				</SettingsRow>
				<SettingsRow
					label={$lang('hearth_swipe_between_pages_on_wide_screens')}
					sub={$lang('hearth_drag_sideways_over_the_page')}
				>
					<Switch
						checked={swipeDesktop}
						label={$lang('hearth_swipe_between_pages_on_wide_screens')}
						onchange={(enabled) => setSwipe('swipe_navigation_desktop', enabled)}
					/>
				</SettingsRow>
				<SettingsRow
					label={$lang('hearth_side_padding')}
					sub={$lang('hearth_for_screens_whose_frame_covers_the')}
				>
					<span class="unit-input">
						<span class="stepper field-frame">
							<button
								type="button"
								class="step"
								aria-label={$lang('hearth_decrease_side_padding')}
								onclick={() => setPadding('padding_x', String(paddingX - 4))}
							>
								<Icon name="remove" size={ICON.inline} />
							</button>
							<input
								type="number"
								aria-label={$lang('hearth_side_padding')}
								min="0"
								max="300"
								value={paddingX}
								onchange={(event) => setPadding('padding_x', event.currentTarget.value)}
							/>
							<button
								type="button"
								class="step"
								aria-label={$lang('hearth_increase_side_padding')}
								onclick={() => setPadding('padding_x', String(paddingX + 4))}
							>
								<Icon name="add" size={ICON.inline} />
							</button>
						</span>
						<span class="unit">px</span>
					</span>
				</SettingsRow>
				<SettingsRow label={$lang('hearth_top_bottom_padding')}>
					<span class="unit-input">
						<span class="stepper field-frame">
							<button
								type="button"
								class="step"
								aria-label={$lang('hearth_decrease_top_bottom_padding')}
								onclick={() => setPadding('padding_y', String(paddingY - 4))}
							>
								<Icon name="remove" size={ICON.inline} />
							</button>
							<input
								type="number"
								aria-label={$lang('hearth_top_bottom_padding')}
								min="0"
								max="300"
								value={paddingY}
								onchange={(event) => setPadding('padding_y', event.currentTarget.value)}
							/>
							<button
								type="button"
								class="step"
								aria-label={$lang('hearth_increase_top_bottom_padding')}
								onclick={() => setPadding('padding_y', String(paddingY + 4))}
							>
								<Icon name="add" size={ICON.inline} />
							</button>
						</span>
						<span class="unit">px</span>
					</span>
				</SettingsRow>
			</div>
		</section>

		<section>
			<div class="section-title">{$lang('hearth_alerts')}</div>
			<div class="rows">
				{#each $hearthConfig.alerts ?? [] as rule, index (rule.id)}
					<SettingsRow
						icon={rule.icon || 'notifications_active'}
						label={rule.title}
						sub={rule.message}
						onclick={() => editor.set({ kind: 'alert', index })}
					/>
				{/each}
				<SettingsRow
					icon="add"
					label={$lang('hearth_add_alert')}
					sub={$lang('hearth_alerts_sub')}
					onclick={() => editor.set({ kind: 'alert', index: null })}
				/>
			</div>
		</section>

		<section>
			<div class="section-title">{$lang('hearth_advanced')}</div>
			<div class="rows">
				<SettingsRow
					icon="auto_awesome"
					label={$lang('hearth_setup')}
					sub={$lang('hearth_setup_row_sub')}
					onclick={() => setupWizardOpen.set(true)}
				/>
				<SettingsRow
					icon="settings_applications"
					label={$lang('hearth_application_settings')}
					sub={$lang('hearth_language_motion_add_ons_version_and')}
					onclick={() => editor.set({ kind: 'appSettings' })}
				/>
				<SettingsRow
					icon="code"
					label={$lang('hearth_edit_configuration_yaml')}
					sub={$lang('hearth_edits_the_whole_configuration_as_yaml')}
					onclick={() => editor.set({ kind: 'code', from: { kind: 'settings' } })}
				/>
				<SettingsRow
					icon="history"
					label={$lang('hearth_versions')}
					sub={$lang('hearth_versions_row_sub')}
					onclick={() => editor.set({ kind: 'versions', from: { kind: 'settings' } })}
				/>
			</div>
		</section>
	</div>
</EditSheet>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 560px;
		margin: 0 auto;
		width: 100%;
	}

	.section-title {
		font-family: var(--h-font-mono);
		font-size: var(--h-type-label);
		letter-spacing: 2px;
		text-transform: uppercase;
		color: var(--h-label);
		margin: 0 0 8px;
	}

	.rows {
		border-radius: var(--h-radius-sm);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.08 * var(--h-line-scale)));
		background: var(--h-track);
		overflow: hidden;
	}

	.row-fields {
		padding: 14px 16px 2px;
		border-top: 1px solid rgb(var(--h-line-rgb) / calc(0.06 * var(--h-line-scale)));
	}

	.unit-input input.coordinate {
		width: 112px;
		padding: 8px 12px;
	}

	.unit-input {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: none;
	}

	.unit {
		font-size: var(--h-type-secondary);
		color: var(--h-text-6);
	}

	/* minus, value, plus in one bordered group; the native spinner is hidden */
	.stepper {
		display: flex;
		align-items: center;
		border-radius: var(--h-radius-xs);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.1 * var(--h-line-scale)));
		background: rgb(var(--h-surface-rgb) / calc(0.06 * var(--h-fill-scale)));
	}

	.stepper:focus-within {
		border-color: rgb(var(--h-accent-rgb) / calc(0.4 * var(--h-accent-scale)));
	}

	.step {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: 0;
		background: none;
		color: var(--h-icon);
		cursor: pointer;
	}

	@media (hover: hover) {
		.step:hover {
			color: var(--h-accent-text);
		}
	}

	.unit-input input {
		width: 48px;
		text-align: center;
		padding: 8px 0;
		border: 0;
		background: none;
		color: var(--h-text-2);
		font-family: inherit;
		font-size: var(--h-type-body);
		outline: none;
	}

	/* the native spinner paints white over the dark field and eats the padding */
	.unit-input input[type='number'] {
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.unit-input input::-webkit-outer-spin-button,
	.unit-input input::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.setting-warning {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid rgb(var(--h-bad-rgb) / calc(0.22 * var(--h-accent-scale)));
		background: rgb(var(--h-bad-rgb) / calc(0.06 * var(--h-accent-scale)));
		color: var(--h-bad-text);
		font-size: var(--h-type-small);
		line-height: 1.4;
	}
</style>
