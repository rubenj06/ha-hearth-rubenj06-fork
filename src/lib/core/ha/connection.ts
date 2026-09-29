import { derived, get, writable } from 'svelte/store';
import {
	createConnection,
	createLongLivedTokenAuth,
	ERR_CANNOT_CONNECT,
	ERR_CONNECTION_LOST,
	ERR_HASS_HOST_REQUIRED,
	ERR_INVALID_AUTH,
	ERR_INVALID_AUTH_CALLBACK,
	ERR_INVALID_HTTPS_TO_HTTP,
	getAuth,
	subscribeConfig,
	subscribeEntities,
	subscribeServices,
	type Auth,
	type AuthData,
	type Connection,
	type HassConfig,
	type HassServices
} from 'home-assistant-js-websocket';
import type { Configuration, PersistentNotification } from '../app/configuration';
import { states } from './entities';

/*
 * The one Home Assistant connection. Everything that reaches the server goes
 * through the stores and functions here: the dashboards never create their own
 * connection or subscriptions.
 */

export const connection = writable<Connection | undefined>();
export const config = writable<HassConfig>();
export const services = writable<HassServices>();

/**
 * booting: no connection has succeeded yet
 * connected: socket open and every subscription live
 * degraded: socket open but a subscription failed, so some data is stale
 * lost: the socket dropped and the library is reconnecting
 */
export type ConnectionHealth = 'booting' | 'connected' | 'degraded' | 'lost';
export const health = writable<ConnectionHealth>('booting');

/** True only while the socket is open; the guard for sending commands. */
export const connected = derived(health, ($health) => $health === 'connected');

/** Latest HEARTH trigger event name, for surfaces that react to remote commands. */
export const event = writable<string | undefined>();

export const persistentNotifications = writable<Record<string, PersistentNotification>>({});

type TriggerListener = (trigger: string) => void;
const triggerListeners = new Set<TriggerListener>();

/** Runs `listener` for every HEARTH trigger event, including repeats of the same name. */
export function subscribeHassTriggers(listener: TriggerListener): () => void {
	triggerListeners.add(listener);
	return () => triggerListeners.delete(listener);
}

type HearthEventListener = (data: Record<string, unknown>) => void;
const hearthEventListeners = new Set<HearthEventListener>();

/** Runs `listener` with the data of every HEARTH event, whatever it carries. */
export function subscribeHearthEvents(listener: HearthEventListener): () => void {
	hearthEventListeners.add(listener);
	return () => hearthEventListeners.delete(listener);
}

const tokenStorage = {
	async loadTokens() {
		try {
			const raw = localStorage.hearthTokens;
			// guard against a missing key or the literal "null"/"undefined" string
			if (!raw || raw === 'null' || raw === 'undefined') return undefined;
			const tokens = JSON.parse(raw);
			// treat a value that isn't actually a token object as no tokens
			if (!tokens?.access_token && !tokens?.refresh_token) return undefined;
			return tokens;
		} catch {
			// corrupt json in localStorage, treat as no tokens
			return undefined;
		}
	},
	saveTokens(tokens: AuthData | null) {
		localStorage.hearthTokens = JSON.stringify(tokens);
	},
	clearTokens() {
		localStorage.removeItem('hearthTokens');
	}
};

/**
 * True while only a new long-lived token can get past authentication: the
 * companion app, where the auth redirect flow does not work, or a configured
 * token that Home Assistant rejects. Cleared once a connection succeeds.
 */
export const tokenNeeded = writable(false);

/**
 * Why the latest attempt failed, cleared when a new run starts or a connection
 * succeeds. invalid_auth covers a rejected token and a failed OAuth exchange;
 * panel_auth is the HA app iframe still waiting for its parent session.
 */
export type ConnectionError =
	'cannot_connect' | 'https_to_http' | 'invalid_auth' | 'panel_auth' | 'unknown';
export const connectionError = writable<ConnectionError | undefined>();

/** Failed attempts in a row for the current run; reset when it starts or succeeds. */
export const failedAttempts = writable(0);

const PANEL_AUTH_PENDING = 'Waiting for Home Assistant panel authentication';

/**
 * HA's /app/<slug> panel embeds this page in a same-origin iframe and exposes
 * the already-authenticated frontend session as window.parent.hassConnection.
 * Reusing that access token skips OAuth, which cannot complete inside the iframe
 * (HA's authorize page reports Invalid redirect URI).
 */
