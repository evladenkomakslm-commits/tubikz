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
