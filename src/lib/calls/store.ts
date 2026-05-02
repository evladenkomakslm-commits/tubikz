'use client';
import { create } from 'zustand';
import type { ActiveCall, CallQuality } from '@/types/calls';

/** A reaction emitted during a call — animated as a floating emoji. */
export interface CallReaction {
  id: number;
  emoji: string;
  /** 'me' for self-fired, 'peer' for incoming. */
  side: 'me' | 'peer';
}

interface CallState {
  call: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micMuted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  noiseSuppression: boolean;
  reactions: CallReaction[];
  minimized: boolean;
  quality: CallQuality;
  ringtone: 'incoming' | 'outgoing' | null;

  setCall: (call: ActiveCall | null) => void;
  patchCall: (patch: Partial<ActiveCall>) => void;
  setLocalStream: (s: MediaStream | null) => void;
  setRemoteStream: (s: MediaStream | null) => void;
  setMicMuted: (m: boolean) => void;
  setCameraOff: (off: boolean) => void;
  setScreenSharing: (on: boolean) => void;
  setNoiseSuppression: (on: boolean) => void;
  pushReaction: (r: CallReaction) => void;
  setMinimized: (m: boolean) => void;
  setQuality: (q: CallQuality) => void;
  setRingtone: (r: 'incoming' | 'outgoing' | null) => void;
  reset: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  call: null,
  localStream: null,
  remoteStream: null,
  micMuted: false,
  cameraOff: false,
  screenSharing: false,
  noiseSuppression: true,
  reactions: [],
  minimized: false,
  quality: 'good',
  ringtone: null,

  setCall: (call) => set({ call }),
  patchCall: (patch) =>
    set((state) => ({ call: state.call ? { ...state.call, ...patch } : null })),
  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setMicMuted: (micMuted) => set({ micMuted }),
  setCameraOff: (cameraOff) => set({ cameraOff }),
  setScreenSharing: (screenSharing) => set({ screenSharing }),
  setNoiseSuppression: (noiseSuppression) => set({ noiseSuppression }),
  pushReaction: (r) =>
    set((state) => ({
      // Cap the queue so a spam can't blow up memory; auto-prunes via UI.
      reactions: [...state.reactions.slice(-19), r],
    })),
  setMinimized: (minimized) => set({ minimized }),
  setQuality: (quality) => set({ quality }),
  setRingtone: (ringtone) => set({ ringtone }),
  reset: () =>
    set({
      call: null,
      localStream: null,
      remoteStream: null,
      micMuted: false,
      cameraOff: false,
      screenSharing: false,
      noiseSuppression: true,
      reactions: [],
      minimized: false,
      quality: 'good',
      ringtone: null,
    }),
}));
