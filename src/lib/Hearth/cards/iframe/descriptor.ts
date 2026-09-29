import type { CardDescriptor } from '../types';
import Card from './Card.svelte';
import { iframeCard as definition, type IframeCard } from '../../model/cards/iframe';
export type { IframeCard } from '../../model/cards/iframe';

export const iframeCard: CardDescriptor<IframeCard> = {
	...definition,
	component: Card,
	editor: () => import('./Editor.svelte')
};
