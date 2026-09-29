import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { states } from '$lib/core/ha/entities';
import { hassEntity } from '$lib/core/ha/testing';
import EntityGrid from './EntityGrid.svelte';

function grid(columns?: number) {
	states.set({ 'switch.fan': hassEntity('switch.fan', 'on') });
	const { container } = render(EntityGrid, { entities: [{ entity: 'switch.fan' }], columns });
	return container.querySelector<HTMLElement>('.grid')!;
}

describe('EntityGrid', () => {
	it('hands an explicit column count to the stylesheet, capped at two for the folded layout', () => {
		const element = grid(4);
		expect(element.classList.contains('fixed')).toBe(true);
		expect(element.style.getPropertyValue('--columns')).toBe('4');
		expect(element.style.getPropertyValue('--folded-columns')).toBe('2');
		// inline tracks would beat the folded and editing rules in the stylesheet
		expect(element.style.gridTemplateColumns).toBe('');
	});

	it('keeps a count below the cap on phones too', () => {
		expect(grid(1).style.getPropertyValue('--folded-columns')).toBe('1');
	});

	it('leaves the track count to auto-fill without a column count', () => {
		const element = grid();
		expect(element.classList.contains('fixed')).toBe(false);
		expect(element.style.getPropertyValue('--columns')).toBe('');
		expect(element.style.getPropertyValue('--folded-columns')).toBe('');
	});
});
