<script lang="ts">
	import type { FullAutoFill } from 'svelte/elements';

	import FieldMessages, { describedBy } from './FieldMessages.svelte';

	const uid = $props.id();

	let {
		label,
		value = $bindable(''),
		placeholder = '',
		type = 'text',
		autocomplete = undefined,
		autofocus = false,
		hint = undefined,
		error = undefined,
		onchange = undefined
	}: {
		label: string;
		value?: string;
		placeholder?: string;
		type?: 'text' | 'password';
		autocomplete?: FullAutoFill;
		/** Ask the surrounding sheet to focus this field when it opens. */
		autofocus?: boolean;
		hint?: string;
		/** Shown in place of nothing when the value is not acceptable; marks the input invalid. */
		error?: string | null;
		/** Fires on the input's own change event - blur or Enter, not per keystroke. */
		onchange?: (value: string) => void;
	} = $props();
</script>

<div class="field">
	<label>
		<span class="field-label">{label}</span>
		<input
			{type}
			{autocomplete}
			data-autofocus={autofocus || undefined}
			bind:value
			{placeholder}
			spellcheck="false"
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy(uid, hint, error)}
			onchange={() => onchange?.(value)}
		/>
	</label>
	<FieldMessages id={uid} {hint} {error} />
</div>

<style>
	.field {
		display: block;
		margin-bottom: 14px;
	}

	label {
		display: block;
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

	input {
		width: 100%;
		padding: 12px 14px;
		border-radius: var(--h-radius-xs);
		border: 1px solid rgb(var(--h-line-rgb) / calc(0.1 * var(--h-line-scale)));
		background: var(--h-track);
		color: var(--h-text-2);
		font-family: inherit;
		font-size: var(--h-type-body);
		outline: none;
	}

	input:focus {
		border-color: rgb(var(--h-accent-rgb) / calc(0.4 * var(--h-accent-scale)));
	}

	input::placeholder {
		color: var(--h-text-6);
	}

	/* iOS Safari zooms the page into any input set under 16px */
	@media (pointer: coarse) {
		input {
			font-size: max(16px, var(--h-type-body)); /* literal ok: the iOS no-zoom floor */
		}
	}
</style>
