<script lang="ts">
	import { get } from 'svelte/store';
	import { ICON } from '../iconSizes';
	import { lang, fill } from '$lib/core/i18n';
	import { imageFileOf, imageRef, IMAGE_TYPES, referencedImageFiles } from '$lib/core/images';
	import Ripple from '$lib/ui/actions/ripple';
	import { PRESS_RIPPLE } from '../config';
	import {
		deleteLibraryImage,
		imageSource,
		listLibraryImages,
		uploadImage,
		type LibraryImage
	} from '../images';
	import { hearthConfig, requestConfirmation } from '../store';
	import FieldMessages, { describedBy } from './FieldMessages.svelte';
	import LoadingState from '../LoadingState.svelte';
	import Icon from '../Icon.svelte';

	const uid = $props.id();

	let {
		label,
		value = $bindable(''),
		placeholder = undefined,
		hint = undefined,
		onchange = undefined
	}: {
		label: string;
		/** A URL, or `hearth-images/<file>` for an uploaded image. */
		value?: string;
		placeholder?: string;
		hint?: string;
		/** Fires when a value is committed: typed and left, uploaded, picked or cleared. */
		onchange?: (value: string) => void;
	} = $props();

	let fileInput = $state<HTMLInputElement>();
	let uploading = $state(false);
	let error = $state('');
	let libraryOpen = $state(false);
	let library = $state<LibraryImage[]>([]);
	let libraryLoading = $state(false);
	let previewFailed = $state<string>();

	let source = $derived(imageSource(value));
	let selectedFile = $derived(imageFileOf(value.trim()));

	function commit(next: string) {
		value = next;
		error = '';
		onchange?.(next);
	}

	async function loadLibrary() {
		libraryLoading = true;
		try {
			library = await listLibraryImages();
		} catch (err) {
			console.error(err);
			error = $lang('hearth_image_library_load_failed');
		} finally {
			libraryLoading = false;
		}
	}

	function toggleLibrary() {
		libraryOpen = !libraryOpen;
		if (libraryOpen) void loadLibrary();
	}

	async function upload(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		// cleared so picking the same file again still fires change
		event.currentTarget.value = '';
		if (!file) return;
		uploading = true;
		error = '';
		try {
			commit(await uploadImage(file));
			if (libraryOpen) await loadLibrary();
		} catch (err) {
			console.error(err);
			error = `${$lang('hearth_image_upload_failed')}${err instanceof Error ? `: ${err.message}` : ''}`;
		} finally {
			uploading = false;
		}
	}

	function confirmDelete(image: LibraryImage) {
		const inUse =
			referencedImageFiles(get(hearthConfig)).has(image.file) || image.file === selectedFile;
		requestConfirmation({
			title: $lang('hearth_delete_image_confirm'),
			message: inUse
				? $lang('hearth_delete_image_in_use_message')
				: $lang('hearth_delete_image_message'),
			confirmLabel: $lang('delete'),
			action: () => void remove(image)
		});
	}

	async function remove(image: LibraryImage) {
		error = '';
		try {
			await deleteLibraryImage(image.file);
			library = library.filter((entry) => entry.file !== image.file);
			if (image.file === selectedFile) commit('');
		} catch (err) {
			console.error(err);
			error = $lang('hearth_image_delete_failed');
		}
	}

	function size(bytes: number): string {
		return bytes < 1024 * 1024
			? `${Math.max(1, Math.round(bytes / 1024))} KB`
			: `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div class="field">
	<label class="field-label" for="{uid}-input">{label}</label>
	<div class="input-row">
		<span class="preview">
			{#if source && source !== previewFailed}
				<img src={source} alt="" onerror={() => (previewFailed = source)} />
			{:else}
				<Icon name={source ? 'broken_image' : 'image'} size={ICON.control} />
			{/if}
		</span>
		<input
			id="{uid}-input"
			type="text"
			bind:value
			placeholder={placeholder ?? $lang('hearth_image_url_or_upload')}
			spellcheck="false"
			aria-describedby={describedBy(uid, hint, error)}
			onchange={() => commit(value.trim())}
		/>
		{#if value.trim()}
			<button
				type="button"
				class="action pressable"
				aria-label={$lang('hearth_clear_image')}
				use:Ripple={PRESS_RIPPLE}
				onclick={() => commit('')}
			>
				<Icon name="close" size={ICON.control} />
			</button>
		{/if}
		<button
			type="button"
			class="action pressable"
			aria-label={$lang('hearth_upload_image')}
			disabled={uploading}
			use:Ripple={PRESS_RIPPLE}
			onclick={() => fileInput?.click()}
		>
			<Icon name="upload" size={ICON.control} />
		</button>
		<button
			type="button"
			class="action pressable"
			class:active={libraryOpen}
			aria-label={$lang('hearth_image_library')}
			aria-expanded={libraryOpen}
			use:Ripple={PRESS_RIPPLE}
			onclick={toggleLibrary}
		>
			<Icon name="photo_library" size={ICON.control} />
		</button>
		<input
			bind:this={fileInput}
			class="file"
			type="file"
			accept={Object.values(IMAGE_TYPES).join(',')}
			tabindex="-1"
			aria-hidden="true"
			onchange={upload}
		/>
	</div>

	{#if uploading}
		<LoadingState inline text={$lang('hearth_uploading_image')} />
	{/if}

	{#if libraryOpen}
		<div class="library">
			{#if libraryLoading && !library.length}
				<LoadingState inline text={$lang('hearth_loading_image_library')} />
			{:else if library.length}
				<div class="grid">
					{#each library as image (image.file)}
						<div class="cell" class:selected={image.file === selectedFile}>
							<button
								type="button"
								class="pick pressable"
								aria-label={fill($lang('hearth_use_image'), { size: size(image.size) })}
								aria-pressed={image.file === selectedFile}
								onclick={() => commit(imageRef(image.file))}
							>
								<img src={imageSource(imageRef(image.file))} alt="" loading="lazy" />
							</button>
							<button
								type="button"
								class="remove"
								aria-label={$lang('hearth_delete_image')}
								onclick={() => confirmDelete(image)}
							>
								<Icon name="delete" size={ICON.inline} />
							</button>
						</div>
					{/each}
				</div>
			{:else}
				<div class="empty">{$lang('hearth_no_uploaded_images')}</div>
			{/if}
		</div>
	{/if}

	<FieldMessages id={uid} {hint} {error} />
</div>

<style>
	.field {
		display: block;
		margin-bottom: 14px;
	}

	.field-label {
		display: block;
		font-family: var(--h-font-mono);
		font-size: var(--h-type-label);
		letter-spacing: 2px;
		text-transform: uppercase;
		color: var(--h-label);
		margin-bottom: 6px;
	}

	.input-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 6px;
		border-radius: var(--h-radius-xs);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.1 * var(--h-line-scale)));
		background: var(--h-track);
	}

	.input-row:focus-within {
		border-color: rgb(var(--h-accent-rgb) / calc(0.4 * var(--h-accent-scale)));
	}

	.preview {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		margin-right: 4px;
		border-radius: var(--h-radius-tight);
		overflow: hidden;
		color: var(--h-icon-dim);
	}

	.preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.input-row input[type='text'] {
		flex: 1;
		min-width: 0;
		padding: 12px 0;
		border: none;
		background: none;
		color: var(--h-text-2);
		font-family: inherit;
		font-size: var(--h-type-body);
		outline: none;
	}

	input::placeholder {
		color: var(--h-text-6);
	}

	.file {
		display: none;
	}

	.action {
		display: flex;
		flex: none;
		padding: 6px;
		border: 0;
		border-radius: var(--h-radius-xs);
		background: none;
		color: var(--h-icon);
		cursor: pointer;
	}

	.action.active {
		color: var(--h-text-3);
	}

	@media (hover: hover) {
		.action:hover {
			color: var(--h-text-3);
		}
	}

	.action:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.library {
		margin-top: 8px;
		padding: 10px;
		border-radius: var(--h-radius-xs);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.08 * var(--h-line-scale)));
		background: rgb(var(--h-surface-rgb) / calc(0.04 * var(--h-fill-scale)));
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
		gap: 8px;
		max-height: 240px;
		overflow-y: auto;
	}

	.cell {
		position: relative;
		aspect-ratio: 4 / 3;
		border-radius: var(--h-radius-xs);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.1 * var(--h-line-scale)));
		overflow: hidden;
	}

	.cell.selected {
		border-color: rgb(var(--h-accent-rgb) / calc(0.7 * var(--h-accent-scale)));
		box-shadow: 0 0 0 1px rgb(var(--h-accent-rgb) / calc(0.7 * var(--h-accent-scale)));
	}

	.pick {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		background: var(--h-inset);
		cursor: pointer;
	}

	.pick img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.remove {
		position: absolute;
		top: 4px;
		right: 4px;
		display: grid;
		place-items: center;
		padding: 4px;
		border: 0;
		border-radius: var(--h-radius-pill);
		background: var(--h-overlay);
		color: var(--h-text-2);
		cursor: pointer;
	}

	@media (hover: hover) {
		.remove:hover {
			color: var(--h-bad-text);
		}
	}

	.empty {
		padding: 10px;
		font-size: var(--h-type-small);
		color: var(--h-text-6);
		text-align: center;
	}
</style>
