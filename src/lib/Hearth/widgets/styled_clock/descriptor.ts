// fork: styled clock widget (analog or flip), not part of upstream Hearth
import type { WidgetDescriptor } from '../types';
import Widget from './Widget.svelte';
import {
	styledClockWidget as definition,
	type StyledClockWidget
} from '../../model/widgets/styled_clock';
export type { StyledClockWidget } from '../../model/widgets/styled_clock';

export const styledClockWidget: WidgetDescriptor<StyledClockWidget> = {
	...definition,
	component: Widget,
	editor: () => import('./Editor.svelte')
};
