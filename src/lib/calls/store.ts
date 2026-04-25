'use client';
import { create } from 'zustand';
import type { ActiveCall, CallQuality } from '@/types/calls';

interface CallState {
  call: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micMuted: boolean;
  cameraOff: boolean;
  minimized: boolean;
  quality: CallQuality;
  ringtone: 'incoming' | 'outgoing' | null;

  setCall: (call: ActiveCall | null) => void;
  patchCall: (patch: Partial<ActiveCall>) => void;
  setLocalStream: (s: MediaStream | null) => void;
  setRemoteStream: (s: MediaStream | null) => void;
  setMicMuted: (m: boolean) => void;
  setCameraOff: (off: boolean) => void;
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
      minimized: false,
      quality: 'good',
      ringtone: null,
    }),
}));
