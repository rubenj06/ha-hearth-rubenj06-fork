import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from 'home-assistant-js-websocket';
import { playCamera } from './camera';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function videoElement() {
	return {
		src: '',
		srcObject: null,
		canPlayType: vi.fn(() => 'probably'),
		play: vi.fn(async () => {}),
		pause: vi.fn(),
		load: vi.fn(),
		removeAttribute: vi.fn()
	} as unknown as HTMLVideoElement;
}

function capabilities(types: string[], respond: (message: { type: string }) => Promise<unknown>) {
	return vi.fn(async (message: { type: string }) =>
		message.type === 'camera/capabilities' ? { frontend_stream_types: types } : respond(message)
	);
}

describe('camera session ownership', () => {
	it('disposes native HLS playback once when its owner aborts', async () => {
		const sendMessagePromise = capabilities(['hls'], async () => ({
			url: '/api/hls/stream.m3u8'
		}));
		const connection = { sendMessagePromise } as unknown as Connection;
		const controller = new AbortController();
		const video = videoElement();
		const onError = vi.fn();
		await playCamera(connection, video, 'camera.door', controller.signal, onError);
		expect(video.src).toBe('/api/hls/stream.m3u8');
		controller.abort();
		controller.abort();
		expect(video.pause).toHaveBeenCalledTimes(1);
		expect(video.removeAttribute).toHaveBeenCalledWith('src');
		expect(onError).not.toHaveBeenCalled();
	});

	it('cannot attach a stream returned after cancellation', async () => {
		let resolve!: (value: { url: string }) => void;
		const connection = {
			sendMessagePromise: capabilities(['hls'], () => new Promise((r) => (resolve = r)))
		} as unknown as Connection;
		const controller = new AbortController();
		const video = videoElement();
		const loading = playCamera(connection, video, 'camera.door', controller.signal, vi.fn());
		await vi.waitFor(() => expect(resolve).toBeDefined());
		controller.abort();
		resolve({ url: '/late.m3u8' });
		await loading;
		expect(video.src).toBe('');
		expect(video.play).not.toHaveBeenCalled();
	});

	it('reports a failed stream request and releases the media element', async () => {
		const connection = {
			sendMessagePromise: capabilities(['hls'], async () => {
				throw new Error('offline');
			})
		} as unknown as Connection;
		const video = videoElement();
		const onError = vi.fn();
		await playCamera(connection, video, 'camera.door', new AbortController().signal, onError);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(video.pause).toHaveBeenCalledTimes(1);
	});

	it('closes WebRTC media and an asynchronously established signaling subscription', async () => {
		const close = vi.fn(),
			stopTrack = vi.fn(),
			unsubscribe = vi.fn(async () => {});
		vi.stubGlobal(
			'RTCPeerConnection',
			class {
				addTransceiver = vi.fn();
				createOffer = vi.fn(async () => ({ sdp: 'offer' }));
				setLocalDescription = vi.fn(async () => {});
				close = close;
			}
		);
		vi.stubGlobal(
			'MediaStream',
			class {
				getTracks() {
					return [{ stop: stopTrack }];
				}
			}
		);
		let resolve!: (stop: () => Promise<void>) => void;
		const subscribeMessage = vi.fn(() => new Promise((r) => (resolve = r)));
		const connection = {
			sendMessagePromise: capabilities(['web_rtc', 'hls'], async () => ({})),
			subscribeMessage
		} as unknown as Connection;
		const video = videoElement(),
			controller = new AbortController();
		const loading = playCamera(connection, video, 'camera.door', controller.signal, vi.fn());
		await vi.waitFor(() => expect(subscribeMessage).toHaveBeenCalledOnce());
		controller.abort();
		resolve(unsubscribe);
		await loading;
		expect(close).toHaveBeenCalledOnce();
		expect(stopTrack).toHaveBeenCalledOnce();
		expect(unsubscribe).toHaveBeenCalledOnce();
		expect(video.srcObject).toBeNull();
	});
	it('does not request an HLS stream from a WebRTC-only camera', async () => {
		vi.stubGlobal(
			'RTCPeerConnection',
			class {
				addTransceiver = vi.fn();
				createOffer = vi.fn(async () => ({ sdp: 'offer' }));
				setLocalDescription = vi.fn(async () => {});
				close = vi.fn();
			}
		);
		vi.stubGlobal('MediaStream', class {});
		const sendMessagePromise = capabilities(['web_rtc'], async () => ({}));
		const subscribeMessage = vi.fn(async () => async () => {});
		const connection = { sendMessagePromise, subscribeMessage } as unknown as Connection;
		const onError = vi.fn();
		await playCamera(
			connection,
			videoElement(),
			'camera.door',
			new AbortController().signal,
			onError
		);
		const types = sendMessagePromise.mock.calls.map(([message]) => message.type);
		expect(types).not.toContain('camera/stream');
		expect(subscribeMessage).toHaveBeenCalledOnce();
		expect(onError).not.toHaveBeenCalled();
	});

	it('leaves a camera without stream types on its snapshot without requesting a stream', async () => {
		const sendMessagePromise = capabilities([], async () => ({ url: '/stream.m3u8' }));
		const connection = { sendMessagePromise } as unknown as Connection;
		const onError = vi.fn();
		await playCamera(
			connection,
			videoElement(),
			'camera.door',
			new AbortController().signal,
			onError
		);
		expect(sendMessagePromise).toHaveBeenCalledOnce();
		expect(onError).not.toHaveBeenCalled();
	});
});

