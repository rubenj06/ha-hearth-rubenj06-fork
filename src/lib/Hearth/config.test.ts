import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import {
	DEFAULT_HEARTH_CONFIG,
	findOverviewCard,
	findOverviewItemList,
	isStack,
	foldedRail,
	foldedTopCount,
	railDividerIndex,
	railSides,
	railSlots,
	wildcardEntityIds,
	type RailWidget
} from './config';
import { hearthConfigIssues, normalizeHearthConfig } from './normalize';
import {
	moveRailWidget,
	moveToSide,
	placeInSide,
	placeInSlot,
	reorderSide,
	reorderSlot
} from './model/railMoves';

describe('normalizeHearthConfig', () => {
	it('uses a generic, entity-free first-run fallback', () => {
		expect(DEFAULT_HEARTH_CONFIG).toMatchObject({
			rail: [
				{ id: 'clock', type: 'clock' },
				{ id: 'divider', type: 'spacer', line: true, height: 24 },
				{ id: 'nav', type: 'nav' },
				{ id: 'spacer', type: 'spacer' }
			],
			rooms: [{ id: 'home', cards: [[]] }]
		});
		expect(JSON.stringify(DEFAULT_HEARTH_CONFIG)).not.toMatch(/(?:light|sensor|weather|vacuum)\./);
	});

	it('normalizes screensaver customization', () => {
		expect(
			normalizeHearthConfig({
				rail: [],
				rooms: [{ id: 'home', cards: [[]] }],
				screensaver_drift: true,
				screensaver_brightness: 150
			})
		).toMatchObject({ screensaver_drift: true, screensaver_brightness: 100 });
	});

	it('normalizes customization flags and verdict bands', () => {
		const config = normalizeHearthConfig({
			rail: [],
			rooms: [
				{
					id: 'home',
					cards: [
						[
							{
								id: 'lights',
								type: 'entities',
								title: 'Lights',
								show_count: false,
								group_actions: false,
								tune_button: true,
								entities: [
									{ entity: 'sensor.co2', verdict: { good: 500, fair: 900 } },
									{ entity: 'sensor.pm25', verdict: false },
									{ entity: 'sensor.junk', verdict: { good: 9, fair: 3 } }
								]
							},
							{
								id: 'temp',
								type: 'temperature',
								entity: 'sensor.inside',
								verdict: false
							},
							{ id: 'vac', type: 'vacuum', quick_action: true }
						]
					]
				}
			]
		});
		const [lights, temp, vac] = config.rooms[0].cards[0] as any[];
		expect(lights).toMatchObject({
			show_count: false,
			group_actions: false,
			tune_button: true
		});
		expect(lights.entities[0].verdict).toEqual({ good: 500, fair: 900, max: undefined });
		expect(lights.entities[1].verdict).toBe(false);
		// inverted thresholds are unusable and fall back to device-class defaults
		expect(lights.entities[2].verdict).toBeUndefined();
		expect(temp.verdict).toBe(false);
		expect(vac.quick_action).toBe(true);
	});

	it('repairs globally duplicated IDs without dropping valid items', () => {
		const config = normalizeHearthConfig({
			rail: [
				{ id: 'status', type: 'status' },
				{ id: 'status', type: 'label' },
				{ id: 'status', type: 'nav' }
			],
			rooms: [
				{
					id: 'room',
					name: 'Room',
					icon: 'home',
					cards: [[{ id: 'shared', type: 'entities', entities: [] }]]
				},
				{
					id: 'room',
					name: 'Other',
					icon: 'home',
					cards: [
						[
							{
								id: 'shared',
								kind: 'stack',
								cards: [{ id: 'shared', type: 'media' }]
							}
						]
					]
				}
			]
		});

		expect(config.rail.map(({ id }) => id)).toEqual(['status', 'status-2', 'status-3']);
		expect(config.rooms.map(({ id }) => id)).toEqual(['room', 'room-2']);
		const stack = config.rooms[1].cards[0][0];
		expect(isStack(stack) && [stack.id, stack.cards[0].id]).toEqual(['shared-2', 'shared-3']);
	});

	it('drops unknown types and malformed nested entity references', () => {
		const config = normalizeHearthConfig({
			rail: [{ id: 'bad', type: 'not-a-widget' }],
			rooms: [
				{
					id: 'home',
					cards: [
						[
							{ id: 'bad', type: 'not-a-card' },
							{
								id: 'entities',
								type: 'entities',
								entities: [null, {}, { entity: ' light.desk ', name: 'Desk' }]
							}
						]
					]
				}
			]
		});

		expect(config.rail).toEqual([]);
		expect(config.rooms[0].cards[0]).toHaveLength(1);
		expect(config.rooms[0].cards[0][0]).toMatchObject({
			id: 'entities',
			entities: [{ entity: 'light.desk', name: 'Desk' }]
		});
	});

	it('preserves unknown extension keys at every config level', () => {
		const config = normalizeHearthConfig({
			x_vendor: { enabled: true },
			rail: [{ id: 'clock', type: 'clock', x_widget: 'kept' }],
			rooms: [
				{
					id: 'home',
					x_room: 'kept',
					cards: [
						[
							{
								id: 'stack',
								kind: 'stack',
								x_stack: 42,
								cards: [{ id: 'header', type: 'header', title: 'Extension', x_card: true }]
							}
						]
					]
				}
			]
		} as any) as any;

		expect(config.x_vendor).toEqual({ enabled: true });
		expect(config.rail[0].x_widget).toBe('kept');
		expect(config.rooms[0].x_room).toBe('kept');
		expect(config.rooms[0].cards[0][0].x_stack).toBe(42);
		expect(config.rooms[0].cards[0][0].cards[0].x_card).toBe(true);
	});

	it('resolves cards by id after their position changes', () => {
		const config = normalizeHearthConfig({
			rail: [],
			rooms: [
				{
					id: 'home',
					cards: [
						[{ id: 'first', type: 'header' }],
						[
							{
								id: 'stack',
								kind: 'stack',
								cards: [{ id: 'target', type: 'header', title: 'Target' }]
							}
						]
					]
				}
			]
		});

		const list = findOverviewItemList(config, 'target', 'home');
		expect(list?.map((item) => item.id)).toEqual(['target']);
		expect(findOverviewCard(config, 'target', 'home')).toMatchObject({ title: 'Target' });
	});

	it('uses the canonical default page icon', () => {
		const config = normalizeHearthConfig({ rail: [], rooms: [{ id: 'new-page', cards: [[]] }] });
		expect(config.rooms[0].icon).toBe('meeting_room');
	});

	it('expands entity wildcards deterministically', () => {
		expect(
			wildcardEntityIds('light.kitchen_*', [
				'light.kitchen_table',
				'switch.kitchen_fan',
				'light.kitchen_ceiling'
			])
		).toEqual(['light.kitchen_ceiling', 'light.kitchen_table']);
	});
});

