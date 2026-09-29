import type { ClockHourFormat } from '../../clock';

export interface ClockParts {
	/** 0-23 in the requested zone */
	hours: number;
	minutes: number;
	seconds: number;
	/** hour, minute and second as shown on a flip clock, zero-padded */
	digits: [string, string, string];
	/** AM/PM marker in the locale's wording, only for a 12-hour clock */
	dayPeriod?: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

function usesTwelveHour(locale: string): boolean {
	try {
		const cycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
		return cycle === 'h11' || cycle === 'h12';
	} catch {
		return false;
	}
}

/** The wall-clock time in a zone, split for drawing hands or flip cards. */
export function clockParts(
	date: Date,
	locale: string,
	timeZone?: string,
	hourFormat: ClockHourFormat = 'auto'
): ClockParts {
	const zone = timeZone ? { timeZone } : {};
	const parts = new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		hourCycle: 'h23',
		...zone
	}).formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((entry) => entry.type === type)?.value ?? 0);
	// some engines report midnight as 24 under h23
	const hours = part('hour') % 24;
	const minutes = part('minute');
	const seconds = part('second');

	const twelve = hourFormat === '12' || (hourFormat === 'auto' && usesTwelveHour(locale));
	const dayPeriod = twelve
		? new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true, ...zone })
				.formatToParts(date)
				.find((entry) => entry.type === 'dayPeriod')?.value
		: undefined;

	return {
		hours,
		minutes,
		seconds,
		digits: [pad(twelve ? hours % 12 || 12 : hours), pad(minutes), pad(seconds)],
		dayPeriod
	};
}

/** Hand rotations in degrees clockwise from twelve; hands sweep between ticks. */
export function handAngles({ hours, minutes, seconds }: ClockParts) {
	return {
		hour: (hours % 12) * 30 + minutes * 0.5 + seconds / 120,
		minute: minutes * 6 + seconds * 0.1,
		second: seconds * 6
	};
}
