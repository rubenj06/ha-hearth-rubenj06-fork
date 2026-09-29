import * as v from 'valibot';
import type { OverviewCard } from '../../types';
import { normalizeEmbedUrl, trimmedOrUndefined } from '../../normalizers';
import type { CardDefinition } from '../types';
import { OptionalText } from '../../schema';

export type IframeCard = Extract<OverviewCard, { type: 'iframe' }>;

export const iframeCard: CardDefinition<IframeCard> = {
	type: 'iframe',
	label: 'hearth_card_iframe_label',
	name: 'hearth_card_iframe_name',
	sub: 'hearth_card_iframe_sub',
	icon: 'web',
	fillByDefault: true,
	sizable: true,
	stretchMinHeight: 200,
	normalize: (card) => ({
		url: normalizeEmbedUrl(card.url),
		title: trimmedOrUndefined(card.title)
	}),
	schema: v.looseObject({
		url: v.optional(
			v.pipe(
				v.string('must be text'),
				v.check(
					(url) => normalizeEmbedUrl(url) !== undefined,
					'must be an http(s) address or a path on this server'
				)
			)
		),
		title: OptionalText
	}),
	needsConfiguration: (card) => !card.url,
	entityIds: () => []
};