describe('hearthConfigIssues', () => {
	it('gives actionable paths for editor mistakes', () => {
		const issues = hearthConfigIssues({
			rail: [
				{ id: 'same', type: 'nav' },
				{ id: 'same', type: 'typo' }
			],
			rooms: [
				{
					id: 'home',
					cards: [
						[
							{ id: 'card', type: 'entities', entities: [{ name: 'Missing entity' }] },
							{ id: 'card', type: 'unknown' }
						]
					]
				}
			]
		});

		expect(issues).toContain('rail[1].id duplicates rail[0].id');
		expect(issues).toContain('rail[1].type is not a supported widget type');
		expect(issues).toContain('rooms[0].cards[0][0].entities[0].entity is required');
		expect(issues).toContain('rooms[0].cards[0][1].id duplicates rooms[0].cards[0][0].id');
	});

	it('checks root settings, pages, stacks and shared card fields', () => {
		const issues = hearthConfigIssues({
			theme: ['no'],
			screensaver_brightness: 150,
			padding_x: '12',
			rail: [{ id: 'clock', type: 'clock', hour_format: '13', hide_mobile: 'yes' }],
			rooms: [
				{
					id: 'home',
					columns: 4,
					cards: [
						[
							{
								id: 'stack',
								kind: 'stack',
								direction: 'diagonal',
								cards: [{ id: 'inner', type: 'climate', fill: -1, visibility: [{ nope: 1 }] }]
							},
							{ id: 'media', type: 'conditional_media', media_players: 'x', timeout: -5 }
						]
					]
				}
			]
		});
		expect(issues).toEqual([
			'theme must be a mapping of tokens',
			'screensaver_brightness must be 10 to 100',
			'padding_x must be a number',
			'rail[0].hide_mobile must be true or false',
			'rail[0].hour_format must be auto, 12 or 24',
			'rooms[0].columns must be 1 to 3',
			'rooms[0].cards[0][0].direction must be horizontal or vertical',
			'rooms[0].cards[0][0].cards[0].visibility[0] must name an entity, a media query or an or-group',
			'rooms[0].cards[0][0].cards[0].fill must be at least 0',
			'rooms[0].cards[0][1].media_players must be a list of entity ids',
			'rooms[0].cards[0][1].timeout must be at least 0'
		]);
	});

	it('accepts the scalar spellings the normalizer accepts', () => {
		expect(
			hearthConfigIssues({
				rail: [],
				rooms: [
					{
						id: 'home',
						cards: [
							[
								{ id: 's', type: 'scenes', scenes: [{ entity: 'scene.a', active_state: 22 }] },
								{ id: 'v', type: 'vacuum', modes: [{ entity: 'vacuum.a', duration: 48 }] }
							]
						]
					}
				]
			})
		).toEqual([]);
	});

	it('finds nothing wrong with the matrix fixture, before and after normalization', () => {
		const raw = load(readFileSync('e2e/fixture-matrix/data/hearth.yaml', 'utf8'));
		expect(hearthConfigIssues(raw)).toEqual([]);
		expect(hearthConfigIssues(normalizeHearthConfig(raw))).toEqual([]);
	});
});