async function accessTokenFromParentHass(): Promise<string | undefined> {
	if (typeof window === 'undefined' || window.parent === window) return;
	try {
		const pending = (
			window.parent as Window & {
				hassConnection?: Promise<{ auth?: { data?: { access_token?: string } } }>;
			}
		).hassConnection;
		if (!pending) return;
		const session = await Promise.race([
			pending,
			new Promise<undefined>((resolve) => {
				setTimeout(() => resolve(undefined), 2000);
			})
		]);
		const token = session?.auth?.data?.access_token;
		return typeof token === 'string' && token.length > 0 ? token : undefined;
	} catch {
		return;
	}
}

function trackSubscription(subscription: Promise<unknown>, channel: string) {
	void subscription.catch((error) => {
		console.error(`Home Assistant ${channel} subscription failed`, error);
		health.update((current) => (current === 'connected' ? 'degraded' : current));
	});
}

export async function authentication(
	configuration: Configuration,
	/** False once a newer startConnection took over; the result is then discarded. */
	isCurrent: () => boolean = () => true
) {
	if (!configuration?.hassUrl) {
		health.set('lost');
		throw new Error('Home Assistant URL is not configured');
	}

	let auth: Auth | undefined;

	try {
		const hassUrl = new URL(configuration.hassUrl, location.origin).href.replace(/\/$/, '');
		if (configuration?.token) {
			auth = createLongLivedTokenAuth(hassUrl, configuration.token);
		} else {
			const parentToken = await accessTokenFromParentHass();
			if (parentToken) {
				auth = createLongLivedTokenAuth(hassUrl, parentToken);
			} else if (navigator.userAgent.includes('Home Assistant')) {
				tokenNeeded.set(true);
				health.set('lost');
				// not a successful authentication: callers must keep retrying until
				// the configuration supplies a long-lived token
				throw new Error('A long-lived access token is required in the companion app');
			} else if (window.parent !== window) {
				// HA app iframe without a parent session yet. Retry until the
				// panel session is ready. OAuth in this frame is rejected with
				// Invalid redirect URI.
				health.set('lost');
				throw new Error(PANEL_AUTH_PENDING);
			} else {
				// Ingress serves this app under /api/hassio_ingress/<token>/.
				// Pass that path as redirect_uri so the callback returns to this
				// app. Strip the query string; the library appends auth_callback
				// itself, and Ingress does not reliably round-trip extra search params.
				const isIngress = location.pathname.includes('/api/hassio_ingress/');
				const redirectUrl = isIngress ? `${location.origin}${location.pathname}` : undefined;
				auth = await getAuth({
					...tokenStorage,
					hassUrl,
					limitHassInstance: true,
					...(redirectUrl && { redirectUrl })
				});
				clearAuthCallback();
				if (auth.expired) await auth.refreshAccessToken();
			}
		}

		const conn = await createConnection({ auth });
		if (!isCurrent()) {
			// a newer configuration is connecting; this socket must not become the app's
			conn.close();
			return;
		}
		tokenNeeded.set(false);
		connectionError.set(undefined);
		failedAttempts.set(0);
		connection.set(conn);

		// the lib fires "ready" inside the Connection constructor, before any
		// listener can be attached, so the initial connect is marked by hand
		health.set('connected');

		// these three keep themselves alive across reconnects inside the library
		subscribeEntities(conn, (hassEntities) => {
			if (get(connection) === conn) states.set(hassEntities);
		});
		subscribeConfig(conn, (hassConfig) => {
			if (get(connection) === conn) config.set(hassConfig);
		});
		subscribeServices(conn, (hassServices) => {
			if (get(connection) === conn) services.set(hassServices);
		});

		conn.addEventListener('ready', () => {
			console.debug('connected.');
			if (get(connection) === conn) health.set('connected');
		});
		conn.addEventListener('disconnected', () => {
			console.debug('connecting...');
			if (get(connection) === conn) health.set('lost');
		});
		conn.addEventListener('reconnect-error', () => {
			console.error('ERR_INVALID_AUTH.');
			if (get(connection) === conn) health.set('lost');
		});

		trackSubscription(
			conn.subscribeMessage(
				(message: { variables?: { trigger?: { event?: { data?: unknown } } } }) => {
					if (get(connection) !== conn) return;
					const data = message?.variables?.trigger?.event?.data;
					if (!data || typeof data !== 'object' || Array.isArray(data)) return;
					for (const listener of hearthEventListeners) listener(data as Record<string, unknown>);
					const trigger = (data as { event?: unknown }).event;
					if (typeof trigger !== 'string') return;
					event.set(trigger);
					for (const listener of triggerListeners) listener(trigger);
					if (trigger === 'refresh') {
						sessionStorage.setItem('event', 'refresh');
						location.reload();
					}
				},
				{
					type: 'subscribe_trigger',
					trigger: { platform: 'event', event_type: 'HEARTH' }
				}
			),
			'HEARTH events'
		);

		trackSubscription(
			conn.subscribeMessage(
				(data: {
					type: 'added' | 'removed' | 'current' | 'updated';
					notifications: Record<string, PersistentNotification>;
				}) => {
					if (get(connection) !== conn) return;
					if (data?.type === 'current') {
						persistentNotifications.set(data?.notifications);
					} else if (data?.type === 'added' || data?.type === 'updated') {
						persistentNotifications.update((notifications) => ({
							...notifications,
							...data?.notifications
						}));
					} else if (data?.type === 'removed') {
						persistentNotifications.update((notifications) => {
							for (const id of Object.keys(data?.notifications)) delete notifications[id];
							return { ...notifications };
						});
					}
				},
				{ type: 'persistent_notification/subscribe' }
			),
			'persistent notifications'
		);
	} catch (error) {
		if (!isCurrent()) return;
		if (error === ERR_INVALID_AUTH && configuration.token) tokenNeeded.set(true);
		handleError(error);
	}
}

