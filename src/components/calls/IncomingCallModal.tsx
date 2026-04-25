'use client';
import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '@/lib/calls/store';
import { getCallController } from './CallProvider';
import { Avatar } from '@/components/ui/Avatar';

const RINGTONE_DATA_URI =
  // Short looping sine-wave-ish ringtone synthesized via WebAudio (not data URI)
  '';

export function IncomingCallModal() {
  const call = useCallStore((s) => s.call);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!call) return;
    let stopped = false;
    const ctx =
      typeof window !== 'undefined'
        ? new (window.AudioContext || (window as any).webkitAudioContext)()
        : null;
    audioCtxRef.current = ctx;
    if (!ctx) return;

    const playRing = () => {
      if (stopped) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
      setTimeout(playRing, 1500);
    };
    playRing();

    return () => {
      stopped = true;
      ctx.close().catch(() => {});
    };
  }, [call?.callId]);

  if (!call) return null;
  const controller = getCallController();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.92, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="bg-bg-panel border border-border rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl"
        >
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-accent/30 blur-2xl animate-pulse-soft" />
              <Avatar
                src={call.peer.avatarUrl}
                name={call.peer.username}
                size={112}
              />
            </div>
            <div className="mt-5 text-xl font-semibold">
              {call.peer.displayName ?? call.peer.username}
            </div>
            <div className="text-text-muted text-sm mt-1 flex items-center gap-1.5">
              {call.type === 'VIDEO' ? (
                <Video className="w-3.5 h-3.5" />
              ) : (
                <Phone className="w-3.5 h-3.5" />
              )}
              {call.type === 'VIDEO' ? 'видеозвонок' : 'звонок'}…
            </div>

            <div className="mt-8 flex items-center justify-center gap-10">
              <button
                onClick={controller.declineIncoming}
                className="flex flex-col items-center gap-2"
              >
                <span className="w-16 h-16 rounded-full bg-danger flex items-center justify-center shadow-xl shadow-danger/40 hover:scale-105 active:scale-95 transition-transform">
                  <PhoneOff className="w-7 h-7 text-white" />
                </span>
                <span className="text-xs text-text-muted">отклонить</span>
              </button>
              <button
                onClick={controller.acceptIncoming}
                className="flex flex-col items-center gap-2"
              >
                <span className="w-16 h-16 rounded-full bg-success flex items-center justify-center shadow-xl shadow-success/40 hover:scale-105 active:scale-95 transition-transform">
                  <Phone className="w-7 h-7 text-white" />
                </span>
                <span className="text-xs text-text-muted">принять</span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