describe('wall tablet settings', () => {
	it('keeps only finite, whole, in-range numbers and mapping themes', () => {
		const config = normalizeHearthConfig({
			rail: [],
			rooms: [],
			padding_x: 12.6,
			padding_y: -4,
			screensaver_minutes: Infinity,
			theme: ['not', 'a', 'mapping'],
			theme_night: { accent: '#fff', nested: { no: true }, size: 3 }
		});
		expect(config.padding_x).toBe(13);
		expect(config.padding_y).toBeUndefined();
		expect(config.screensaver_minutes).toBeUndefined();
		expect(config.theme).toBeUndefined();
		expect(config.theme_night).toEqual({ accent: '#fff' });
	});
});

describe('sleep screen settings', () => {
	const base = { rail: [], rooms: [{ id: 'home', cards: [[]] }] };

	it('keeps valid sleep screen options', () => {
		expect(
			normalizeHearthConfig({
				...base,
				screensaver_background: 'radar',
				screensaver_image: ' hearth-images/a.png ',
				screensaver_radar: { latitude: 52.2, longitude: 21, zoom: 5, basemap: 'light' },
				screensaver_show_date: false,
				screensaver_clock_size: 'large',
				screensaver_weather_entity: ' weather.home '
			})
		).toMatchObject({
			screensaver_background: 'radar',
			screensaver_image: 'hearth-images/a.png',
			screensaver_radar: { latitude: 52.2, longitude: 21, zoom: 5, basemap: 'light' },
			screensaver_show_date: false,
			screensaver_clock_size: 'large',
			screensaver_weather_entity: 'weather.home'
		});
	});

	it('drops unusable options and clamps the radar zoom to what RainViewer serves', () => {
		const config = normalizeHearthConfig({
			...base,
			screensaver_background: 'none',
			screensaver_image: '  ',
			screensaver_radar: { latitude: 120, longitude: 'east', zoom: 12, basemap: 'sepia' },
			screensaver_show_date: 'no',
			screensaver_clock_size: 'huge'
		});
		expect(config.screensaver_background).toBeUndefined();
		expect(config.screensaver_image).toBeUndefined();
		expect(config.screensaver_radar).toEqual({ zoom: 7 });
		expect(config.screensaver_show_date).toBeUndefined();
		expect(config.screensaver_clock_size).toBeUndefined();
		expect(normalizeHearthConfig({ ...base, screensaver_radar: { zoom: 0 } })).toMatchObject({
			screensaver_radar: { zoom: 3 }
		});
		expect(
			normalizeHearthConfig({ ...base, screensaver_radar: { basemap: 1 } }).screensaver_radar
		).toBeUndefined();
	});

	it('keeps a custom basemap only when it is a tile template', () => {
		const radar = (tile_url: string) =>
			normalizeHearthConfig({ ...base, screensaver_radar: { tile_url, attribution: ' Me ' } })
				.screensaver_radar;
		expect(radar(' https://tiles.example/{z}/{x}/{y}.png ')).toEqual({
			tile_url: 'https://tiles.example/{z}/{x}/{y}.png',
			attribution: 'Me'
		});
		expect(radar('javascript:alert(1)/{z}/{x}/{y}')).toEqual({ attribution: 'Me' });
		expect(
			hearthConfigIssues({ ...base, screensaver_radar: { tile_url: 'https://x/{z}.png' } })
		).toEqual(['screensaver_radar.tile_url must be an http(s) URL with {z}, {x} and {y}']);
	});

	it('reports sleep screen values the normalizer would discard', () => {
		expect(
			hearthConfigIssues({
				...base,
				screensaver_background: 'video',
				screensaver_radar: { latitude: 91, zoom: 9, basemap: 'sepia' },
				screensaver_clock_size: 'huge',
				screensaver_weather_entity: ''
			})
		).toEqual([
			'screensaver_background must be none, image or radar',
			'screensaver_radar.latitude must be -90 to 90',
			'screensaver_radar.zoom must be 3 to 7',
			'screensaver_radar.basemap must be dark or light',
			'screensaver_clock_size must be small, medium or large',
			'screensaver_weather_entity must be a non-empty string'
		]);
	});
});

