<script lang="ts">
	import { get } from 'svelte/store';
	import { lang } from '$lib/core/i18n';
	import { commandFailure } from '$lib/core/ha/commands';
	import { sortable } from '$lib/ui/actions/sortable';
	import { onDndReceive, type DndReceiveDetail } from './drag';
	import {
		mobileSlotOf,
		railDividerIndex,
		railPositionOf,
		railSides,
		railSlots,
		slugify,
		uniqueId,
		type MobileSlot,
		type RailSide,
		type RailWidget
	} from './config';
	import { editor, hearthConfig, hearthEditMode, updateConfig } from './store';
	import AddControl from './AddControl.svelte';
	import EditChip from './EditChip.svelte';
	import RailWidgetRenderer from './RailWidgetRenderer.svelte';
	import VisibilityGate from './VisibilityGate.svelte';

	/**
	 * The whole rail, one of two wide rails (`side`), or one of the two runs
	 * the folded layout splits it into. Every one shares a drag group, so
	 * moving a widget past the page is how you change its slot or side by hand.
	 */
	let {
		onsearch,
		mobileSlot,
		side,
		compact = false
	}: {
		onsearch: () => void;
		mobileSlot?: Exclude<MobileSlot, 'hidden'>;
		side?: RailSide;
		compact?: boolean;
	} = $props();

	let position = $derived(railPositionOf($hearthConfig));
	// the folded runs read both rails as one list in stored order
	let dividerIndex = $derived(railDividerIndex($hearthConfig.rail, position));
	let indexOfId = $derived(
		new Map($hearthConfig.rail.map((widget, index) => [widget.id, index] as const))
	);

	let widgets = $derived.by(() => {
		if (mobileSlot) {
			return railSlots($hearthConfig.rail, {
				includeHidden: $hearthEditMode,
				compact,
				position
			})[mobileSlot];
		}
		return side ? railSides($hearthConfig.rail, 'both')[side] : $hearthConfig.rail;
	});

	function railIndex(widget: RailWidget): number {
		return indexOfId.get(widget.id) ?? 0;
	}

	function hiddenHere(widget: RailWidget): boolean {
		return !!mobileSlot && mobileSlotOf(widget, railIndex(widget), dividerIndex) === 'hidden';
	}

	/*
	 * Only edit mode moves widgets, so the helpers stay out of the eager
	 * bundle. They start loading as edit mode opens, and a drop that still
	 * beats them - or lands after edit mode closed - changes nothing.
	 */
	const railMoves = () => import('./model/railMoves');

	$effect(() => {
		if ($hearthEditMode) railMoves().catch(() => {});
	});

	async function withRailMoves(apply: (moves: typeof import('./model/railMoves')) => void) {
		let moves: typeof import('./model/railMoves');
		try {
			moves = await railMoves();
		} catch (error) {
			console.error(error);
			commandFailure.set({ entityId: null, detail: get(lang)('hearth_could_not_load_component') });
			return;
		}
		if (get(hearthEditMode)) apply(moves);
	}

	function commit(items: RailWidget[]) {
		return withRailMoves(({ reorderSide, reorderSlot }) => {
			updateConfig((config) => {
				if (mobileSlot) config.rail = reorderSlot(config.rail, mobileSlot, items);
				else config.rail = side ? reorderSide(config.rail, side, items) : items;
			});
		});
	}

	/*
	 * A widget dragged in from the other run or rail. SortableJS reverts the
	 * DOM and leaves the data to us, so the drop is what assigns the slot or
	 * side.
	 */
	function receive(detail: DndReceiveDetail) {
		const copy = detail.alt ?? false;
		return withRailMoves(({ placeInSide, placeInSlot }) => {
			updateConfig((config) => {
				if (mobileSlot) {
					config.rail = placeInSlot(config.rail, detail.id, mobileSlot, detail.newIndex, {
						copy,
						compact,
						position
					});
				} else if (side) {
					config.rail = placeInSide(config.rail, detail.id, side, detail.newIndex, { copy });
				}
			});
		});
	}
</script>

<div
	class="rail"
	class:slotted={mobileSlot !== undefined}
	use:sortable={{
		group: 'hearth-rail',
		handle: '.drag-handle',
		filter: '.add-tile',
		disabled: !$hearthEditMode,
		clone: true,
		cloneItem: (widget: RailWidget) => {
			const cloned = structuredClone(widget);
			cloned.id = uniqueId(
				slugify(widget.type),
				$hearthConfig.rail.map((entry) => entry.id)
			);
			return cloned;
		},
		items: widgets,
		onFinalize: commit
	}}
	use:onDndReceive={receive}
>
	{#each widgets as widget (widget.id)}
		<VisibilityGate conditions={widget.visibility}>
			{#snippet children(visible)}
				{#if $hearthEditMode || visible}
					<div
						class="widget"
						class:spacer={widget.type === 'spacer' && !widget.height}
						class:spacer-visible={widget.type === 'spacer' && $hearthEditMode}
						class:visibility-dimmed={$hearthEditMode && (!visible || hiddenHere(widget))}
						class:in-switcher={(widget.type === 'nav' || widget.type === 'search') &&
							!$hearthEditMode}
						data-id={widget.id}
					>
						{#if $hearthEditMode}
							<EditChip
								onedit={() => editor.set({ kind: 'railWidget', index: railIndex(widget) })}
							/>
						{/if}
						<RailWidgetRenderer {widget} {onsearch} />
					</div>
				{/if}
			{/snippet}
		</VisibilityGate>
	{/each}
	{#if $hearthEditMode && mobileSlot !== 'top'}
		<AddControl
			label={$lang('hearth_add_widget')}
			onadd={() => editor.set({ kind: 'railWidget', index: null, side })}
		/>
	{/if}
</div>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		/* fill the rail-scroll viewport so spacer widgets have space to absorb,
		   but never shrink below content height - overflow scrolls instead */
		flex: 1 0 auto;
	}

	/* a folded run takes its height from its widgets; there is no leftover for
	   a flexible gap to absorb, and growing would push the page off-screen */
	.rail.slotted {
		flex: 0 0 auto;
	}

	.widget {
		position: relative;
	}

	.widget.spacer {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	/* room for the edit chip, even on a thin fixed gap */
	.widget.spacer-visible {
		display: flex;
		flex-direction: column;
		min-height: 40px;
	}

	/* a flexible gap has nothing to absorb in a folded run, and an empty drop
	   target still needs to be grabbable */
	.rail.slotted .widget.spacer {
		flex: 0 0 auto;
	}

	.widget.visibility-dimmed {
		opacity: 0.45;
	}

	/* the folded layout's page switcher already carries the pages and search */
	.rail.slotted .widget.in-switcher {
		display: none;
	}
</style>