function clearAuthCallback() {
	const url = new URL(location.href);
	if (!url.searchParams.has('auth_callback')) return;
	for (const key of ['auth_callback', 'code', 'state']) url.searchParams.delete(key);
	history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

function errorCode(error: unknown): ConnectionError {
	switch (error) {
		case ERR_CANNOT_CONNECT:
		case ERR_CONNECTION_LOST:
			return 'cannot_connect';
		case ERR_INVALID_HTTPS_TO_HTTP:
			return 'https_to_http';
		case ERR_INVALID_AUTH:
		case ERR_INVALID_AUTH_CALLBACK:
			return 'invalid_auth';
		default:
			return error instanceof Error && error.message === PANEL_AUTH_PENDING
				? 'panel_auth'
				: 'unknown';
	}
}

function handleError(error: unknown) {
	connectionError.set(errorCode(error));
	switch (error) {
		case ERR_INVALID_AUTH:
			console.error('ERR_INVALID_AUTH');
			tokenStorage.clearTokens();
			clearAuthCallback();
			break;
		case ERR_INVALID_AUTH_CALLBACK:
			// raised by getAuth() when the auth callback state (client id /
			// hass url) doesn't match, clear the stale tokens and query
			// string so the next retry restarts the auth flow cleanly
			console.error('ERR_INVALID_AUTH_CALLBACK');
			tokenStorage.clearTokens();
			clearAuthCallback();
			break;
		case ERR_CANNOT_CONNECT:
			console.error('ERR_CANNOT_CONNECT');
			break;
		case ERR_CONNECTION_LOST:
			console.error('ERR_CONNECTION_LOST');
			break;
		case ERR_HASS_HOST_REQUIRED:
			console.error('ERR_HASS_HOST_REQUIRED');
			break;
		case ERR_INVALID_HTTPS_TO_HTTP:
			console.error('ERR_INVALID_HTTPS_TO_HTTP');
			break;
		default:
			if (error instanceof Error && error.message === PANEL_AUTH_PENDING) break;
			console.error(error);
	}
	throw error;
}

const RETRY_MS = 3000;
let retryTimer: ReturnType<typeof setInterval> | undefined;
// bumped by every start, so an attempt from a superseded run cannot stop the
// retry loop of the run that replaced it
let currentRun = 0;

/**
 * Authenticates and keeps retrying every few seconds until it succeeds. Calling
 * it again (after the token changed, say) restarts the loop; the library owns
 * reconnects once a connection exists, so success ends the loop for good.
 */
export function startConnection(configuration: Configuration) {
	stopConnection();
	connectionError.set(undefined);
	failedAttempts.set(0);
	const run = ++currentRun;
	let connecting = false;
	const attempt = async () => {
		if (connecting || run !== currentRun) return;
		connecting = true;
		try {
			await authentication(configuration, () => run === currentRun);
			if (run === currentRun) {
				clearInterval(retryTimer);
				retryTimer = undefined;
			}
		} catch {
			// retried on the interval
			if (run === currentRun) failedAttempts.update((count) => count + 1);
		} finally {
			connecting = false;
		}
	};
	void attempt();
	retryTimer = setInterval(attempt, RETRY_MS);
	return stopConnection;
}

export function stopConnection() {
	if (retryTimer) clearInterval(retryTimer);
	retryTimer = undefined;
	// an attempt still awaiting createConnection sees a stale run and discards its socket
	currentRun += 1;
	const previous = get(connection);
	connection.set(undefined);
	previous?.close();
	health.set('booting');
}

/** The live connection, or undefined while booting. */
export function currentConnection(): Connection | undefined {
	return get(connection);
}