describe('foldedTopCount', () => {
	const rail = [
		{ id: 'nav', type: 'nav' },
		{ id: 'search', type: 'search' },
		{ id: 'gap', type: 'spacer' },
		{ id: 'energy', type: 'energy' }
	] as RailWidget[];

	it('leaves out what the page switcher draws itself', () => {
		expect(foldedTopCount(rail)).toBe(0);
	});

	it('counts them in the editor, which shows them', () => {
		expect(foldedTopCount(rail, { editing: true })).toBe(2);
	});

	it('counts a widget the switcher does not carry', () => {
		expect(foldedTopCount([...rail, { id: 'clock', type: 'clock' } as RailWidget])).toBe(0);
		expect(foldedTopCount([{ id: 'clock', type: 'clock' } as RailWidget, ...rail])).toBe(1);
	});
});

describe('railSlots', () => {
	const rail = (...types: string[]) =>
		types.map((type, index) => ({ id: `${type}-${index}`, type }) as RailWidget);

	const ids = (widgets: RailWidget[]) => widgets.map((widget) => widget.id);

	it('splits at a flexible gap that has widgets after it', () => {
		const widgets = [
			{ id: 'clock', type: 'clock' },
			{ id: 'gap', type: 'spacer' },
			{ id: 'energy', type: 'energy' },
			{ id: 'calendar', type: 'calendar' }
		] as RailWidget[];
		const { top, bottom } = railSlots(widgets);
		expect(ids(top)).toEqual(['clock']);
		expect(ids(bottom)).toEqual(['gap', 'energy', 'calendar']);
	});

	it('takes the glance widgets above the page when the flexible gap is trailing', () => {
		// the shape the default config has: the gap only keeps the rail's own
		// widgets at the top of its column, so it divides nothing
		const widgets = [
			{ id: 'clock', type: 'clock' },
			{ id: 'weather', type: 'weather' },
			{ id: 'energy', type: 'energy' },
			{ id: 'gap', type: 'spacer' }
		] as RailWidget[];
		const { top, bottom } = railSlots(widgets);
		expect(ids(top)).toEqual(['clock', 'weather']);
		expect(ids(bottom)).toEqual(['energy', 'gap']);
	});

	it('lets a widget name its own slot', () => {
		const widgets = [
			{ id: 'clock', type: 'clock', mobile: 'bottom' },
			{ id: 'energy', type: 'energy', mobile: 'top' }
		] as RailWidget[];
		const { top, bottom } = railSlots(widgets);
		expect(ids(top)).toEqual(['energy']);
		expect(ids(bottom)).toEqual(['clock']);
	});

	it('drops hidden widgets unless the editor asks for them', () => {
		const widgets = [
			{ id: 'clock', type: 'clock' },
			{ id: 'energy', type: 'energy', mobile: 'hidden' }
		] as RailWidget[];
		expect(ids(railSlots(widgets).bottom)).toEqual([]);
		expect(ids(railSlots(widgets, { includeHidden: true }).bottom)).toEqual(['energy']);
	});

	it('places every widget exactly once', () => {
		const widgets = rail('clock', 'weather', 'energy', 'calendar', 'status');
		const { top, bottom } = railSlots(widgets);
		expect([...ids(top), ...ids(bottom)].sort()).toEqual(ids(widgets).sort());
	});
});

