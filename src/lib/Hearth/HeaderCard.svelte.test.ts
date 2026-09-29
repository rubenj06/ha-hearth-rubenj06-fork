import { act, fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelEdit, enterEditMode, hearthEditMode } from './store';
import HeaderCard from './HeaderCard.svelte';

describe('HeaderCard', () => {
	afterEach(() => {
		if (get(hearthEditMode)) cancelEdit();
	});

	it('is a control only while editing with something to edit', async () => {
		const onedit = vi.fn();
		const { container } = render(HeaderCard, { title: 'Kitchen', onedit });
		expect(screen.queryByRole('button')).toBeNull();
		expect(container.querySelector('[tabindex]')).toBeNull();

		await act(() => enterEditMode());
		await fireEvent.click(screen.getByRole('button'));
		expect(onedit).toHaveBeenCalledTimes(1);
	});

	it('draws an uploaded background image as a banner', () => {
		const file = `${'a'.repeat(32)}.webp`;
		const { container } = render(HeaderCard, {
			title: 'Kitchen',
			backgroundImage: `hearth-images/${file}`
		});
		expect(container.querySelector('.header.banner')).not.toBeNull();
		expect(container.querySelector('img.backdrop')?.getAttribute('src')).toBe(
			`${location.origin}/_api/hearth_images/${file}`
		);
	});

	it('drops the banner when the image fails to load', async () => {
		const { container } = render(HeaderCard, {
			title: 'Kitchen',
			backgroundImage: 'https://example.com/missing.jpg'
		});
		await fireEvent.error(container.querySelector('img.backdrop')!);
		expect(container.querySelector('.banner')).toBeNull();
		expect(container.querySelector('img.backdrop')).toBeNull();
	});

	it('stays plain content in edit mode without an edit handler', async () => {
		render(HeaderCard, { title: 'Kitchen' });
		await act(() => enterEditMode());
		expect(screen.queryByRole('button')).toBeNull();
	});
});
