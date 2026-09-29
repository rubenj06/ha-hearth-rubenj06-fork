import * as v from 'valibot';
import type { AlertRule, AlertSeverity, VisibilityCondition } from '../types';
import { MAX_ALERT_SECONDS, normalizeVisibility } from '../config';
import { isRecord, reserveId, trimmedOrUndefined } from '../normalizers';
import { OptionalEntityId, OptionalFlag, OptionalText, VisibilityConditionSchema } from '../schema';

export const ALERT_SEVERITIES: readonly AlertSeverity[] = ['info', 'warning', 'critical'];

export function isAlertSeverity(value: unknown): value is AlertSeverity {
	return ALERT_SEVERITIES.includes(value as AlertSeverity);
}

export const AlertRuleSchema = v.looseObject({
	title: v.pipe(v.string('must be text'), v.trim(), v.minLength(1, 'must not be empty')),
	message: OptionalText,
	icon: OptionalText,
	severity: v.optional(
		v.picklist(ALERT_SEVERITIES as AlertSeverity[], 'must be info, warning or critical')
	),
	conditions: v.pipe(
		v.array(VisibilityConditionSchema, 'must be a list of conditions'),
		v.minLength(1, 'must have at least one condition'),
		v.check(
			(conditions) => !usesMedia(conditions),
			'cannot use media queries; alerts do not depend on the screen'
		)
	),
	for_seconds: v.optional(
		v.pipe(
			v.number('must be a number'),
			v.minValue(0, 'must be at least 0'),
			v.maxValue(MAX_ALERT_SECONDS, `must be at most ${MAX_ALERT_SECONDS}`)
		)
	),
	popup: OptionalFlag,
	auto_close: OptionalFlag,
	entity: OptionalEntityId
});

function usesMedia(conditions: VisibilityCondition[]): boolean {
	return conditions.some(
		(condition) => 'media' in condition || ('or' in condition && usesMedia(condition.or))
	);
}

/*
 * Alert rules are checked when states change, not when the window resizes,
 * so a media query would read whatever the screen was at the last state
 * change. They are left out; an or-group left empty goes with them.
 */
function withoutMedia(conditions: VisibilityCondition[]): VisibilityCondition[] {
	return conditions.flatMap((condition): VisibilityCondition[] => {
		if ('media' in condition) return [];
		if (!('or' in condition)) return [condition];
		const or = withoutMedia(condition.or);
		return or.length ? [{ or }] : [];
	});
}

/**
 * Rules without a title or a condition are dropped: a rule with nothing to
 * check would either never fire or fire forever. `taken` collects the ids
 * handed out so two rules never share one.
 */
export function normalizeAlertRules(raw: unknown): AlertRule[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const taken: string[] = [];
	const rules = raw.filter(isRecord).flatMap((rule, index): AlertRule[] => {
		const title = trimmedOrUndefined(rule.title);
		const conditions = withoutMedia(normalizeVisibility(rule.conditions) ?? []);
		if (!title || !conditions.length) return [];
		const seconds = rule.for_seconds;
		return [
			{
				...rule,
				id: reserveId(rule.id, `alert-${index + 1}`, taken),
				title,
				message: trimmedOrUndefined(rule.message),
				icon: trimmedOrUndefined(rule.icon),
				severity: isAlertSeverity(rule.severity) ? rule.severity : 'info',
				conditions,
				for_seconds:
					typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
						? Math.min(MAX_ALERT_SECONDS, Math.round(seconds))
						: undefined,
				popup: rule.popup === false ? false : undefined,
				auto_close: rule.auto_close === false ? false : undefined,
				entity: trimmedOrUndefined(rule.entity)
			}
		];
	});
	return rules.length ? rules : undefined;
}
