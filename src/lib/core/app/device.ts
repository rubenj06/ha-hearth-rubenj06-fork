import { writable } from 'svelte/store';

/*
 * The name this screen answers to when a Home Assistant event targets one
 * device. It belongs to the browser, not to configuration.yaml, which every
 * screen on the same server shares. A ?device= parameter in the start URL
 * wins for that session, for kiosk browsers whose storage is wiped.
 */

const STORAGE_KEY = 'hearthDevice';

function initialName(): string {
	try {
		const fromUrl = new URLSearchParams(location.search).get('device');
		return (fromUrl ?? localStorage.getItem(STORAGE_KEY) ?? '').trim();
	} catch {
		// no window during SSR, or storage blocked by the browser
		return '';
	}
}

export const deviceName = writable(initialName());

export function saveDeviceName(name: string) {
	const trimmed = name.trim();
	try {
		if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// storage blocked: the name still holds until the page reloads
	}
	deviceName.set(trimmed);
}
