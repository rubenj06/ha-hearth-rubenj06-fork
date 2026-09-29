import { describe, expect, it } from 'vitest';
import { clockParts, handAngles } from './time';

// 2026-01-15 13:05:09 UTC, 14:05:09 in Amsterdam (CET)
const date = new Date(Date.UTC(2026, 0, 15, 13, 5, 9));

describe('clockParts', () => {
	it('reads the time in the requested zone', () => {
		expect(clockParts(date, 'nl', 'Europe/Amsterdam', '24')).toMatchObject({
			hours: 14,
			minutes: 5,
			seconds: 9,
			digits: ['14', '05', '09'],
			dayPeriod: undefined
		});
	});

	it('shows a 12-hour clock with a day period', () => {
		const parts = clockParts(date, 'en-US', 'Europe/Amsterdam', '12');
		expect(parts.digits[0]).toBe('02');
		expect(parts.hours).toBe(14);
		expect(parts.dayPeriod).toBe('PM');
	});

	it('follows the locale when the hour format is auto', () => {
		expect(clockParts(date, 'en-US', 'UTC').dayPeriod).toBe('PM');
		expect(clockParts(date, 'nl', 'UTC').dayPeriod).toBeUndefined();
	});

	it('shows midnight as 00 on a 24-hour clock and 12 on a 12-hour clock', () => {
		const midnight = new Date(Date.UTC(2026, 0, 15, 0, 0, 0));
		expect(clockParts(midnight, 'nl', 'UTC', '24').digits[0]).toBe('00');
		expect(clockParts(midnight, 'en-US', 'UTC', '12').digits[0]).toBe('12');
	});
});

describe('handAngles', () => {
	it('sweeps the hands between the hour marks', () => {
		const angles = handAngles(clockParts(date, 'nl', 'Europe/Amsterdam', '24'));
		expect(angles.hour).toBeCloseTo(2 * 30 + 5 * 0.5 + 9 / 120);
		expect(angles.minute).toBeCloseTo(5 * 6 + 0.9);
		expect(angles.second).toBe(54);
	});
});
