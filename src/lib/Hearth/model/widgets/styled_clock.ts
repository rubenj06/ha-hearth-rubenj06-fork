// fork: styled clock widget (analog or flip), not part of upstream Hearth
import * as v from 'valibot';
import type { RailWidget } from '../../types';
import type { WidgetDefinition } from '../types';
import { OptionalText, OptionalFlag } from '../../schema';
import { validTimeZone } from '../../clock';

export type StyledClockWidget = Extract<RailWidget, { type: 'styled_clock' }>;
export type StyledClockStyle = NonNullable<StyledClockWidget['style']>;

export const styledClockWidget: WidgetDefinition<StyledClockWidget> = {
	type: 'styled_clock',
	label: 'hearth_widget_styled_clock_label',
	name: 'hearth_widget_styled_clock_name',
	sub: 'hearth_widget_styled_clock_sub',
	icon: 'nest_clock_farsight_analog',
	normalize: (widget) => ({
		// analog is the default and is stored as an absent style
		style: widget.style === 'flip' ? 'flip' : undefined,
		timezone: validTimeZone(widget.timezone),
		hour_format: ['auto', '12', '24'].includes(widget.hour_format) ? widget.hour_format : undefined,
		show_seconds: widget.show_seconds === true ? true : undefined,
		hide_date: widget.hide_date === true ? true : undefined
	}),
	schema: v.looseObject({
		style: v.optional(v.picklist(['analog', 'flip'], 'must be analog or flip')),
		timezone: OptionalText,
		hour_format: v.optional(v.picklist(['auto', '12', '24'], 'must be auto, 12 or 24')),
		show_seconds: OptionalFlag,
		hide_date: OptionalFlag
	}),
	entityIds: () => []
};
