'use client';
import { create } from 'zustand';

interface DebugState {
  visible: boolean;
  toggle: () => void;
  show: (v: boolean) => void;
}

export const useDebugStore = create<DebugState>((set) => ({
  visible: false,
  toggle: () => set((s) => ({ visible: !s.visible })),
  show: (visible) => set({ visible }),
}));
