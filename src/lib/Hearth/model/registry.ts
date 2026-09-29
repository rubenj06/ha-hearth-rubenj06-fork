import type { CardDefinition, WidgetDefinition } from './types';
import type { OverviewCard, RailWidget } from '../types';
import { cameraCard } from './cards/camera';
import { climateCard } from './cards/climate';
import { conditionalMediaCard } from './cards/conditional_media';
import { daysSinceCard } from './cards/days_since';
import { entitiesCard } from './cards/entities';
import { headerCard } from './cards/header';
import { iframeCard } from './cards/iframe';
import { imageCard } from './cards/image';
import { mediaCard } from './cards/media';
import { scenesCard } from './cards/scenes';
import { temperatureCard } from './cards/temperature';
import { vacuumCard } from './cards/vacuum';
export const CARD_DEFINITIONS = [
	cameraCard,
	climateCard,
	conditionalMediaCard,
	daysSinceCard,
	entitiesCard,
	headerCard,
	iframeCard,
	imageCard,
	mediaCard,
	scenesCard,
	temperatureCard,
	vacuumCard
] as const;
import { calendarWidget } from './widgets/calendar';
import { chartWidget } from './widgets/chart';
import { iframeWidget } from './widgets/iframe';
import { notificationsWidget } from './widgets/notifications';
import { templateWidget } from './widgets/template';
import { timerWidget } from './widgets/timer';
import { clockWidget } from './widgets/clock';
import { energyWidget } from './widgets/energy';
import { entityWidget } from './widgets/entity';
import { labelWidget } from './widgets/label';
import { navWidget } from './widgets/nav';
import { progressWidget } from './widgets/progress';
import { searchWidget } from './widgets/search';
import { spacerWidget } from './widgets/spacer';
import { statusWidget } from './widgets/status';
import { weatherWidget } from './widgets/weather';
export const WIDGET_DEFINITIONS = [
	calendarWidget,
	chartWidget,
	iframeWidget,
	notificationsWidget,
	templateWidget,
	timerWidget,
	clockWidget,
	energyWidget,
	entityWidget,
	labelWidget,
	navWidget,
	progressWidget,
	searchWidget,
	spacerWidget,
	statusWidget,
	weatherWidget
] as const;

export function cardDefinition(type: string): CardDefinition<any> | undefined {
	return CARD_DEFINITIONS.find((item) => item.type === type);
}
export function widgetDefinition(type: string): WidgetDefinition<any> | undefined {
	return WIDGET_DEFINITIONS.find((item) => item.type === type);
}

type MissingCard = Exclude<OverviewCard['type'], (typeof CARD_DEFINITIONS)[number]['type']>;
type MissingWidget = Exclude<RailWidget['type'], (typeof WIDGET_DEFINITIONS)[number]['type']>;
const complete: [MissingCard | MissingWidget] extends [never] ? true : never = true;
void complete;
