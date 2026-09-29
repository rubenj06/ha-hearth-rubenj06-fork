import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import type { HassConfig, HassEntities } from 'home-assistant-js-websocket';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { motion } from '$lib/core/app/motion';
import { config as haConfig } from '$lib/core/ha/connection';
import { states } from '$lib/core/ha/entities';
import { DEFAULT_HEARTH_CONFIG, type HearthConfig } from './config';
import { activeAlerts, hearthConfig, requestWake, screensaverPreview } from './store';
import Screensaver from './Screensaver.svelte';

// the real map pulls in Leaflet and the network; this stands in with its props
const radarStub = vi.hoisted(() => ({ frames: true }));
vi.mock('./screensaver/RadarMap.svelte', () => ({
	default: (anchor: Comment, props: { view: unknown; onready?: (ready: boolean) => void }) => {
		const map = document.createElement('div');
		map.className = 'radar-map-stub';
		map.textContent = JSON.stringify(props.view);
		anchor.before(map);
		props.onready?.(radarStub.frames);
	}
}));

function configure(settings: Partial<HearthConfig>) {
	hearthConfig.set({ ...structuredClone(DEFAULT_HEARTH_CONFIG), ...settings });
}

async function showScreensaver() {
	const view = render(Screensaver, { minutes: 1 });
	vi.advanceTimersByTime(60_000);
	await tick();
	const overlay = view.container.querySelector('.screensaver') as HTMLElement;
	expect(overlay).not.toBeNull();
	return { ...view, overlay };
}

function cardUnderneath() {
	const card = document.createElement('button');
	const onclick = vi.fn();
	card.addEventListener('click', onclick);
	document.body.append(card);
	return { card, onclick };
}

