import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createConnection,
	ERR_INVALID_AUTH_CALLBACK,
	ERR_CANNOT_CONNECT,
	ERR_INVALID_AUTH,
	ERR_INVALID_HTTPS_TO_HTTP,
	type Connection
} from 'home-assistant-js-websocket';
import {
	authentication,
	connected,
	connection,
	connectionError,
	failedAttempts,
	health,
	startConnection,
	stopConnection,
	tokenNeeded
} from './connection';

vi.mock('home-assistant-js-websocket', async (importOriginal) => ({
	...(await importOriginal<typeof import('home-assistant-js-websocket')>()),
	createConnection: vi.fn(),
	subscribeEntities: vi.fn(),
	subscribeConfig: vi.fn(),
	subscribeServices: vi.fn()
}));

const windowParent = window.parent;

afterEach(() => {
	stopConnection();
	vi.useRealTimers();
	vi.clearAllMocks();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	Object.defineProperty(window, 'parent', { value: windowParent, configurable: true });
	localStorage.clear();
	tokenNeeded.set(false);
	connectionError.set(undefined);
	failedAttempts.set(0);
});

describe('authentication', () => {
	it('keeps the caller retrying when the Home Assistant URL is missing', async () => {
		health.set('connected');
		await expect(authentication({})).rejects.toThrow('Home Assistant URL is not configured');
		expect(get(health)).toBe('lost');
		expect(get(connected)).toBe(false);
	});

	it('keeps a successful socket alive until its owner stops it', async () => {
		vi.useFakeTimers();
		const close = vi.fn();
		const socket = {
			close,
			addEventListener: vi.fn(),
			subscribeMessage: vi.fn(async () => async () => {})
		} as unknown as Connection;
		vi.mocked(createConnection).mockResolvedValue(socket);
		startConnection({ hassUrl: 'http://localhost:8123', token: 'test' });
		await vi.advanceTimersByTimeAsync(10_000);
		expect(createConnection).toHaveBeenCalledOnce();
		expect(get(connection)).toBe(socket);
		expect(close).not.toHaveBeenCalled();
		stopConnection();
		expect(close).toHaveBeenCalledOnce();
		expect(get(connection)).toBeUndefined();
		expect(get(connected)).toBe(false);
	});
});

describe('tokenNeeded', () => {
	const socket = {
		close: vi.fn(),
		addEventListener: vi.fn(),
		subscribeMessage: vi.fn(async () => async () => {})
	} as unknown as Connection;

	it('is set in the companion app without a configured token', async () => {
		vi.stubGlobal('navigator', { userAgent: 'Home Assistant/2026.9 (io.robbie.HomeAssistant)' });
		await expect(authentication({ hassUrl: 'http://localhost:8123' })).rejects.toThrow(
			'A long-lived access token is required'
		);
		expect(get(tokenNeeded)).toBe(true);
	});

	it('is set when Home Assistant rejects the configured token', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(createConnection).mockRejectedValue(ERR_INVALID_AUTH);
		await expect(
			authentication({ hassUrl: 'http://localhost:8123', token: 'revoked' })
		).rejects.toBe(ERR_INVALID_AUTH);
		expect(get(tokenNeeded)).toBe(true);
	});

	it('stays unset when the socket cannot connect with a configured token', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(createConnection).mockRejectedValue(ERR_CANNOT_CONNECT);
		await expect(authentication({ hassUrl: 'http://localhost:8123', token: 'test' })).rejects.toBe(
			ERR_CANNOT_CONNECT
		);
		expect(get(tokenNeeded)).toBe(false);
	});

	it('stays unset in a browser that authenticates through OAuth', async () => {
		const navigation = { href: '' };
		vi.stubGlobal('document', { location: navigation });
		void authentication({ hassUrl: 'http://localhost:8123' });
		await vi.waitFor(() => expect(navigation.href).not.toBe(''));
		expect(get(tokenNeeded)).toBe(false);
	});

	it('clears once a connection succeeds', async () => {
		tokenNeeded.set(true);
		vi.mocked(createConnection).mockResolvedValue(socket);
		await authentication({ hassUrl: 'http://localhost:8123', token: 'new' });
		expect(get(tokenNeeded)).toBe(false);
	});
});

