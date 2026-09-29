import { writable } from 'svelte/store';

/*
 * Touch feedback. Two transports, picked per device:
 *
 *  - Vibration API (`navigator.vibrate`) on Android. Amplitude is not
 *    controllable, so a pulse below full strength is chopped into on/off slices
 *    inside a 20ms cycle - short enough that the motor reads it as one weaker
 *    buzz.
 *  - iOS Safari has no Vibration API. Toggling a `<input type="checkbox"
 *    switch>` drives the Taptic Engine instead (iOS 18 and newer), so a
 *    pattern becomes a series of clicks on an offscreen switch.
 *
 * Both are best-effort: on a device with neither, every call here is a no-op.
 */

export type HapticPattern = 'press' | 'hold' | 'step' | 'commit' | 'success' | 'error';

interface Pulse {
	/** Milliseconds the motor runs. */
	duration: number;
	/** 0-1; below 1 the pulse is chopped to feel weaker. */
	intensity?: number;
}

interface Gap {
	/** Milliseconds of silence. */
	gap: number;
}

type PatternBlock = Pulse | Gap;

function isPulse(block: PatternBlock): block is Pulse {
	return 'duration' in block;
}

const PATTERNS: Record<HapticPattern, PatternBlock[]> = {
	press: [{ duration: 10, intensity: 0.5 }],
	hold: [{ duration: 8, intensity: 0.4 }, { gap: 12 }, { duration: 12, intensity: 0.7 }],
	step: [{ duration: 6, intensity: 0.3 }],
	commit: [{ duration: 12, intensity: 0.5 }, { gap: 24 }, { duration: 16, intensity: 0.8 }],
	success: [
		{ duration: 15, intensity: 0.4 },
		{ gap: 40 },
		{ duration: 25, intensity: 0.7 },
		{ gap: 60 },
		{ duration: 35, intensity: 1 }
	],
	error: [
		{ duration: 30, intensity: 0.7 },
		{ gap: 30 },
		{ duration: 30, intensity: 0.7 },
		{ gap: 30 },
		{ duration: 40, intensity: 1 }
	]
};

/** Whether touch feedback is on; mirrors `haptics` in configuration.yaml. */
export const haptics = writable(false);

let enabled = false;
haptics.subscribe((value) => (enabled = value));

export interface HapticCapabilities {
	/** A vibration motor this code can reach through `navigator.vibrate`. */
	vibration: boolean;
	/** iOS Safari, where the Taptic Engine is reached through a switch instead. */
	taptic: boolean;
}

export function hapticCapabilities(): HapticCapabilities {
	return { vibration: hasVibrationMotor(), taptic: isIOS() };
}

/** Whether this device can produce feedback at all. */
export function hapticsSupported(): boolean {
	const capabilities = hapticCapabilities();
	return capabilities.vibration || capabilities.taptic;
}