describe('Screensaver', () => {
	// jsdom has no Web Animations; Svelte transitions call element.animate
	beforeAll(() => {
		Element.prototype.animate ??= () =>
			({ cancel() {}, finished: Promise.resolve() }) as unknown as Animation;
	});

	beforeEach(() => {
		vi.useFakeTimers();
		motion.set(0);
	});

	afterEach(() => {
		vi.useRealTimers();
		motion.set(190);
		document.body.innerHTML = '';
		screensaverPreview.set(false);
		radarStub.frames = true;
		configure({});
		haConfig.set(undefined as unknown as HassConfig);
		states.set({});
	});

	it('stays away while an alert card is on screen', async () => {
		activeAlerts.set([{ key: 'event:a', title: 'A', severity: 'info', popup: true, since: 1 }]);
		const { container } = render(Screensaver, { minutes: 1 });
		vi.advanceTimersByTime(5 * 60_000);
		await tick();
		expect(container.querySelector('.screensaver')).toBeNull();
		activeAlerts.set([]);
		vi.advanceTimersByTime(60_000);
		await tick();
		expect(container.querySelector('.screensaver')).not.toBeNull();
	});

	it('steps aside when something asks to be seen', async () => {
		const { container } = await showScreensaver();
		requestWake();
		await tick();
		expect(container.querySelector('.screensaver')).toBeNull();
	});

	it('keeps the click of the wake tap from reaching the card underneath', async () => {
		const { container, overlay } = await showScreensaver();
		const { card, onclick } = cardUnderneath();

		await fireEvent.pointerDown(overlay);
		await tick();
		expect(container.querySelector('.screensaver')).toBeNull();

		await fireEvent.pointerUp(card);
		await fireEvent.click(card);
		expect(onclick).not.toHaveBeenCalled();
	});

	it('lets the next tap through once the wake click is spent', async () => {
		const { overlay } = await showScreensaver();
		const { card, onclick } = cardUnderneath();

		await fireEvent.pointerDown(overlay);
		await fireEvent.pointerUp(card);
		await fireEvent.click(card);
		await fireEvent.click(card);
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	it('stops waiting for a click that never follows the release', async () => {
		const { overlay } = await showScreensaver();
		const { card, onclick } = cardUnderneath();

		await fireEvent.pointerDown(overlay);
		await fireEvent.pointerUp(card);
		vi.advanceTimersByTime(300);
		await fireEvent.click(card);
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	it('wakes on a key press without swallowing a later click', async () => {
		const { container, overlay } = await showScreensaver();
		const { card, onclick } = cardUnderneath();

		await fireEvent.keyDown(overlay, { key: 'a' });
		await tick();
		expect(container.querySelector('.screensaver')).toBeNull();
		await fireEvent.click(card);
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	it('takes focus while showing and hands it back on Escape', async () => {
		const { card } = cardUnderneath();
		card.focus();
		const { container, overlay } = await showScreensaver();
		expect(document.activeElement).toBe(overlay);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
		await tick();
		expect(container.querySelector('.screensaver')).toBeNull();
		expect(document.activeElement).toBe(card);
	});

	it('shows at once on preview, with no idle timeout, and ends the preview on wake', async () => {
		const { container } = render(Screensaver);
		expect(container.querySelector('.screensaver')).toBeNull();
		screensaverPreview.set(true);
		await tick();
		const overlay = container.querySelector('.screensaver') as HTMLElement;
		expect(overlay).not.toBeNull();

		await fireEvent.keyDown(overlay, { key: 'a' });
		await tick();
		expect(container.querySelector('.screensaver')).toBeNull();
		expect(get(screensaverPreview)).toBe(false);
	});

	it('draws the radar map at the Home Assistant home behind a scrim', async () => {
		haConfig.set({ latitude: 51.1, longitude: 17 } as HassConfig);
		configure({ screensaver_background: 'radar', screensaver_radar: { zoom: 5 } });
		const { container } = await showScreensaver();
		vi.useRealTimers();
		await waitFor(() => expect(container.querySelector('.radar-map-stub')).not.toBeNull());
		expect(JSON.parse(container.querySelector('.radar-map-stub')!.textContent!)).toMatchObject({
			latitude: 51.1,
			longitude: 17,
			zoom: 5,
			basemap: 'dark'
		});
		await waitFor(() => expect(container.querySelector('.scrim')).not.toBeNull());
	});

	it('wakes from the radar sleep screen when an alert asks for the screen', async () => {
		haConfig.set({ latitude: 51.1, longitude: 17 } as HassConfig);
		configure({ screensaver_background: 'radar' });
		screensaverPreview.set(true);
		const { container } = render(Screensaver);
		await tick();
		expect(container.querySelector('.screensaver')).not.toBeNull();

		requestWake();
		await tick();
		expect(container.querySelector('.screensaver')).toBeNull();
		expect(get(screensaverPreview)).toBe(false);
	});

	it('keeps the plain background and dim text while the radar has no frames', async () => {
		radarStub.frames = false;
		haConfig.set({ latitude: 51.1, longitude: 17 } as HassConfig);
		configure({ screensaver_background: 'radar' });
		const { container } = await showScreensaver();
		vi.useRealTimers();
		await waitFor(() => expect(container.querySelector('.radar-map-stub')).not.toBeNull());
		expect(container.querySelector('.scrim')).toBeNull();
		const content = container.querySelector('.screensaver-content') as HTMLElement;
		expect(content.style.getPropertyValue('--screensaver-brightness')).toBe('0.32');
	});

	it('uses an explicit radar location over the home', async () => {
		haConfig.set({ latitude: 51.1, longitude: 17 } as HassConfig);
		configure({
			screensaver_background: 'radar',
			screensaver_radar: { latitude: 40.4, longitude: -3.7, basemap: 'light' }
		});
		const { container } = await showScreensaver();
		vi.useRealTimers();
		await waitFor(() => expect(container.querySelector('.radar-map-stub')).not.toBeNull());
		expect(JSON.parse(container.querySelector('.radar-map-stub')!.textContent!)).toMatchObject({
			latitude: 40.4,
			longitude: -3.7,
			basemap: 'light'
		});
	});

	it('stays plain black when the radar has no location to show', async () => {
		configure({ screensaver_background: 'radar' });
		const { container } = await showScreensaver();
		await tick();
		expect(container.querySelector('.radar-map-stub')).toBeNull();
		expect(container.querySelector('.scrim')).toBeNull();
	});

	it('shows the image background and falls back to black when it fails to load', async () => {
		configure({ screensaver_background: 'image', screensaver_image: 'https://example.com/a.jpg' });
		const { container } = await showScreensaver();
		const photo = container.querySelector('img.photo') as HTMLImageElement;
		expect(photo.src).toBe('https://example.com/a.jpg');
		expect(container.querySelector('.scrim')).not.toBeNull();

		await fireEvent.error(photo);
		expect(container.querySelector('img.photo')).toBeNull();
		expect(container.querySelector('.scrim')).toBeNull();
	});

	it('tries a failed image again on the next sleep', async () => {
		configure({ screensaver_background: 'image', screensaver_image: 'https://example.com/a.jpg' });
		const { container, overlay } = await showScreensaver();
		await fireEvent.error(container.querySelector('img.photo')!);
		await fireEvent.keyDown(overlay, { key: 'a' });
		await tick();
		expect(container.querySelector('.screensaver')).toBeNull();

		vi.advanceTimersByTime(60_000);
		await tick();
		expect(container.querySelector('img.photo')).not.toBeNull();
	});

	it('ignores the image while the background is not set to image', async () => {
		configure({ screensaver_image: 'https://example.com/a.jpg' });
		const { container } = await showScreensaver();
		expect(container.querySelector('img.photo')).toBeNull();
	});

	it('hides the date, sizes the clock and shows the weather when configured', async () => {
		states.set({
			'weather.home': {
				entity_id: 'weather.home',
				state: 'partlycloudy',
				attributes: { temperature: 17.6 }
			}
		} as unknown as HassEntities);
		configure({
			screensaver_show_date: false,
			screensaver_clock_size: 'large',
			screensaver_weather_entity: 'weather.home'
		});
		const { container } = await showScreensaver();
		expect(container.querySelector('.date')).toBeNull();
		expect(container.querySelector('.screensaver-content.clock-large')).not.toBeNull();
		expect(container.querySelector('.weather')?.textContent).toContain('18°');
	});
});