describe('mobile placement migration', () => {
	it('reads hide_mobile as the hidden slot and stops writing it', () => {
		const config = normalizeHearthConfig({
			rail: [{ id: 'clock', type: 'clock', hide_mobile: true }],
			rooms: []
		});
		expect(config.rail[0].mobile).toBe('hidden');
		expect(config.rail[0].hide_mobile).toBeUndefined();
	});

	it('keeps an explicit slot over the older flag', () => {
		const config = normalizeHearthConfig({
			rail: [{ id: 'clock', type: 'clock', hide_mobile: true, mobile: 'top' }],
			rooms: []
		});
		expect(config.rail[0].mobile).toBe('top');
	});

	it('rejects a slot that is not one of the three', () => {
		expect(
			hearthConfigIssues({ rail: [{ id: 'clock', type: 'clock', mobile: 'middle' }], rooms: [] })
		).toContain('rail[0].mobile must be top, bottom or hidden');
	});
});

describe('railSlots on a screen with no height', () => {
	const widgets = [
		{ id: 'clock', type: 'clock' },
		{ id: 'weather', type: 'weather' },
		{ id: 'pinned', type: 'status', mobile: 'top' }
	] as RailWidget[];

	it('keeps only what asked for the slot by name', () => {
		const { top, bottom } = railSlots(widgets, { compact: true });
		expect(top.map((widget) => widget.id)).toEqual(['pinned']);
		expect(bottom.map((widget) => widget.id)).toEqual(['clock', 'weather']);
	});
});

describe('moving a widget between folded runs', () => {
	const rail = () =>
		[
			{ id: 'clock', type: 'clock' },
			{ id: 'weather', type: 'weather' },
			{ id: 'energy', type: 'energy' },
			{ id: 'calendar', type: 'calendar' }
		] as RailWidget[];

	const ids = (widgets: RailWidget[]) => widgets.map((widget) => widget.id);

	it('assigns the destination slot and takes the widget out of the other run', () => {
		const next = placeInSlot(rail(), 'energy', 'top', 0);
		expect(ids(railSlots(next).top)).toEqual(['energy', 'clock', 'weather']);
		expect(ids(railSlots(next).bottom)).toEqual(['calendar']);
		expect(next.find((widget) => widget.id === 'energy')?.mobile).toBe('top');
	});

	it('sends a glance widget down when it is dropped in the trailing run', () => {
		const next = placeInSlot(rail(), 'clock', 'bottom', 1);
		expect(ids(railSlots(next).top)).toEqual(['weather']);
		expect(ids(railSlots(next).bottom)).toEqual(['energy', 'clock', 'calendar']);
	});

	it('leaves the original in place when the drop is a copy', () => {
		const next = placeInSlot(rail(), 'energy', 'top', 0, { copy: true });
		expect(next).toHaveLength(5);
		// the copy leads, in the run it was dropped into; the original stays put
		expect(ids(next).filter((id) => id.startsWith('energy'))).toEqual(['energy-2', 'energy']);
		expect(ids(railSlots(next).top)).toContain('energy-2');
		expect(ids(railSlots(next).bottom)).toContain('energy');
	});

	// the editor keeps hidden widgets in the runs, dimmed, so a drop or a
	// reorder lands next to one
	const withHidden = () =>
		[...rail(), { id: 'spare-clock', type: 'clock', mobile: 'hidden' }] as RailWidget[];

	it('does not un-hide a hidden widget sharing the run a drop lands in', () => {
		const start = withHidden();
		expect(ids(railSlots(start, { includeHidden: true }).top)).toContain('spare-clock');
		const next = placeInSlot(start, 'energy', 'top', 0);
		expect(next.find((widget) => widget.id === 'spare-clock')?.mobile).toBe('hidden');
	});

	it('does not un-hide a hidden widget when its run is reordered', () => {
		const start = withHidden();
		const run = railSlots(start, { includeHidden: true }).top;
		const next = reorderSlot(start, 'top', [...run].reverse());
		expect(next.find((widget) => widget.id === 'spare-clock')?.mobile).toBe('hidden');
	});

	it('keeps every widget when a run is reordered', () => {
		const start = rail();
		const run = railSlots(start).top;
		const next = reorderSlot(start, 'top', [run[1], run[0]]);
		expect(ids(next).sort()).toEqual(ids(start).sort());
		expect(ids(railSlots(next).top)).toEqual(['weather', 'clock']);
	});

	it('ignores a drop of a widget that is no longer there', () => {
		const start = rail();
		expect(placeInSlot(start, 'gone', 'top', 0)).toBe(start);
	});
});

