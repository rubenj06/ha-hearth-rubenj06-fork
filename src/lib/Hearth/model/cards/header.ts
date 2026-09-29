import * as v from 'valibot';
import type { OverviewCard } from '../../types';
import { trimmedOrUndefined } from '../../normalizers';
import type { CardDefinition } from '../types';
import { OptionalText, OptionalEntityId } from '../../schema';

export type HeaderCard = Extract<OverviewCard, { type: 'header' }>;

export const headerCard: CardDefinition<HeaderCard> = {
	type: 'header',
	label: 'hearth_card_header_label',
	name: 'hearth_card_header_name',
	sub: 'hearth_card_header_sub',
	icon: 'view_agenda',
	normalize: (card) => ({
		title: trimmedOrUndefined(card.title),
		subtitle: trimmedOrUndefined(card.subtitle),
		icon: trimmedOrUndefined(card.icon),
		temp_entity: trimmedOrUndefined(card.temp_entity),
		humidity_entity: trimmedOrUndefined(card.humidity_entity),
		background_image: trimmedOrUndefined(card.background_image)
	}),
	schema: v.looseObject({
		title: OptionalText,
		subtitle: OptionalText,
		icon: OptionalText,
		temp_entity: OptionalEntityId,
		humidity_entity: OptionalEntityId,
		background_image: OptionalText
	}),
	needsConfiguration: () => false,
	entityIds: (card) => [
		...(card.temp_entity ? [card.temp_entity] : []),
		...(card.humidity_entity ? [card.humidity_entity] : [])
	]
};
