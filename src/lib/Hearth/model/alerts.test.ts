import { describe, expect, it } from 'vitest';
import { hearthConfigIssues, normalizeHearthConfig } from '../normalize';
import { normalizeAlertRules } from './alerts';

const base = { version: 5, rail: [], rooms: [{ id: 'home', cards: [] }] };

describe('alert rules in the configuration', () => {
	it('normalizes a rule and fills in its defaults', () => {
		expect(
			normalizeAlertRules([
				{
					title: ' Fridge door open ',
					conditions: [{ entity: 'binary_sensor.fridge_door', state: 'on' }],
					for_seconds: 120.4,
					popup: true,
					auto_close: false,
					severity: 'loud'
				}
			])
		).toEqual([
			{
				id: 'alert-1',
				title: 'Fridge door open',
				message: undefined,
				icon: undefined,
				severity: 'info',
				conditions: [{ entity: 'binary_sensor.fridge_door', state: 'on' }],
				for_seconds: 120,
				popup: undefined,
				auto_close: false,
				entity: undefined
			}
		]);
	});

	it('drops rules with no title or no usable condition and keeps ids unique', () => {
		const rules = normalizeAlertRules([
			{ id: 'a', title: 'One', conditions: [{ entity: 'light.a' }] },
			{ id: 'a', title: 'Two', conditions: [{ entity: 'light.b' }] },
			{ id: 'b', title: '', conditions: [{ entity: 'light.c' }] },
			{ id: 'c', title: 'Three', conditions: [{ nonsense: true }] },
			'not a rule'
		]);
		expect(rules?.map((rule) => rule.id)).toEqual(['a', 'a-2']);
		expect(normalizeAlertRules([])).toBeUndefined();
		expect(normalizeAlertRules('nope')).toBeUndefined();
	});

	it('leaves media queries out of rules and reports them', () => {
		const rule = {
			id: 'a',
			title: 'A',
			conditions: [
				{ entity: 'light.a', state: 'on' },
				{ media: '(max-width: 600px)' },
				{ or: [{ media: '(orientation: portrait)' }] }
			]
		};
		expect(normalizeAlertRules([rule])?.[0].conditions).toEqual([
			{ entity: 'light.a', state: 'on' }
		]);
		expect(
			normalizeAlertRules([{ ...rule, conditions: [{ media: '(max-width: 600px)' }] }])
		).toBeUndefined();
		expect(hearthConfigIssues({ ...base, alerts: [rule] })).toEqual([
			'alerts[0].conditions cannot use media queries; alerts do not depend on the screen'
		]);
	});

	it('caps the wait at one day', () => {
		const rule = { id: 'a', title: 'A', conditions: [{ entity: 'light.a' }], for_seconds: 100_000 };
		expect(normalizeAlertRules([rule])?.[0].for_seconds).toBe(86_400);
		expect(hearthConfigIssues({ ...base, alerts: [rule] })).toEqual([
			'alerts[0].for_seconds must be at most 86400'
		]);
	});

	it('carries the rules through the configuration', () => {
		const config = normalizeHearthConfig({
			...base,
			alerts: [{ id: 'fridge', title: 'Fridge', conditions: [{ entity: 'light.a', state: 'on' }] }]
		});
		expect(config.alerts?.[0]).toMatchObject({ id: 'fridge', severity: 'info' });
		expect(normalizeHearthConfig(base).alerts).toBeUndefined();
	});

	it('reports broken rules before they are applied', () => {
		expect(hearthConfigIssues({ ...base, alerts: 'x' })).toEqual(['alerts must be a list']);
		expect(
			hearthConfigIssues({
				...base,
				alerts: [
					{ id: 'a', title: 'A', conditions: [{ entity: 'light.a' }], severity: 'loud' },
					{ id: 'a', title: '', conditions: [], for_seconds: -1 }
				]
			})
		).toEqual([
			'alerts[0].severity must be info, warning or critical',
			'alerts[1].id duplicates alerts[0].id',
			'alerts[1].title must not be empty',
			'alerts[1].conditions must have at least one condition',
			'alerts[1].for_seconds must be at least 0'
		]);
	});
});
