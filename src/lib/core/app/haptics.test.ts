import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	disposeHaptics,
	hapticCapabilities,
	haptics,
	hapticsSupported,
	sampleVibration,
	startPressFeedback,
	vibrate
} from './haptics';

const vibrateSpy = vi.fn<(timings: VibratePattern) => boolean>(() => true);

/** jsdom reports a fine pointer and no vibrate(); both are needed per test. */
function asAndroidPhone() {
	secure(true);
	Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true });
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: query === '(pointer: coarse)',
		media: query,
		addEventListener() {},
		removeEventListener() {}
	}));
}

function secure(value: boolean) {
	Object.defineProperty(window, 'isSecureContext', { value, configurable: true });
}

function asDesktop() {
	secure(true);
	Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true });
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: false,
		media: query,
		addEventListener() {},
		removeEventListener() {}
	}));
}

function asIPhone() {
	secure(true);
	Object.defineProperty(navigator, 'userAgent', {
		value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15',
		configurable: true
	});
}

const realUserAgent = navigator.userAgent;

beforeEach(() => {
	vibrateSpy.mockClear();
	haptics.set(false);
});

afterEach(() => {
	haptics.set(false);
	disposeHaptics();
	vi.unstubAllGlobals();
	Object.defineProperty(navigator, 'userAgent', { value: realUserAgent, configurable: true });
	Reflect.deleteProperty(navigator, 'vibrate');
	document.body.innerHTML = '';
});

describe('capabilities', () => {
	it('reports a motor only on a touch device that exposes vibrate()', () => {
		asAndroidPhone();
		expect(hapticCapabilities()).toEqual({ vibration: true, taptic: false });
		expect(hapticsSupported()).toBe(true);
	});

	it('ignores vibrate() on a desktop pointer, where no motor exists', () => {
		asDesktop();
		expect(hapticCapabilities()).toEqual({ vibration: false, taptic: false });
		expect(hapticsSupported()).toBe(false);
	});

	it('recognizes iOS, which has no Vibration API at all', () => {
		asIPhone();
		expect(hapticCapabilities()).toEqual({ vibration: false, taptic: true });
		expect(hapticsSupported()).toBe(true);
	});

	it('refuses an insecure origin, where Chrome accepts the call and does nothing', () => {
		asAndroidPhone();
		secure(false);
		expect(hapticCapabilities()).toEqual({ vibration: false, taptic: false });
		expect(hapticsSupported()).toBe(false);
	});
});

describe('vibrate', () => {
	beforeEach(asAndroidPhone);

	it('stays silent while the setting is off', () => {
		vibrate('press');
		expect(vibrateSpy).not.toHaveBeenCalled();
	});

	it('plays a sample regardless of the setting', () => {
		sampleVibration('press');
		expect(vibrateSpy).toHaveBeenCalledTimes(1);
	});

	it('sends nothing at all from an insecure origin', () => {
		secure(false);
		haptics.set(true);
		vibrate('press');
		sampleVibration('press');
		expect(vibrateSpy).not.toHaveBeenCalled();
	});

	it('sends a short pulse at full strength, since it cannot be chopped', () => {
		haptics.set(true);
		vibrate('press');
		expect(vibrateSpy).toHaveBeenCalledWith([10]);
	});

	it('chops a long pulse into 20ms cycles to approximate its intensity', () => {
		haptics.set(true);
		vibrate('success');
		// 15ms@0.4 runs whole (under one cycle), 40ms gap, then 25ms@0.7 becomes
		// 14 on / 6 off / 5 on, 60ms gap, then 35ms@1.0 runs whole
		expect(vibrateSpy).toHaveBeenCalledWith([15, 40, 14, 6, 5, 60, 35]);
	});

	it('keeps the on/off alternation across every pattern', () => {
		haptics.set(true);
		for (const pattern of ['press', 'hold', 'step', 'commit', 'success', 'error'] as const) {
			vibrateSpy.mockClear();
			vibrate(pattern);
			const timings = vibrateSpy.mock.calls[0][0] as number[];
			expect(timings.length % 2).toBe(1);
			expect(timings.every((value) => value >= 0)).toBe(true);
		}
	});
});

describe('iOS feedback', () => {
	beforeEach(asIPhone);

	it('clicks an offscreen switch, which drives the Taptic Engine', () => {
		haptics.set(true);
		vibrate('press');

		const input = document.querySelector('input[switch]') as HTMLInputElement;
		expect(input).not.toBeNull();
		expect(input.checked).toBe(true);
		// display:none stops the feedback, so the element stays rendered
		expect((input.parentElement as HTMLElement).style.opacity).toBe('0.01');
	});

	it('spaces a multi-pulse pattern out over time, first click synchronous', () => {
		vi.useFakeTimers();
		haptics.set(true);
		vibrate('hold');

		// a label click also retargets to its input, so only the label's own
		// events count one toggle each
		const label = document.querySelector('label')!;
		const clicks = vi.fn();
		label.addEventListener('click', (event) => {
			if (event.target === label) clicks();
		});

		expect(clicks).toHaveBeenCalledTimes(0);
		vi.advanceTimersByTime(25);
		expect(clicks).toHaveBeenCalledTimes(0);
		vi.advanceTimersByTime(10);
		expect(clicks).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it('reuses one switch element across patterns', () => {
		haptics.set(true);
		vibrate('press');
		vibrate('step');
		expect(document.querySelectorAll('input[switch]')).toHaveLength(1);
	});

	it('removes the switch when disposed', () => {
		haptics.set(true);
		vibrate('press');
		disposeHaptics();
		expect(document.querySelector('input[switch]')).toBeNull();
	});
});

describe('startPressFeedback', () => {
	beforeEach(asAndroidPhone);

	function press(node: Element) {
		node.dispatchEvent(new Event('pointerdown', { bubbles: true }));
	}

	function type(node: Element, key: string, repeat = false) {
		node.dispatchEvent(new KeyboardEvent('keydown', { key, repeat, bubbles: true }));
	}

	it('answers presses on pressable surfaces only', () => {
		document.body.innerHTML = `
			<button class="pressable"><span class="label">On</span></button>
			<div class="tile">Static</div>`;
		const stop = startPressFeedback();
		haptics.set(true);

		press(document.querySelector('.label')!);
		expect(vibrateSpy).toHaveBeenCalledTimes(1);

		press(document.querySelector('.tile')!);
		expect(vibrateSpy).toHaveBeenCalledTimes(1);

		stop();
		press(document.querySelector('.label')!);
		expect(vibrateSpy).toHaveBeenCalledTimes(1);
	});

	it('answers keyboard activation, which produces no pointer event', () => {
		document.body.innerHTML = '<button class="pressable">On</button>';
		const stop = startPressFeedback();
		haptics.set(true);
		const target = document.querySelector('.pressable')!;

		type(target, 'Enter');
		type(target, ' ');
		expect(vibrateSpy).toHaveBeenCalledTimes(2);

		type(target, 'Tab');
		type(target, 'Enter', true);
		expect(vibrateSpy).toHaveBeenCalledTimes(2);
		stop();
	});

	it('ignores presses while the setting is off', () => {
		document.body.innerHTML = '<button class="pressable">On</button>';
		const stop = startPressFeedback();
		press(document.querySelector('.pressable')!);
		type(document.querySelector('.pressable')!, 'Enter');
		expect(vibrateSpy).not.toHaveBeenCalled();
		stop();
	});
});