function hasVibrationMotor(): boolean {
	if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
	// Chrome drops the vibration on an insecure origin while still returning true
	// from the call, so http is indistinguishable from success at the call site.
	if (!isSecureOrigin()) return false;
	// Desktop browsers expose vibrate() with no motor behind it. A coarse
	// pointer is the closest available signal for "this is a touch device".
	return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

function isSecureOrigin(): boolean {
	return typeof window === 'undefined' || window.isSecureContext;
}

function isIOS(): boolean {
	if (typeof navigator === 'undefined') return false;
	if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
	// iPadOS reports itself as macOS; touch points separate it from a desktop.
	// A Mac with a touch display would be a false positive, which costs nothing:
	// the switch toggle is silent without a Taptic Engine.
	if (navigator.maxTouchPoints > 1) {
		const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
			.userAgentData?.platform;
		// navigator.platform is deprecated but still the only signal Safari gives
		return navigator.platform === 'MacIntel' || platform === 'macOS';
	}
	return false;
}

export function vibrate(pattern: HapticPattern) {
	if (!enabled) return;
	play(pattern);
}

/** Plays one pattern regardless of the setting, for the settings preview. */
export function sampleVibration(pattern: HapticPattern = 'press') {
	play(pattern);
}

function play(pattern: HapticPattern) {
	const blocks = PATTERNS[pattern];
	if (isIOS()) {
		playTaptic(blocks);
		return;
	}
	if (!hasVibrationMotor()) return;
	const timings = toVibrationTimings(blocks);
	if (timings.length) navigator.vibrate(timings);
}

/* intensity */

const PWM_CYCLE = 20;

/**
 * Splits one pulse into the on/off slices that approximate its intensity.
 * Pulses at or below the cycle length cannot be chopped without disappearing,
 * so they run at full strength.
 */
function slicePulse(duration: number, intensity: number): number[] {
	if (intensity >= 1) return [duration];
	if (intensity <= 0) return [];
	if (duration <= PWM_CYCLE) return [duration];

	const onTime = Math.max(1, Math.round(PWM_CYCLE * intensity));
	const offTime = PWM_CYCLE - onTime;
	const slices: number[] = [];
	let remaining = duration;
	while (remaining >= PWM_CYCLE) {
		slices.push(onTime, offTime);
		remaining -= PWM_CYCLE;
	}
	if (remaining > 0) {
		const lastOn = Math.min(remaining, onTime);
		slices.push(lastOn);
		if (remaining - lastOn > 0) slices.push(remaining - lastOn);
	}
	return slices;
}

/** `navigator.vibrate` takes alternating on/off durations, starting with on. */
function toVibrationTimings(blocks: readonly PatternBlock[]): number[] {
	const timings: number[] = [];
	for (const block of blocks) {
		if (isPulse(block)) {
			const slices = slicePulse(block.duration, block.intensity ?? 1);
			if (!slices.length) continue;
			// an odd length means the array ends on an "on" slot; a zero-length
			// gap keeps the alternation intact
			if (timings.length % 2 === 1) timings.push(0);
			timings.push(...slices);
		} else if (timings.length) {
			if (timings.length % 2 === 0) timings[timings.length - 1] += block.gap;
			else timings.push(block.gap);
		}
	}
	return timings;
}

/* iOS */

// Below this the Taptic Engine drops the second click, so pattern gaps are
// widened to it rather than played as written.
const TAPTIC_INTERVAL = 26;

let tapticSwitch: HTMLLabelElement | null = null;
let tapticTimers: ReturnType<typeof setTimeout>[] = [];

function tapticElement(): HTMLLabelElement | null {
	if (tapticSwitch || typeof document === 'undefined') return tapticSwitch;

	tapticSwitch = document.createElement('label');
	tapticSwitch.ariaHidden = 'true';
	// kept in the layout at 0.01 opacity: display:none stops the feedback
	Object.assign(tapticSwitch.style, {
		position: 'fixed',
		left: '-9999px',
		top: '-9999px',
		opacity: '0.01',
		pointerEvents: 'none'
	});

	const input = document.createElement('input');
	input.type = 'checkbox';
	input.setAttribute('switch', '');
	input.ariaHidden = 'true';
	input.tabIndex = -1;
	tapticSwitch.appendChild(input);
	document.body.appendChild(tapticSwitch);
	return tapticSwitch;
}

/**
 * Each pulse becomes one click of the same strength - iOS gives no control over
 * that - so a pattern reads through its rhythm alone. The first click is
 * synchronous because iOS 18.4 only grants feedback inside a gesture handler,
 * and that grant expires about a second later: long patterns lose their tail
 * when the gesture is already over.
 */
function playTaptic(blocks: readonly PatternBlock[]) {
	for (const timer of tapticTimers) clearTimeout(timer);
	tapticTimers = [];

	const offsets: number[] = [];
	let cursor = 0;
	for (const block of blocks) {
		if (isPulse(block)) offsets.push(cursor);
		cursor += isPulse(block) ? block.duration : block.gap;
	}
	if (!offsets.length) return;

	tapticElement()?.click();
	for (let index = 1; index < offsets.length; index++) {
		const delay = Math.max(offsets[index] - offsets[0], index * TAPTIC_INTERVAL);
		tapticTimers.push(setTimeout(() => tapticElement()?.click(), delay));
	}
}

export function disposeHaptics() {
	for (const timer of tapticTimers) clearTimeout(timer);
	tapticTimers = [];
	tapticSwitch?.remove();
	tapticSwitch = null;
}

/* presses */

/**
 * Presses are fed back from one delegated listener rather than per control: the
 * `.pressable` class already marks the surfaces that act on a press, and it is
 * dropped while a control is readonly or unavailable. Keyboard activation is
 * covered here too, since Enter and Space never produce a pointer event.
 */
export function startPressFeedback(root: Document | HTMLElement = document) {
	function pressable(event: Event) {
		return Boolean((event.target as Element | null)?.closest?.('.pressable'));
	}

	function handlePointerDown(event: Event) {
		if (enabled && pressable(event)) play('press');
	}

	function handleKeyDown(event: Event) {
		const key = event as KeyboardEvent;
		if (!enabled || key.repeat) return;
		if (key.key !== 'Enter' && key.key !== ' ') return;
		if (pressable(event)) play('press');
	}

	root.addEventListener('pointerdown', handlePointerDown, true);
	root.addEventListener('keydown', handleKeyDown, true);
	return () => {
		root.removeEventListener('pointerdown', handlePointerDown, true);
		root.removeEventListener('keydown', handleKeyDown, true);
	};
}