describe('connectionError', () => {
	const socket = {
		close: vi.fn(),
		addEventListener: vi.fn(),
		subscribeMessage: vi.fn(async () => async () => {})
	} as unknown as Connection;

	it.each([
		[ERR_CANNOT_CONNECT, 'cannot_connect'],
		[ERR_INVALID_HTTPS_TO_HTTP, 'https_to_http'],
		[ERR_INVALID_AUTH, 'invalid_auth'],
		[new Error('socket exploded'), 'unknown']
	])('names the cause of failure %s', async (failure, code) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(createConnection).mockRejectedValue(failure);
		await expect(authentication({ hassUrl: 'http://localhost:8123', token: 'test' })).rejects.toBe(
			failure
		);
		expect(get(connectionError)).toBe(code);
	});

	it('reports the HA app iframe waiting for its panel session', async () => {
		Object.defineProperty(window, 'parent', { configurable: true, value: {} });
		await expect(authentication({ hassUrl: '/' })).rejects.toThrow();
		expect(get(connectionError)).toBe('panel_auth');
	});

	it('counts failed attempts and clears both once a retry connects', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(createConnection)
			.mockRejectedValueOnce(ERR_CANNOT_CONNECT)
			.mockRejectedValueOnce(ERR_CANNOT_CONNECT)
			.mockResolvedValue(socket);
		startConnection({ hassUrl: 'http://localhost:8123', token: 'test' });
		await vi.advanceTimersByTimeAsync(3001);
		expect(get(failedAttempts)).toBe(2);
		expect(get(connectionError)).toBe('cannot_connect');
		await vi.advanceTimersByTimeAsync(3000);
		expect(get(connected)).toBe(true);
		expect(get(failedAttempts)).toBe(0);
		expect(get(connectionError)).toBeUndefined();
	});

	it('starts a new run with a clean slate', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(createConnection).mockRejectedValue(ERR_INVALID_AUTH);
		startConnection({ hassUrl: 'http://localhost:8123', token: 'old' });
		await vi.advanceTimersByTimeAsync(0);
		expect(get(connectionError)).toBe('invalid_auth');
		expect(get(failedAttempts)).toBe(1);
		vi.mocked(createConnection).mockReturnValue(new Promise(() => {}));
		startConnection({ hassUrl: 'http://localhost:8123', token: 'new' });
		expect(get(connectionError)).toBeUndefined();
		expect(get(failedAttempts)).toBe(0);
	});
});

