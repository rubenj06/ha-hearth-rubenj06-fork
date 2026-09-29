<script lang="ts">
	import { onMount } from 'svelte';
	import { connection } from '$lib/core/ha/connection';
	import { states } from '$lib/core/ha/entities';
	import { lang } from '$lib/core/i18n';
	import { hearthEditMode } from './store';

	let {
		entity,
		stream = false,
		controls = false
	}: { entity: string; stream?: boolean; controls?: boolean } = $props();
	let video = $state<HTMLVideoElement>();
	let playing = $state(false);
	let failed = $state(false);
	let attempt = $state(0);
	let refreshed = $state(0);
	const picture = $derived($states?.[entity]?.attributes?.entity_picture as string | undefined);
	const poster = $derived(
		picture ? `${picture}${picture.includes('?') ? '&' : '?'}t=${refreshed}` : undefined
	);
	onMount(() => {
		const timer = setInterval(() => (refreshed = Date.now()), 30_000);
		return () => clearInterval(timer);
	});
	$effect(() => {
		const target = video;
		const conn = $connection;
		const id = entity;
		void attempt;
		playing = false;
		failed = false;
		if (!target || !conn || !stream || $hearthEditMode) return;
		const controller = new AbortController();
		void import('$lib/core/ha/camera')
			.then(({ playCamera }) =>
				playCamera(conn, target, id, controller.signal, () => {
					playing = false;
					failed = true;
				})
			)
			.catch(() => {
				if (!controller.signal.aborted) failed = true;
			});
		return () => controller.abort();
	});
</script>

<!-- video controls scrub sideways; a page swipe must not start here -->
<div class="player" data-no-swipe>
	{#if poster && !playing}<img src={poster} alt="" />{/if}
	<video
		bind:this={video}
		class:playing
		muted
		autoplay
		playsinline
		{controls}
		onplaying={() => (playing = true)}
		onerror={() => {
			playing = false;
			failed = true;
		}}
	></video>
	{#if failed}
		<button type="button" onclick={() => (attempt += 1)}>{$lang('hearth_retry')}</button>
	{:else if !poster && !playing}
		<span>{$lang('hearth_image_unavailable')}</span>
	{/if}
</div>

<style>
	.player {
		position: relative;
		aspect-ratio: 16 / 9;
		background: var(--h-bg-1);
	}
	img,
	video {
		position: absolute;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	video {
		visibility: hidden;
	}
	video.playing {
		visibility: visible;
	}
	button,
	span {
		position: absolute;
		bottom: 12px;
		left: 12px;
		color: var(--h-text-2);
		font: inherit;
		font-size: var(--h-type-body);
	}
	button {
		padding: 8px 12px;
		background: var(--h-sheet-0);
		border: 1px solid var(--h-text-6);
		border-radius: var(--h-radius-xs);
		cursor: pointer;
	}
</style>
