<script lang="ts">
	import {
		editor,
		hearthConfig,
		hearthEditMode,
		redoConfig,
		saveWithFeedback,
		undoConfig
	} from '../store';
	import { states } from '$lib/core/ha/entities';
	import { layerDepth } from '$lib/ui/layers';
	import { FOLD_QUERY } from '../breakpoints';
	import { railPositionOf } from '../config';
	import { searchAvailable } from '../visibility';

	/** Global shortcuts: f for search, cmd/ctrl+s and cmd/ctrl+z while editing. */
	let { onsearch }: { onsearch: () => void } = $props();

	// whether a search widget hidden on mobile counts as gone; with no rail
	// there is nothing to fold, so any search widget keeps search available
	function mobileHidingApplies(): boolean {
		if (railPositionOf($hearthConfig) === 'none') return false;
		return window.matchMedia?.(FOLD_QUERY).matches ?? false;
	}

	function handleKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);

		if (
			!typing &&
			!$hearthEditMode &&
			!$layerDepth &&
			event.key === 'f' &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			searchAvailable($hearthConfig.rail, $states, mobileHidingApplies())
		) {
			event.preventDefault();
			onsearch();
			return;
		}

		if (!$hearthEditMode || !(event.metaKey || event.ctrlKey)) return;
		// an open edit sheet owns these: saving would drop its unsubmitted form and
		// undo would shift the card it is bound to out from under it. A sheet that
		// commits on Mod-s handles it before it gets here; otherwise the key still
		// must not fall through to the browser's own save dialog.
		if ($editor) {
			if (event.key === 's') event.preventDefault();
			return;
		}
		if (event.key === 's') {
			event.preventDefault();
			void saveWithFeedback();
		} else if (event.key.toLowerCase() === 'z' && !typing) {
			event.preventDefault();
			if (event.shiftKey) redoConfig();
			else undoConfig();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />
