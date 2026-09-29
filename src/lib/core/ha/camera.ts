import type { Connection } from 'home-assistant-js-websocket';
import type Hls from 'hls.js';

type Signal =
	| { type: 'session'; session_id: string }
	| { type: 'answer'; answer: string }
	| { type: 'candidate'; candidate: RTCIceCandidateInit }
	| { type: 'error'; message: string };

/** WebRTC gets this long to connect before playback falls back to an advertised HLS stream. */
const WEBRTC_STARTUP_TIMEOUT = 10_000;

/**
 * One playback session. Prefers WebRTC and falls back to HLS when the camera
 * offers both and WebRTC fails. Aborting releases media and signaling,
 * including pending setup, and never starts a fallback.
 */
export async function playCamera(
	connection: Connection,
	video: HTMLVideoElement,
	entity: string,
	signal: AbortSignal,
	onError: () => void
): Promise<void> {
	if (signal.aborted) return;
	let hls: Hls | undefined;
	let peer: RTCPeerConnection | undefined;
	let unsubscribe: (() => Promise<void>) | undefined;
	let media: MediaStream | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let closed = false;
	// set once WebRTC has given up, so its late callbacks cannot touch the fallback
	let abandoned = false;
	const releaseWebRtc = () => {
		clearTimeout(timer);
		peer?.close();
		media?.getTracks().forEach((track) => track.stop());
		void unsubscribe?.().catch(() => {});
		peer = media = unsubscribe = undefined;
		video.srcObject = null;
	};
	const dispose = () => {
		if (closed) return;
		closed = true;
		releaseWebRtc();
		hls?.destroy();
		video.pause();
		video.removeAttribute('src');
		video.load();
		signal.removeEventListener('abort', dispose);
	};
	const fail = () => {
		if (!closed) {
			dispose();
			onError();
		}
	};
	signal.addEventListener('abort', dispose, { once: true });

	const playHls = async () => {
		const response = await connection.sendMessagePromise<{ url?: string }>({
			type: 'camera/stream',
			entity_id: entity
		});
		if (closed) return;
		if (!response.url) throw new Error('Camera did not return a stream');
		if (video.canPlayType('application/vnd.apple.mpegurl')) {
			video.src = response.url;
		} else {
			const { default: Player } = await import('hls.js');
			if (closed) return;
			if (!Player.isSupported()) throw new Error('HLS playback is unavailable');
			hls = new Player({ backBufferLength: 30, lowLatencyMode: true });
			hls.on(Player.Events.ERROR, (_event, data) => {
				if (data.fatal) fail();
			});
			hls.loadSource(response.url);
			hls.attachMedia(video);
		}
		void video.play().catch(() => {});
	};

	const playWebRtc = async (fallback: boolean) => {
		const inactive = () => closed || abandoned;
		const giveUp = () => {
			if (inactive()) return;
			abandoned = true;
			if (!fallback) return fail();
			releaseWebRtc();
			playHls().catch(fail);
		};
		// A camera without an alternative keeps waiting; slow WebRTC beats none.
		if (fallback) timer = setTimeout(giveUp, WEBRTC_STARTUP_TIMEOUT);
		try {
			const options = await connection.sendMessagePromise<{
				configuration?: RTCConfiguration;
				dataChannel?: string;
			}>({ type: 'camera/webrtc/get_client_config', entity_id: entity });
			if (inactive()) return;
			peer = new RTCPeerConnection(options.configuration);
			const activePeer = peer;
			const activeMedia = (media = new MediaStream());
			video.srcObject = activeMedia;
			if (options.dataChannel) peer.createDataChannel(options.dataChannel);
			peer.addTransceiver('audio', { direction: 'recvonly' });
			peer.addTransceiver('video', { direction: 'recvonly' });
			peer.ontrack = (event) => {
				if (!inactive()) activeMedia.addTrack(event.track);
			};
			peer.onconnectionstatechange = () => {
				if (inactive()) return;
				if (activePeer.connectionState === 'connected') clearTimeout(timer);
				else if (activePeer.connectionState === 'failed') giveUp();
			};
			let session: string | undefined;
			const candidates: RTCIceCandidateInit[] = [];
			const sendCandidate = (candidate: RTCIceCandidateInit) => {
				if (!inactive() && session)
					void connection
						.sendMessagePromise({
							type: 'camera/webrtc/candidate',
							entity_id: entity,
							session_id: session,
							candidate
						})
						.catch(giveUp);
			};
			peer.onicecandidate = (event) => {
				if (inactive() || !event.candidate) return;
				if (session) sendCandidate(event.candidate.toJSON());
				else candidates.push(event.candidate.toJSON());
			};
			const offer = await peer.createOffer();
			if (inactive()) return;
			await peer.setLocalDescription(offer);
			if (inactive()) return;
			// Serialize signals so candidates cannot overtake the remote description.
			let signals = Promise.resolve();
			const stop = await connection.subscribeMessage<Signal>(
				(event) => {
					signals = signals
						.then(async () => {
							if (inactive()) return;
							if (event.type === 'session') {
								session = event.session_id;
								candidates.splice(0).forEach(sendCandidate);
							} else if (event.type === 'answer') {
								await activePeer.setRemoteDescription({ type: 'answer', sdp: event.answer });
							} else if (event.type === 'candidate') {
								await activePeer.addIceCandidate({
									...event.candidate,
									sdpMid: event.candidate.sdpMid ?? '0'
								});
							} else giveUp();
						})
						.catch(giveUp);
				},
				{ type: 'camera/webrtc/offer', entity_id: entity, offer: offer.sdp }
			);
			if (inactive()) {
				await stop();
				return;
			}
			unsubscribe = stop;
			void video.play().catch(() => {});
		} catch {
			giveUp();
		}
	};

	try {
		// Home Assistant reports stream types through this command; the old
		// frontend_stream_type state attribute is gone.
		const { frontend_stream_types: types = [] } = await connection.sendMessagePromise<{
			frontend_stream_types?: string[];
		}>({ type: 'camera/capabilities', entity_id: entity });
		if (closed) return;
		if (types.includes('web_rtc')) await playWebRtc(types.includes('hls'));
		else if (types.includes('hls')) await playHls();
		// A camera without a stream keeps showing its snapshot; retrying cannot help.
		else dispose();
	} catch {
		fail();
	}
}