/** Peer connections the code under test creates, so a test can drive their state. */
function stubWebRtc() {
	const peers: {
		connectionState: RTCPeerConnectionState;
		onconnectionstatechange: (() => void) | null;
		close: ReturnType<typeof vi.fn>;
	}[] = [];
	vi.stubGlobal(
		'RTCPeerConnection',
		class {
			connectionState: RTCPeerConnectionState = 'new';
			onconnectionstatechange: (() => void) | null = null;
			addTransceiver = vi.fn();
			createOffer = vi.fn(async () => ({ sdp: 'offer' }));
			setLocalDescription = vi.fn(async () => {});
			close = vi.fn();
			constructor() {
				peers.push(this);
			}
		}
	);
	vi.stubGlobal(
		'MediaStream',
		class {
			getTracks() {
				return [];
			}
		}
	);
	return peers;
}

function types(mock: ReturnType<typeof capabilities>) {
	return mock.mock.calls.map(([message]) => message.type);
}

describe('stream fallback', () => {
	const stream = async (message: { type: string }) =>
		message.type === 'camera/stream' ? { url: '/api/hls/stream.m3u8' } : {};

	it('plays HLS when WebRTC setup is rejected and the camera offers both', async () => {
		stubWebRtc();
		const sendMessagePromise = capabilities(['web_rtc', 'hls'], async (message) => {
			if (message.type === 'camera/webrtc/get_client_config') throw new Error('no provider');
			return stream(message);
		});
		const connection = { sendMessagePromise } as unknown as Connection;
		const video = videoElement(),
			onError = vi.fn();
		await playCamera(connection, video, 'camera.door', new AbortController().signal, onError);
		await vi.waitFor(() => expect(video.src).toBe('/api/hls/stream.m3u8'));
		expect(types(sendMessagePromise)).toEqual([
			'camera/capabilities',
			'camera/webrtc/get_client_config',
			'camera/stream'
		]);
		expect(onError).not.toHaveBeenCalled();
	});

	it('releases a failed peer connection before falling back to HLS', async () => {
		const peers = stubWebRtc();
		const sendMessagePromise = capabilities(['web_rtc', 'hls'], stream);
		const connection = {
			sendMessagePromise,
			subscribeMessage: vi.fn(async () => async () => {})
		} as unknown as Connection;
		const video = videoElement(),
			onError = vi.fn();
		await playCamera(connection, video, 'camera.door', new AbortController().signal, onError);
		expect(types(sendMessagePromise)).not.toContain('camera/stream');
		peers[0].connectionState = 'failed';
		peers[0].onconnectionstatechange?.();
		expect(peers[0].close).toHaveBeenCalledOnce();
		expect(video.srcObject).toBeNull();
		await vi.waitFor(() => expect(video.src).toBe('/api/hls/stream.m3u8'));
		expect(onError).not.toHaveBeenCalled();
	});

	it('falls back to HLS when WebRTC does not connect in time', async () => {
		vi.useFakeTimers();
		const peers = stubWebRtc();
		const sendMessagePromise = capabilities(['web_rtc', 'hls'], stream);
		const connection = {
			sendMessagePromise,
			subscribeMessage: vi.fn(async () => async () => {})
		} as unknown as Connection;
		const video = videoElement();
		await playCamera(connection, video, 'camera.door', new AbortController().signal, vi.fn());
		await vi.advanceTimersByTimeAsync(9_000);
		expect(types(sendMessagePromise)).not.toContain('camera/stream');
		await vi.advanceTimersByTimeAsync(1_000);
		expect(peers[0].close).toHaveBeenCalledOnce();
		expect(types(sendMessagePromise)).toContain('camera/stream');
	});

	it('keeps a connected WebRTC stream past the startup timeout', async () => {
		vi.useFakeTimers();
		const peers = stubWebRtc();
		const sendMessagePromise = capabilities(['web_rtc', 'hls'], stream);
		const connection = {
			sendMessagePromise,
			subscribeMessage: vi.fn(async () => async () => {})
		} as unknown as Connection;
		await playCamera(
			connection,
			videoElement(),
			'camera.door',
			new AbortController().signal,
			vi.fn()
		);
		peers[0].connectionState = 'connected';
		peers[0].onconnectionstatechange?.();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(peers[0].close).not.toHaveBeenCalled();
		expect(types(sendMessagePromise)).not.toContain('camera/stream');
	});

	it('gives a WebRTC-only camera as long as it needs to connect', async () => {
		vi.useFakeTimers();
		const peers = stubWebRtc();
		const onError = vi.fn();
		const connection = {
			sendMessagePromise: capabilities(['web_rtc'], stream),
			subscribeMessage: vi.fn(async () => async () => {})
		} as unknown as Connection;
		await playCamera(
			connection,
			videoElement(),
			'camera.door',
			new AbortController().signal,
			onError
		);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(peers[0].close).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});

	it('reports a failed WebRTC-only camera instead of requesting HLS', async () => {
		const peers = stubWebRtc();
		const sendMessagePromise = capabilities(['web_rtc'], stream);
		const connection = {
			sendMessagePromise,
			subscribeMessage: vi.fn(async () => async () => {})
		} as unknown as Connection;
		const onError = vi.fn();
		await playCamera(
			connection,
			videoElement(),
			'camera.door',
			new AbortController().signal,
			onError
		);
		peers[0].connectionState = 'failed';
		peers[0].onconnectionstatechange?.();
		expect(onError).toHaveBeenCalledOnce();
		expect(types(sendMessagePromise)).not.toContain('camera/stream');
	});

	it('never falls back after its owner aborts', async () => {
		vi.useFakeTimers();
		const peers = stubWebRtc();
		const sendMessagePromise = capabilities(['web_rtc', 'hls'], stream);
		const connection = {
			sendMessagePromise,
			subscribeMessage: vi.fn(async () => async () => {})
		} as unknown as Connection;
		const controller = new AbortController(),
			onError = vi.fn();
		await playCamera(connection, videoElement(), 'camera.door', controller.signal, onError);
		controller.abort();
		peers[0].connectionState = 'failed';
		peers[0].onconnectionstatechange?.();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(types(sendMessagePromise)).not.toContain('camera/stream');
		expect(onError).not.toHaveBeenCalled();
	});
});
