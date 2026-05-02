'use client';
import type { CallQuality } from '@/types/calls';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL;
const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME;
const TURN_CREDENTIAL = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
  ICE_SERVERS.push({
    urls: TURN_URL,
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  });
}

export interface PeerCallbacks {
  onLocalIce: (candidate: RTCIceCandidateInit) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onQualityChange?: (quality: CallQuality) => void;
  onNegotiationNeeded?: () => void;
}

export class PeerSession {
  pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private prevBytesReceived = 0;
  private prevTimestamp = 0;
  private callbacks: PeerCallbacks;
  // Screen share state. When sharing, the video sender's track is the
  // display track; the original camera track (if any) is parked here so
  // we can restore it on stop.
  private screenTrack: MediaStreamTrack | null = null;
  private parkedCameraTrack: MediaStreamTrack | null = null;

  constructor(callbacks: PeerCallbacks) {
    this.callbacks = callbacks;
    this.remoteStream = new MediaStream();
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) callbacks.onLocalIce(e.candidate.toJSON());
    };

    this.pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => {
        if (!this.remoteStream.getTracks().some((x) => x.id === t.id)) {
          this.remoteStream.addTrack(t);
        }
      });
      callbacks.onRemoteStream(this.remoteStream);
    };

    this.pc.onconnectionstatechange = () => {
      callbacks.onConnectionStateChange(this.pc.connectionState);
      if (this.pc.connectionState === 'connected') this.startStatsLoop();
      if (
        this.pc.connectionState === 'failed' ||
        this.pc.connectionState === 'disconnected'
      ) {
        this.tryRestartIce();
      }
    };

    this.pc.onnegotiationneeded = () => {
      callbacks.onNegotiationNeeded?.();
    };
  }

  async getLocalMedia(audio: boolean, video: boolean): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: audio
        ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : false,
      video: video
        ? {
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: 'user',
          }
        : false,
    };
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }
    return this.localStream;
  }

  /** Add or replace a video track during a call (e.g. enable camera mid-call). */
  async enableCamera() {
    if (this.localStream?.getVideoTracks().length) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const [track] = stream.getVideoTracks();
    if (!track) return;
    if (!this.localStream) this.localStream = new MediaStream();
    this.localStream.addTrack(track);
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(track);
    else this.pc.addTrack(track, this.localStream);
  }

  disableCamera() {
    const tracks = this.localStream?.getVideoTracks() ?? [];
    for (const t of tracks) {
      t.stop();
      this.localStream?.removeTrack(t);
    }
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) sender.replaceTrack(null).catch(() => {});
  }

  setMicEnabled(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  setCameraEnabled(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = enabled));
  }

  /**
   * Toggle browser noise suppression on the active audio track via
   * applyConstraints (no renegotiation needed). Browsers all support
   * the standard MediaTrackConstraints flag; if applyConstraints fails
   * we just swallow it.
   */
  async setNoiseSuppression(enabled: boolean) {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        echoCancellation: true,
        noiseSuppression: enabled,
        autoGainControl: enabled,
      });
    } catch {
      /* ignore */
    }
  }

  /**
   * Replace the outgoing video sender's track with a captured screen.
   * Returns the new track (or null if the user cancelled the picker).
   * The original camera track is parked and re-attached on stop.
   */
  async startScreenShare(): Promise<MediaStreamTrack | null> {
    if (this.screenTrack) return this.screenTrack;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
    } catch {
      return null;
    }
    const [track] = stream.getVideoTracks();
    if (!track) return null;
    this.screenTrack = track;

    let sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender?.track) {
      this.parkedCameraTrack = sender.track;
      // Don't stop the camera track — we want to put it back later.
      await sender.replaceTrack(track);
    } else {
      // No video sender yet (audio-only call): add one.
      sender = this.pc.addTrack(track, this.localStream ?? new MediaStream());
    }

    // The browser's "stop sharing" button on top of the screen fires `ended`.
    track.onended = () => {
      void this.stopScreenShare();
    };

    // Mirror in localStream so the self-preview shows the screen too.
    if (this.localStream) {
      const old = this.localStream.getVideoTracks()[0];
      if (old) this.localStream.removeTrack(old);
      this.localStream.addTrack(track);
    }

    return track;
  }

  async stopScreenShare() {
    if (!this.screenTrack) return;
    const screen = this.screenTrack;
    this.screenTrack = null;

    const sender = this.pc.getSenders().find((s) => s.track === screen);
    if (sender) {
      if (this.parkedCameraTrack && this.parkedCameraTrack.readyState === 'live') {
        await sender.replaceTrack(this.parkedCameraTrack);
      } else {
        await sender.replaceTrack(null);
      }
    }

    // Stop the screen capture so the browser drops the indicator.
    screen.stop();

    if (this.localStream) {
      this.localStream.removeTrack(screen);
      if (this.parkedCameraTrack && this.parkedCameraTrack.readyState === 'live') {
        this.localStream.addTrack(this.parkedCameraTrack);
      }
    }
    this.parkedCameraTrack = null;
  }

  isScreenSharing(): boolean {
    return !!this.screenTrack;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(
    remoteOffer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(remoteOffer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async applyAnswer(remoteAnswer: RTCSessionDescriptionInit) {
    if (this.pc.signalingState === 'have-local-offer') {
      await this.pc.setRemoteDescription(remoteAnswer);
    }
  }

  async addRemoteIce(candidate: RTCIceCandidateInit) {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      // ICE candidate may arrive before remote description — ignore harmlessly
    }
  }

  private async tryRestartIce() {
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      // The orchestrator will see negotiationneeded and emit a renegotiate.
    } catch {
      // ignore
    }
  }

  private startStatsLoop() {
    if (this.statsTimer) return;
    this.statsTimer = setInterval(async () => {
      try {
        const stats = await this.pc.getStats();
        let bytesReceived = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let timestamp = 0;
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp') {
            bytesReceived += report.bytesReceived ?? 0;
            packetsLost += report.packetsLost ?? 0;
            packetsReceived += report.packetsReceived ?? 0;
            timestamp = report.timestamp;
          }
        });
        const dt = (timestamp - this.prevTimestamp) / 1000;
        const dBytes = bytesReceived - this.prevBytesReceived;
        this.prevBytesReceived = bytesReceived;
        this.prevTimestamp = timestamp;
        const kbps = dt > 0 ? (dBytes * 8) / 1000 / dt : 0;
        const lossPct =
          packetsReceived + packetsLost > 0
            ? (packetsLost / (packetsReceived + packetsLost)) * 100
            : 0;

        let q: CallQuality = 'excellent';
        if (lossPct > 10 || kbps < 30) q = 'critical';
        else if (lossPct > 5 || kbps < 60) q = 'poor';
        else if (lossPct > 1 || kbps < 120) q = 'good';
        this.callbacks.onQualityChange?.(q);
      } catch {
        // ignore
      }
    }, 2000);
  }

  close() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.remoteStream.getTracks().forEach((t) => this.remoteStream.removeTrack(t));
    try {
      this.pc.close();
    } catch {
      // ignore
    }
  }
}
