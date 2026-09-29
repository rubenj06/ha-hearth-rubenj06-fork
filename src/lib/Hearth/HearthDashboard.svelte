<script lang="ts">
	import { onMount } from 'svelte';
	import { lang } from '$lib/core/i18n';
	import { states } from '$lib/core/ha/entities';
	import { THEME_PRESETS, type HearthTheme } from '$lib/core/theme';
	import {
		currentRoom,
		hearthConfig,
		hearthEditMode,
		hearthLoadError,
		hearthNeedsSetup,
		screensaverPreview,
		setupWizardOpen
	} from './store';
	import {
		foldedRail,
		foldedTopCount,
		railPositionOf,
		railSides,
		type RailPosition,
		type RailSide
	} from './config';
	import { conditionsHold, mediaQueriesIn, railWidgetShown } from './visibility';
	import type { AlertHost } from './alertEngine';
	import { openEntityDetail } from './details';
	import { loadMarkdownRenderer } from './markdown';
	import { layer } from '$lib/ui/layers';
	import ControlPopup from './ControlPopup.svelte';
	import EmptyState from './EmptyState.svelte';
	import Rail from './Rail.svelte';
	import RoomDetail from './RoomDetail.svelte';
	import SearchOverlay from './SearchOverlay.svelte';
	import SetupWizard from './SetupWizard.svelte';
	import ConfirmDialog from './shell/ConfirmDialog.svelte';
	import EditBar from './shell/EditBar.svelte';
	import Keyboard from './shell/Keyboard.svelte';
	import PhoneNav from './shell/PhoneNav.svelte';
	import ThemeStyle from './shell/ThemeStyle.svelte';
	import Toasts from './shell/Toasts.svelte';
	import NavWidget from './widgets/nav/Widget.svelte';
	import type { NavWidget as NavWidgetConfig } from './widgets/nav/descriptor';
	import { wakeLock } from './wakeLock';
	import ScrollEdge from '$lib/ui/ScrollEdge.svelte';
	import { scrollEdges, type ScrollEdges } from '$lib/ui/actions/scrollEdges';
	import { mediaQuery } from '$lib/ui/mediaQuery';
	import { FOLD_QUERY, SHORT_QUERY } from './breakpoints';
	import { layerDepth } from '$lib/ui/layers';
	import { neighborRoom, swipeNav, type SwipeDirection } from './swipeNav';

	let showSearch = $state(false);

	// a preview that cannot load must not stay pending, or the next one is a no-op
	function loadScreensaver() {
		return import('./Screensaver.svelte').catch((error) => {
			console.warn('screensaver unavailable', error);
			screensaverPreview.set(false);
			throw error;
		});
	}

	// search belongs to the running dashboard; every way of asking for it
	// (rail widget, page switcher, f key) goes through here
	function openSearch() {
		if (!$hearthEditMode) showSearch = true;
	}

	// the folded layout is a different tree, not a restyled one: the rail
	// splits into the run above the page and the run below it, so which one
	// to build has to be decided in script rather than in a media query
	const narrow = mediaQuery(FOLD_QUERY);

	// a phone held sideways has no height to spend before the page, so nothing
	// rides above it there unless a widget asked for that slot by name
	const shortScreen = mediaQuery(SHORT_QUERY);
	let railPosition = $derived(railPositionOf($hearthConfig));
	let leadingWidgets = $derived(
		foldedTopCount(foldedRail($hearthConfig.rail, railPosition), {
			editing: $hearthEditMode,
			compact: $shortScreen,
			position: railPosition
		})
	);

	// outside the editor, an empty one of two rails gives its column back to
	// the page; the editor keeps it as somewhere to drag widgets into
	let wideLayout = $derived.by((): RailPosition => {
		if (railPosition !== 'both' || $hearthEditMode) return railPosition;
		const { left, right } = railSides($hearthConfig.rail, 'both');
		if (!right.length) return 'left';
		return left.length ? 'both' : 'right';
	});

	// the columns hide their scrollbars, so a blurred edge is the only sign
	// that the list keeps going. Which column scrolls depends on the fold:
	// wide screens scroll the page column, narrow ones scroll the whole layout.
	const NOTHING_CUT: ScrollEdges = { top: false, bottom: false, left: false, right: false };
	let mainCut = $state<ScrollEdges>(NOTHING_CUT);
	let layoutCut = $state<ScrollEdges>(NOTHING_CUT);
	let edgeBlur = $derived($hearthConfig.scroll_edge_blur ?? true);

	// the selected page, or the first one when it was renamed away or deleted
	let activeRoomId = $derived(
		$hearthConfig.rooms.some((room) => room.id === $currentRoom)
			? $currentRoom
			: ($hearthConfig.rooms[0]?.id ?? '')
	);

	let activeRoom = $derived($hearthConfig.rooms.find((room) => room.id === activeRoomId));

	// sideways swipes walk the pages in rail order; each layout has its own
	// setting, since a mouse drag on a wall tablet is a different habit
	let swipeEnabled = $derived(
		($narrow ? $hearthConfig.swipe_navigation_mobile : $hearthConfig.swipe_navigation_desktop) ===
			true &&
			!$hearthEditMode &&
			$layerDepth === 0
	);
	let activeIndex = $derived($hearthConfig.rooms.findIndex((room) => room.id === activeRoomId));

	function swipeTo(direction: SwipeDirection) {
		const roomId = neighborRoom($hearthConfig.rooms, activeRoomId, direction);
		if (roomId) currentRoom.set(roomId);
	}

	// a fill page clips whatever does not fit, which is invisible until you walk
	// to the tablet - so while editing, measure and say by how much
	let mainElement = $state<HTMLElement | undefined>();
	let overflowBy = $state(0);

	$effect(() => {
		if (!mainElement || !$hearthEditMode || !activeRoom?.fill_screen) {
			overflowBy = 0;
			return;
		}
		const element = mainElement;
		// the clipping happens per column, not on <main>, so <main> always looks
		// like it fits - measure the columns and report the worst one
		const measure = () => {
			// a column can overflow, and so can a filling card clipping its own
			// grid - report whichever is worse
			const clipped = [...element.querySelectorAll<HTMLElement>('.column, .card-slot')];
			overflowBy = clipped.reduce(
				(worst, node) => Math.max(worst, node.scrollHeight - node.clientHeight),
				Math.max(0, element.scrollHeight - element.clientHeight)
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		for (const node of element.querySelectorAll('.column, .card-slot')) observer.observe(node);
		return () => observer.disconnect();
	});

	// keep the selection on the page actually being rendered, so the rail
	// highlights it and editor targets resolve against it
	$effect(() => {
		if (activeRoomId && activeRoomId !== $currentRoom) currentRoom.set(activeRoomId);
	});

	// a page opens at its own top: whichever box scrolls, the offset left over
	// from the previous page means nothing on this one
	let layoutElement = $state<HTMLElement | undefined>();
	let scrolledRoom = '';

	$effect(() => {
		if (activeRoomId === scrolledRoom) return;
		scrolledRoom = activeRoomId;
		layoutElement?.scrollTo({ top: 0 });
		mainElement?.scrollTo({ top: 0 });
	});

	/*
	 * Pages stay reachable on every layout. The folded layout, and a wide one
	 * with no rail, always have the page switcher; a wide rail whose nav widget
	 * was removed or is hidden by its visibility conditions gets the same page
	 * list built in, above the rest of the first rail. The nav widget's own
	 * settings shape only the wide rail.
	 */
	const BUILT_IN_NAV: NavWidgetConfig = { id: 'built-in-nav', type: 'nav' };
	// live results for the rail's media conditions, so a resize that hides the
	// nav widget brings the built-in list back like VisibilityGate hides the widget
	let railMedia = $state<Record<string, boolean>>({});
	$effect(() => {
		const queries = new Set($hearthConfig.rail.flatMap((w) => mediaQueriesIn(w.visibility ?? [])));
		const matches: Record<string, boolean> = {};
		const stops = [...queries].map((query) =>
			mediaQuery(query).subscribe((value) => {
				matches[query] = value;
				railMedia = { ...matches };
			})
		);
		return () => stops.forEach((stop) => stop());
	});
	let builtInNavSide = $derived<RailSide>(wideLayout === 'right' ? 'right' : 'left');
	let railHasNav = $derived(
		$hearthEditMode
			? $hearthConfig.rail.some((widget) => widget.type === 'nav')
			: railWidgetShown($hearthConfig.rail, 'nav', $states, {
					narrow: false,
					match: (query) => railMedia[query] ?? false
				})
	);

	// display-only theme override via ?theme=<preset id>: the matched preset
	// entry (theme null = default look) replaces the stored theme without
	// touching the config or undo history. It would mask theme edits, so it
	// steps aside while editing and returns when editing ends.
	let urlPreset = $state<{ theme: HearthTheme | null } | undefined>(undefined);
	let presetOverride = $derived($hearthEditMode ? undefined : urlPreset);

	// ?menu=false hides the edit-toggle pencil for kiosk frames; edit mode
	// stays reachable if already active, it just can't be entered from here
	let hideEditToggle = $state(false);

	/*
	 * The page on screen is kept in ?room= so a reload or a shared link lands
	 * on it. Replaced, never pushed: back closes overlays, it does not walk
	 * through pages. Other parameters and the hash are kept as they are. It
	 * also runs on popstate, since back from an overlay lands on the entry the
	 * overlay opened over, whose address can predate a page change since.
	 */
	let roomParamRead = $state(false);

	function syncRoomParam() {
		if (!roomParamRead || !activeRoomId) return;
		const url = new URL(location.href);
		if (url.searchParams.get('room') === activeRoomId) return;
		url.searchParams.set('room', activeRoomId);
		history.replaceState(history.state, '', url.pathname + url.search + url.hash);
	}

	$effect(syncRoomParam);

	onMount(() => {
		const params = new URLSearchParams(location.search);
		if ($hearthNeedsSetup && !$hearthLoadError) setupWizardOpen.set(true);

		const presetId = params.get('theme');
		urlPreset = THEME_PRESETS.find((preset) => preset.id === presetId);

		const roomId = params.get('room');
		if (roomId && $hearthConfig.rooms.some((room) => room.id === roomId)) {
			currentRoom.set(roomId);
		}

		hideEditToggle = params.get('menu') === 'false';
		roomParamRead = true;
	});

	// see AlertHost in alertEngine.ts for why these are handed over
	const alertHost: AlertHost = {
		openDetail: openEntityDetail,
		holds: conditionsHold,
		layer,
		loadMarkdown: loadMarkdownRenderer
	};

	// search only opens outside edit mode (see openSearch); should edit mode
	// start while it is open anyway, it closes rather than staying stranded
	// above the edit bar
	$effect(() => {
		if ($hearthEditMode) showSearch = false;
	});
</script>

<svelte:window onpopstate={syncRoomParam} />
<Keyboard onsearch={openSearch} />
<ThemeStyle {presetOverride} />

{#snippet pageColumn()}
	<div class="main-wrap">
		<main
			class="main"
			class:fill={activeRoom?.fill_screen}
			bind:this={mainElement}
			use:scrollEdges={{ report: (edges) => (mainCut = edges) }}
			use:swipeNav={{
				enabled: swipeEnabled,
				hasPrevious: activeIndex > 0,
				hasNext: activeIndex >= 0 && activeIndex < $hearthConfig.rooms.length - 1,
				onswipe: swipeTo
			}}
		>
			{#if $hearthNeedsSetup && !$hearthLoadError && !$hearthEditMode && !$setupWizardOpen}
				<div class="setup-prompt">
					<EmptyState
						icon="auto_awesome"
						text={$lang('hearth_setup_prompt')}
						hint={$lang('hearth_setup_prompt_hint')}
						action={{ label: $lang('hearth_setup'), onclick: () => setupWizardOpen.set(true) }}
					/>
				</div>
			{/if}
			<RoomDetail roomId={activeRoomId} fillScreen={activeRoom?.fill_screen ?? false} />
		</main>
		{#if edgeBlur}
			<ScrollEdge edge="top" size={96} active={mainCut.top} />
			<ScrollEdge edge="bottom" size={96} active={mainCut.bottom} />
		{/if}
	</div>
{/snippet}

{#snippet railColumn(side: RailSide)}
	<div class="rail-scroll">
		{#if !railHasNav && side === builtInNavSide}
			<NavWidget widget={BUILT_IN_NAV} />
		{/if}
		<!-- a single rail holds every widget, whatever side it was given -->
		<Rail side={wideLayout === 'both' ? side : undefined} onsearch={openSearch} />
	</div>
{/snippet}

<section class="frame" use:wakeLock={$hearthConfig.keep_screen_on ?? true}>
	<div
		class="layout"
		class:editing={$hearthEditMode}
		class:narrow={$narrow}
		data-rail={wideLayout}
		bind:this={layoutElement}
		use:scrollEdges={{ report: (edges) => (layoutCut = edges) }}
	>
		<PhoneNav onsearch={openSearch} always={railPosition === 'none'} />
		{#if $narrow}
			{#if leadingWidgets > 0}
				<div class="rail-run">
					<Rail mobileSlot="top" compact={$shortScreen} onsearch={openSearch} />
				</div>
			{/if}
			{@render pageColumn()}
			<!-- kept without a rail too: its padding is the room under the page -->
			<div class="rail-run trailing">
				{#if railPosition !== 'none'}
					<Rail mobileSlot="bottom" compact={$shortScreen} onsearch={openSearch} />
				{/if}
			</div>
		{:else}
			{#if wideLayout === 'left' || wideLayout === 'both'}
				{@render railColumn('left')}
			{/if}
			{@render pageColumn()}
			{#if wideLayout === 'right' || wideLayout === 'both'}
				{@render railColumn('right')}
			{/if}
		{/if}
	</div>
	{#if edgeBlur}
		<ScrollEdge edge="top" size={96} active={layoutCut.top} />
		<ScrollEdge edge="bottom" size={96} active={layoutCut.bottom} />
	{/if}
	<ControlPopup />
	{#if $hearthEditMode}
		<!-- the edit sheets and their editors load with edit mode, not the dashboard -->
		{#await import('./edit/EditorHost.svelte') then EditorHost}
			<EditorHost.default />
		{:catch}
			<div class="edit-load-error" role="alert">
				{$lang('hearth_could_not_load_component')}
				<button type="button" onclick={() => hearthEditMode.set(false)}>
					{$lang('hearth_exit_edit_mode')}
				</button>
			</div>
		{/await}
	{/if}
	{#if showSearch}
		<SearchOverlay onclose={() => (showSearch = false)} />
	{/if}
	{#if ($hearthConfig.screensaver_minutes ?? 0) > 0 || $screensaverPreview}
		<!-- loads once armed; the dashboard never waits on it -->
		{#await loadScreensaver() then Screensaver}
			<Screensaver.default minutes={$hearthConfig.screensaver_minutes} />
		{:catch}
			<!-- offline or a stale deploy: no screensaver, tried again on the next mount -->
		{/await}
	{/if}
	{#if $setupWizardOpen}
		<SetupWizard firstRun={$hearthNeedsSetup} onclose={() => setupWizardOpen.set(false)} />
	{/if}
	<!-- alerts are not needed to draw the first frame; the layer loads after it -->
	{#await import('./AlertLayer.svelte') then AlertLayer}
		<AlertLayer.default host={alertHost} />
	{/await}
	<ConfirmDialog />
	<Toasts {overflowBy} />
	<EditBar {hideEditToggle} />
</section>

<style>
	.setup-prompt {
		margin-bottom: 16px;
	}

	/* command sent, waiting for the entity to confirm */
	.frame :global(.pending) {
		animation: hearth-pending 1.1s ease-in-out infinite; /* literal ok: pulse period, not a transition */
	}

	/* reduced motion keeps a still cue in place of the pulse */
	:global(html[data-motion='off']) .frame :global(.pending) {
		animation: none;
		opacity: 0.7;
	}

	/* Theme changes animate only the composited dashboard backdrop. Descendant
	   tokens switch atomically instead of forcing a four-property repaint of
	   every node in the tree. */
	:global(html.theme-fade) .frame {
		transition:
			background-color var(--h-motion-theme) ease,
			color var(--h-motion-theme) ease;
	}

	/* scroll containers clip on both axes, which would crop the tiles' glow -
	   the padding/negative-margin pair moves the clip edge outward. The offset
	   matches the column gap so the widest glow (30px blur) fades out before
	   the clip edge without either box painting into its neighbour's content. */
	.rail-scroll {
		/* a grid item's min-content would widen the single narrow-screen track
		   past the viewport; let the rail shrink and its widgets wrap instead */
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: none;
		display: flex;
		flex-direction: column;
		padding: 32px;
		margin: -32px;
		/* room for the floating edit toggle over the rail's foot */
		padding-bottom: 80px; /* literal ok: toggle height plus margin */
	}

	/* Filling cards absorb leftover height, but unexpected runtime overflow
	   remains scrollable instead of making controls unreachable. */
	.main.fill {
		overflow-y: auto;
	}

	.frame :global(.pressable:active) {
		transform: scale(0.96);
		filter: drop-shadow(0 0 9px rgb(var(--h-accent-rgb) / calc(0.45 * var(--h-accent-scale))));
		transition:
			transform var(--h-motion-fast) ease,
			filter var(--h-motion-fast) ease;
	}

	/* the glow stays as press feedback; only the scale moves */
	:global(html[data-motion='off']) .frame :global(.pressable:active) {
		transform: none;
	}

	@keyframes -global-hearth-pending {
		0%,
		100% {
			filter: drop-shadow(0 0 0 rgb(var(--h-accent-rgb) / calc(0 * var(--h-accent-scale))));
			opacity: 1;
		}
		50% {
			filter: drop-shadow(0 0 10px rgb(var(--h-accent-rgb) / calc(0.55 * var(--h-accent-scale))));
			opacity: 0.88;
		}
	}

	.frame {
		/* theme tokens are injected on:root via svelte:head (see rootCss) so
		   portaled modals resolve them too */
		width: 100%;
		height: 100vh;
		height: 100dvh;
		position: relative;
		overflow: hidden;
		background:
			var(--h-bg-scrim), var(--h-bg-image),
			radial-gradient(1000px 700px at 14% -5%, var(--h-bg-0), var(--h-bg-1) 62%);
		background-size: cover;
		background-position: center;
		color: var(--h-text-1);
		font-family: var(--h-font-ui);
		/* inherited, so one declaration covers every string under the frame */
		text-shadow: var(--h-text-shadow);
	}

	.layout {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 32px;
		/* a phone held sideways can be wider than the fold (see breakpoints.ts),
		   so the wide layout keeps clear of a landscape notch too */
		padding: calc(40px + var(--h-pad-y) + env(safe-area-inset-top))
			calc(40px + var(--h-pad-x) + env(safe-area-inset-right))
			calc(40px + var(--h-pad-y) + env(safe-area-inset-bottom))
			calc(40px + var(--h-pad-x) + env(safe-area-inset-left));
		height: 100%;
	}

	.layout[data-rail='right'] {
		grid-template-columns: 1fr 300px;
	}

	.layout[data-rail='both'] {
		grid-template-columns: 300px 1fr 300px;
	}

	/* no rail: the page switcher sits over the page instead */
	.layout[data-rail='none'] {
		grid-template-columns: 1fr;
		grid-template-rows: auto minmax(0, 1fr);
	}

	.rail-scroll::-webkit-scrollbar {
		display: none;
	}

	/* the bleed moves to the wrapper so the edge band can pin to the same box
	   the scroll container clips at; border-box makes the two coincide */
	.main-wrap {
		position: relative;
		min-width: 0;
		min-height: 0;
		margin: -32px;
	}

	/* the page slides sideways during a swipe; past the column it would pass
	   over the rail. The box matches the one .main already clips at. */
	.layout:not(.narrow) .main-wrap {
		overflow: clip;
	}

	.main {
		height: 100%;
		overflow-y: auto;
		scrollbar-width: none;
		padding: 32px;
	}

	/* with no rail the floating edit toggle sits over the foot of the page */
	.layout:not(.narrow)[data-rail='none'] .main {
		padding-bottom: 80px; /* literal ok: toggle height plus margin */
	}

	.main::-webkit-scrollbar {
		display: none;
	}

	/* one ring for every keyboard-focused control; components never reset it */
	.frame :global(:focus-visible) {
		outline: var(--h-focus-ring);
		outline-offset: 2px;
	}

	/*
	 * A text field drawn as a framed row (search box, stepper, icon filter) is
	 * the frame, not the bare input inside it: a ring around the input traces a
	 * square box within a rounded one. The ring moves out to the frame, which
	 * is what the field looks like. Buttons sharing the row keep their own.
	 */
	.frame :global(.field-frame:has(:is(input, textarea):focus-visible)) {
		outline: var(--h-focus-ring);
		outline-offset: 2px;
	}

	.frame :global(.field-frame :is(input, textarea):focus-visible) {
		outline: none;
	}

	/*
	 * Folded layout (see breakpoints.ts). The rail leaves its column and
	 * becomes two runs in the page flow, so this is a different tree, not a
	 * restyled one - the class comes from the same query in script.
	 */
	.layout.narrow {
		display: flex;
		flex-direction: column;
		/* the same shape as the wide layout's padding: a base the user's own
		   padding adds to, plus the device's safe area, which a landscape notch
		   makes a horizontal concern too. Published so the page switcher can
		   bleed back out to the screen edge. */
		--h-fold-pad-left: calc(16px + var(--h-pad-x) + env(safe-area-inset-left));
		--h-fold-pad-right: calc(16px + var(--h-pad-x) + env(safe-area-inset-right));
		/* no padding above: the page switcher pins to the very top of this
		   scroller and carries the top inset itself, so nothing can scroll
		   through the strip of screen above it */
		padding: 0 var(--h-fold-pad-right) calc(16px + var(--h-pad-y) + env(safe-area-inset-bottom))
			var(--h-fold-pad-left);
		gap: 24px;
		overflow-y: auto;
		/* a dashboard never scrolls sideways: a tile glow or a widened hit area
		   reaching past the glass is a few stray pixels, not a second axis */
		overflow-x: hidden;
		/* the page switcher is sticky over this box; anything scrolled to would
		   otherwise land underneath it */
		scroll-padding-top: calc(
			72px + env(safe-area-inset-top)
		); /* literal ok: page switcher height plus margin */
		/* inside the Home Assistant app this scroller sits in a webview that
		   scrolls too - keep the rubber band here */
		overscroll-behavior-y: contain;
	}

	/* the edit bar floats over the scroll container; leave room under the
	   last widget so nothing hides behind it */
	.layout.narrow.editing {
		padding-bottom: calc(
			var(--h-edit-bar-height, 60px) + 52px + var(--h-pad-y) + env(safe-area-inset-bottom)
		); /* literal ok: margin around the measured edit bar */
	}

	/* the glow bleed shrinks to the layout's own padding so the columns end
	   at the viewport edge instead of 8px past it */
	.layout.narrow .main-wrap,
	.layout.narrow .main {
		overflow-y: visible;
		min-height: auto;
		height: auto;
		padding: 0;
		margin: 0;
	}

	.layout.narrow .main.fill {
		overflow-y: visible;
	}

	.rail-run {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	/* room for the floating edit toggle over the foot of the page */
	.rail-run.trailing {
		padding-bottom: 80px; /* literal ok: toggle height plus margin */
	}
</style>