describe('sidebar position', () => {
	const rail = () =>
		[
			{ id: 'clock', type: 'clock' },
			{ id: 'energy', type: 'energy', side: 'right' },
			{ id: 'nav', type: 'nav' },
			{ id: 'weather', type: 'weather', side: 'right' }
		] as RailWidget[];

	const ids = (widgets: RailWidget[]) => widgets.map((widget) => widget.id);

	it('splits the widgets by side only when there are two rails', () => {
		expect(ids(railSides(rail(), 'both').left)).toEqual(['clock', 'nav']);
		expect(ids(railSides(rail(), 'both').right)).toEqual(['energy', 'weather']);
		expect(ids(railSides(rail(), 'left').left)).toEqual(['clock', 'energy', 'nav', 'weather']);
		expect(railSides(rail(), 'left').right).toEqual([]);
		expect(ids(railSides(rail(), 'right').right)).toEqual(['clock', 'energy', 'nav', 'weather']);
		expect(railSides(rail(), 'right').left).toEqual([]);
		expect(railSides(rail(), 'none')).toEqual({ left: [], right: [] });
	});

	it('folds both rails in stored order, and no rail to nothing', () => {
		expect(ids(foldedRail(rail(), 'both'))).toEqual(['clock', 'energy', 'nav', 'weather']);
		expect(ids(foldedRail(rail(), 'right'))).toEqual(['clock', 'energy', 'nav', 'weather']);
		expect(foldedRail(rail(), 'none')).toEqual([]);
	});

	it('reorders one rail and leaves the other alone', () => {
		const next = reorderSide(rail(), 'right', [rail()[3], rail()[1]]);
		expect(ids(railSides(next, 'both').right)).toEqual(['weather', 'energy']);
		expect(ids(railSides(next, 'both').left)).toEqual(['clock', 'nav']);
	});

	it('moves a widget to the rail it is dropped on', () => {
		const next = placeInSide(rail(), 'nav', 'right', 1);
		expect(ids(railSides(next, 'both').right)).toEqual(['energy', 'nav', 'weather']);
		expect(ids(railSides(next, 'both').left)).toEqual(['clock']);
		expect(next.find((widget) => widget.id === 'nav')?.side).toBe('right');

		const back = placeInSide(next, 'nav', 'left', 0);
		expect(ids(railSides(back, 'both').left)).toEqual(['nav', 'clock']);
		expect(back.find((widget) => widget.id === 'nav')?.side).toBeUndefined();
	});

	it('copies instead of moving when asked', () => {
		const next = placeInSide(rail(), 'clock', 'right', 0, { copy: true });
		expect(ids(railSides(next, 'both').left)).toEqual(['clock', 'nav']);
		expect(ids(railSides(next, 'both').right)).toEqual(['clock-2', 'energy', 'weather']);
	});

	it('moves past the next widget on the same side when there are two rails', () => {
		const both = rail();
		moveRailWidget(both, 0, 1, 'both');
		expect(ids(both)).toEqual(['energy', 'nav', 'clock', 'weather']);
		const single = rail();
		moveRailWidget(single, 0, 1, 'left');
		expect(ids(single)).toEqual(['energy', 'clock', 'nav', 'weather']);
		const edge = rail();
		moveRailWidget(edge, 2, 1, 'both');
		expect(ids(edge)).toEqual(ids(rail()));
	});

	it('normalizes the position and each widget side', () => {
		const config = normalizeHearthConfig({
			rail_position: 'both',
			rail: [
				{ id: 'a', type: 'clock', side: 'right' },
				{ id: 'b', type: 'clock', side: 'left' },
				{ id: 'c', type: 'clock', side: 'middle' }
			],
			rooms: []
		});
		expect(config.rail_position).toBe('both');
		expect(config.rail.map((widget) => widget.side)).toEqual(['right', undefined, undefined]);
		expect(
			normalizeHearthConfig({ rail_position: 'left', rail: [] }).rail_position
		).toBeUndefined();
		expect(normalizeHearthConfig({ rail_position: 'top', rail: [] }).rail_position).toBeUndefined();
		expect(normalizeHearthConfig({ rail_position: 'none', rail: [] }).rail_position).toBe('none');
	});

	it('reports a position or side it does not know', () => {
		const issues = hearthConfigIssues({
			rail_position: 'top',
			rail: [{ id: 'a', type: 'clock', side: 'middle' }],
			rooms: [{ id: 'home', cards: [[]] }]
		});
		expect(issues.join('\n')).toMatch(/rail_position/);
		expect(issues.join('\n')).toMatch(/side/);
	});

	it('keeps a folded drag across sides in the order it was dropped', () => {
		const start = [
			{ id: 'clock', type: 'clock' },
			{ id: 'nav', type: 'nav' },
			{ id: 'weather', type: 'weather', side: 'right' }
		] as RailWidget[];
		const top = railSlots(foldedRail(start, 'both'), { position: 'both' }).top;
		expect(ids(top)).toEqual(['clock', 'weather']);
		const next = reorderSlot(start, 'top', [top[1], top[0]]);
		expect(ids(railSlots(foldedRail(next, 'both'), { position: 'both' }).top)).toEqual([
			'weather',
			'clock'
		]);
		expect(ids(railSides(next, 'both').right)).toEqual(['weather']);
	});

	it('does not divide at a gap that ends its own rail', () => {
		const gapLast = [
			{ id: 'clock', type: 'clock' },
			{ id: 'weather', type: 'weather', side: 'right' },
			{ id: 'lights', type: 'entity' },
			{ id: 'gap', type: 'spacer' }
		] as RailWidget[];
		expect(railDividerIndex(gapLast, 'both')).toBe(-1);

		const rightAfterGap = [
			{ id: 'clock', type: 'clock' },
			{ id: 'lights', type: 'entity' },
			{ id: 'gap', type: 'spacer' },
			{ id: 'weather', type: 'weather', side: 'right' }
		] as RailWidget[];
		expect(railDividerIndex(rightAfterGap, 'both')).toBe(-1);
		expect(railDividerIndex(rightAfterGap, 'left')).toBe(2);
		expect(ids(railSlots(rightAfterGap, { position: 'both' }).top)).toEqual(['clock', 'weather']);

		const dividing = [...rightAfterGap, { id: 'energy', type: 'energy' }] as RailWidget[];
		expect(railDividerIndex(dividing, 'both')).toBe(2);
	});

	it('sends a widget to the end of the rail it is moved to', () => {
		const toRight = moveToSide(rail(), 'clock', 'right');
		expect(ids(toRight)).toEqual(['energy', 'nav', 'weather', 'clock']);
		expect(toRight.at(-1)?.side).toBe('right');

		const toLeft = moveToSide(rail(), 'weather', 'left');
		expect(ids(toLeft)).toEqual(['clock', 'energy', 'nav', 'weather']);
		expect(toLeft.find((widget) => widget.id === 'weather')?.side).toBeUndefined();

		const emptyLeft = moveToSide(
			[
				{ id: 'a', type: 'clock', side: 'right' },
				{ id: 'b', type: 'clock', side: 'right' }
			] as RailWidget[],
			'b',
			'left'
		);
		expect(ids(emptyLeft)).toEqual(['b', 'a']);
	});
});