describe('Ingress authentication', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'location',
			new URL(
				'https://example.ui.nabu.casa/api/hassio_ingress/session/?room=living&theme=amber&menu=false#panel'
			)
		);
		vi.mocked(createConnection).mockResolvedValue({
			close: vi.fn(),
			addEventListener: vi.fn(),
			subscribeMessage: vi.fn(async () => async () => {})
		} as unknown as Connection);
	});

	it('redirects to HTTPS OAuth and retains the Ingress callback path, ignoring internal cached tokens', async () => {
		localStorage.hearthTokens = JSON.stringify({
			hassUrl: 'http://homeassistant.local:8123',
			access_token: 'old',
			expires: Date.now() + 60000
		});
		const navigation = { href: '' };
		vi.stubGlobal('document', { location: navigation });
		// getAuth intentionally never resolves after navigating away.
		void authentication({ hassUrl: '/' });
		await vi.waitFor(() => expect(navigation.href).not.toBe(''));
		const authorize = new URL(navigation.href);
		expect(authorize.origin + authorize.pathname).toBe(
			'https://example.ui.nabu.casa/auth/authorize'
		);
		expect(authorize.searchParams.get('redirect_uri')).toBe(
			'https://example.ui.nabu.casa/api/hassio_ingress/session/?auth_callback=1'
		);
		expect(JSON.parse(atob(authorize.searchParams.get('state')!)).hassUrl).toBe(
			'https://example.ui.nabu.casa'
		);
		expect(createConnection).not.toHaveBeenCalled();
	});

	it('exchanges the callback code over HTTPS and connects over WSS', async () => {
		const callback = new URL(location.href);
		callback.searchParams.set('auth_callback', '1');
		callback.searchParams.set('code', 'test-code');
		callback.searchParams.set(
			'state',
			btoa(JSON.stringify({ hassUrl: callback.origin, clientId: callback.origin + '/' }))
		);
		vi.stubGlobal('location', callback);
		vi.spyOn(history, 'replaceState').mockImplementation((_state, _title, url) => {
			vi.stubGlobal('location', new URL(String(url), location.origin));
		});
		const fetch = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 1800 })
				)
			);
		vi.stubGlobal('fetch', fetch);
		await authentication({ hassUrl: '/' });
		expect(location.search + location.hash).toBe('?room=living&theme=amber&menu=false#panel');
		expect(fetch).toHaveBeenCalledWith(
			'https://example.ui.nabu.casa/auth/token',
			expect.objectContaining({ method: 'POST' })
		);
		expect(vi.mocked(createConnection).mock.calls[0][0]?.auth?.wsUrl).toBe(
			'wss://example.ui.nabu.casa/api/websocket'
		);
	});

	it('rejects a stale internal OAuth callback before attempting an HTTP token exchange', async () => {
		const callback = new URL(location.href);
		callback.searchParams.set('auth_callback', '1');
		callback.searchParams.set('code', 'test-code');
		callback.searchParams.set(
			'state',
			btoa(
				JSON.stringify({
					hassUrl: 'http://homeassistant.local:8123',
					clientId: callback.origin + '/'
				})
			)
		);
		vi.stubGlobal('location', callback);
		vi.spyOn(history, 'replaceState').mockImplementation((_state, _title, url) => {
			vi.stubGlobal('location', new URL(String(url), location.origin));
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await expect(authentication({ hassUrl: '/' })).rejects.toBe(ERR_INVALID_AUTH_CALLBACK);
		expect(fetch).not.toHaveBeenCalled();
		expect(location.pathname + location.search + location.hash).toBe(
			'/api/hassio_ingress/session/?room=living&theme=amber&menu=false#panel'
		);
	});

	it('retries a failed socket using saved tokens without redeeming the consumed code again', async () => {
		vi.useFakeTimers();
		const callback = new URL(location.href);
		callback.searchParams.set('auth_callback', '1');
		callback.searchParams.set('code', 'one-time-code');
		callback.searchParams.set(
			'state',
			btoa(JSON.stringify({ hassUrl: callback.origin, clientId: callback.origin + '/' }))
		);
		vi.stubGlobal('location', callback);
		vi.spyOn(history, 'replaceState').mockImplementation((_state, _title, url) => {
			vi.stubGlobal('location', new URL(String(url), location.origin));
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetch = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 1800 })
				)
			);
		vi.stubGlobal('fetch', fetch);
		vi.mocked(createConnection).mockRejectedValueOnce(ERR_CANNOT_CONNECT);
		startConnection({ hassUrl: '/' });
		await vi.advanceTimersByTimeAsync(3001);
		expect(fetch).toHaveBeenCalledOnce();
		expect(createConnection).toHaveBeenCalledTimes(2);
		expect(get(connected)).toBe(true);
		expect(location.search + location.hash).toBe('?room=living&theme=amber&menu=false#panel');
	});

	it('removes an invalid code and restarts authorization on retry with a clean Ingress callback path', async () => {
		vi.useFakeTimers();
		const callback = new URL(location.href);
		callback.searchParams.set('auth_callback', '1');
		callback.searchParams.set('code', 'expired-code');
		callback.searchParams.set(
			'state',
			btoa(JSON.stringify({ hassUrl: callback.origin, clientId: callback.origin + '/' }))
		);
		vi.stubGlobal('location', callback);
		vi.spyOn(history, 'replaceState').mockImplementation((_state, _title, url) => {
			vi.stubGlobal('location', new URL(String(url), location.origin));
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }));
		vi.stubGlobal('fetch', fetch);
		localStorage.hearthTokens = JSON.stringify({ access_token: 'stale' });
		await expect(authentication({ hassUrl: '/' })).rejects.toBe(ERR_INVALID_AUTH);
		expect(localStorage.hearthTokens).toBeUndefined();
		expect(location.search + location.hash).toBe('?room=living&theme=amber&menu=false#panel');
		const navigation = { href: '' };
		vi.stubGlobal('document', { location: navigation });
		startConnection({ hassUrl: '/' });
		await vi.advanceTimersByTimeAsync(3001);
		expect(fetch).toHaveBeenCalledOnce();
		const redirect = new URL(new URL(navigation.href).searchParams.get('redirect_uri')!);
		expect(redirect.pathname).toBe('/api/hassio_ingress/session/');
		expect([...redirect.searchParams.keys()]).toEqual(['auth_callback']);
		expect(redirect.searchParams.has('code')).toBe(false);
		expect(createConnection).not.toHaveBeenCalled();
	});

	it('uses the parent Home Assistant panel token when embedded as an app', async () => {
		vi.mocked(createConnection).mockResolvedValue({
			close: vi.fn(),
			addEventListener: vi.fn(),
			subscribeMessage: vi.fn(async () => async () => {})
		} as unknown as Connection);
		Object.defineProperty(window, 'parent', {
			configurable: true,
			value: {
				hassConnection: Promise.resolve({
					auth: { data: { access_token: 'panel-token' } }
				})
			}
		});
		const navigation = { href: '' };
		vi.stubGlobal('document', { location: navigation });
		await authentication({ hassUrl: '/' });
		expect(navigation.href).toBe('');
		expect(vi.mocked(createConnection).mock.calls[0][0]?.auth?.data?.access_token).toBe(
			'panel-token'
		);
	});

	it('does not start OAuth inside a Home Assistant app iframe', async () => {
		Object.defineProperty(window, 'parent', {
			configurable: true,
			value: {}
		});
		const navigation = { href: '' };
		vi.stubGlobal('document', { location: navigation });
		await expect(authentication({ hassUrl: '/' })).rejects.toThrow(
			'Waiting for Home Assistant panel authentication'
		);
		expect(navigation.href).toBe('');
		expect(createConnection).not.toHaveBeenCalled();
	});

	it.each([
		['https://example.ui.nabu.casa', '/', 'wss://example.ui.nabu.casa/api/websocket'],
		['http://homeassistant.local:8123', '/', 'ws://homeassistant.local:8123/api/websocket'],
		['https://hearth.example.com', 'https://ha.example.com/', 'wss://ha.example.com/api/websocket']
	])(
		'uses the correct WebSocket URL for token authentication from %s',
		async (origin, hassUrl, wsUrl) => {
			vi.stubGlobal('location', new URL(origin + '/api/hassio_ingress/session/'));
			await authentication({ hassUrl, token: 'test' });
			expect(vi.mocked(createConnection).mock.calls[0][0]?.auth?.wsUrl).toBe(wsUrl);
		}
	);
});
