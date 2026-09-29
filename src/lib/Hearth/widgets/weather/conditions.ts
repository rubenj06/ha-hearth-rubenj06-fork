/** Material symbol per Home Assistant weather condition. */
const CONDITION_ICONS: Record<string, string> = {
	'clear-night': 'clear_night',
	cloudy: 'cloud',
	fog: 'foggy',
	hail: 'weather_hail',
	lightning: 'thunderstorm',
	'lightning-rainy': 'thunderstorm',
	partlycloudy: 'partly_cloudy_day',
	pouring: 'rainy',
	rainy: 'rainy',
	snowy: 'weather_snowy',
	'snowy-rainy': 'weather_mix',
	sunny: 'clear_day',
	windy: 'air',
	'windy-variant': 'air',
	exceptional: 'warning'
};

export function conditionIcon(condition: string): string {
	return CONDITION_ICONS[condition] ?? 'cloud';
}
