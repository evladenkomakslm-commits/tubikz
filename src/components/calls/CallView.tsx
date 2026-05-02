'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Video,
  VideoOff,
  Minimize2,
  Signal,
  ScreenShare,
  ScreenShareOff,
  Smile,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '@/lib/calls/store';
import { getCallController } from './CallProvider';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '🤯'] as const;

export function CallView() {
  const call = useCallStore((s) => s.call);
  const localStream = useCallStore((s) => s.localStream);
  const remoteStream = useCallStore((s) => s.remoteStream);
  const micMuted = useCallStore((s) => s.micMuted);
  const cameraOff = useCallStore((s) => s.cameraOff);
  const screenSharing = useCallStore((s) => s.screenSharing);
  const noiseSuppression = useCallStore((s) => s.noiseSuppression);
  const reactions = useCallStore((s) => s.reactions);
  const quality = useCallStore((s) => s.quality);
  const setMinimized = useCallStore((s) => s.setMinimized);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream)
      localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream)
      remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream)
      remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  if (!call) return null;
  const controller = getCallController();
  const isVideo = call.type === 'VIDEO';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[90] bg-black flex flex-col"
      >
        {/* Remote video / avatar background */}
        <div className="relative flex-1 flex items-center justify-center overflow-hidden">
          {isVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-accent/40 blur-3xl animate-pulse-soft" />
                <Avatar
                  src={call.peer.avatarUrl}
                  name={call.peer.username}
                  size={160}
                />
              </div>
              <div className="mt-6 text-2xl font-semibold">
                {call.peer.displayName ?? call.peer.username}
              </div>
            </div>
          )}
          <audio ref={remoteAudioRef} autoPlay playsInline />

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 p-5 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
            <div>
              <div className="text-base font-medium">
                {call.peer.displayName ?? call.peer.username}
              </div>
              <div className="text-xs text-text-muted flex items-center gap-2 mt-0.5">
                <PhaseLabel call={call} />
                <QualityIndicator quality={quality} />
              </div>
            </div>
            <button
              onClick={() => setMinimized(true)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur transition-colors"
              title="свернуть"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>

          {/* Self preview */}
          {isVideo && localStream && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute bottom-32 right-5 w-32 sm:w-40 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-white/20 bg-bg-panel shadow-2xl"
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  'w-full h-full object-cover scale-x-[-1]',
                  cameraOff && 'opacity-0',
                )}
              />
              {cameraOff && (
                <div className="absolute inset-0 flex items-center justify-center text-text-muted">
                  <VideoOff className="w-6 h-6" />
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Floating reaction layer */}
        <ReactionLayer reactions={reactions} />

        {/* Quick reaction picker */}
        <AnimatePresence>
          {reactionPickerOpen && (
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 flex gap-1.5 bg-bg-panel/90 backdrop-blur-md rounded-full px-2 py-1.5 border border-white/10 shadow-2xl"
              onMouseLeave={() => setReactionPickerOpen(false)}
            >
              {QUICK_REACTIONS.map((e) => (
                <motion.button
                  key={e}
                  whileTap={{ scale: 1.4 }}
                  onClick={() => {
                    controller.sendReaction(e);
                    setReactionPickerOpen(false);
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-2xl transition-colors"
                >
                  {e}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="bg-gradient-to-t from-black to-transparent pb-8 pt-12">
          <div className="flex items-center justify-center gap-3 sm:gap-5 flex-wrap px-2">
            <ControlButton
              active={micMuted}
              onClick={controller.toggleMic}
              activeColor="bg-danger"
              inactiveColor="bg-white/15"
              label={micMuted ? 'вкл. микро' : 'выкл. микро'}
            >
              {micMuted ? (
                <MicOff className="w-6 h-6" />
              ) : (
                <Mic className="w-6 h-6" />
              )}
            </ControlButton>

            {/* Noise suppression — only meaningful while mic is on. */}
            <ControlButton
              active={!noiseSuppression}
              onClick={controller.toggleNoiseSuppression}
              activeColor="bg-amber-500/80"
              inactiveColor="bg-white/15"
              label={
                noiseSuppression
                  ? 'шумоподавление вкл.'
                  : 'шумоподавление выкл.'
              }
            >
              {noiseSuppression ? (
                <Volume2 className="w-6 h-6" />
              ) : (
                <VolumeX className="w-6 h-6" />
              )}
            </ControlButton>

            {isVideo ? (
              <ControlButton
                active={cameraOff}
                onClick={controller.toggleCamera}
                activeColor="bg-danger"
                inactiveColor="bg-white/15"
                label={cameraOff ? 'вкл. камеру' : 'выкл. камеру'}
              >
                {cameraOff ? (
                  <VideoOff className="w-6 h-6" />
                ) : (
                  <Video className="w-6 h-6" />
                )}
              </ControlButton>
            ) : (
              <ControlButton
                active={false}
                onClick={controller.enableCameraMidCall}
                activeColor="bg-accent"
                inactiveColor="bg-white/15"
                label="включить камеру"
              >
                <Video className="w-6 h-6" />
              </ControlButton>
            )}

            {/* Screen share — works in audio + video calls. */}
            <ControlButton
              active={screenSharing}
              onClick={() => void controller.toggleScreenShare()}
              activeColor="bg-accent"
              inactiveColor="bg-white/15"
              label={screenSharing ? 'выкл. демо экрана' : 'демонстрация экрана'}
            >
              {screenSharing ? (
                <ScreenShareOff className="w-6 h-6" />
              ) : (
                <ScreenShare className="w-6 h-6" />
              )}
            </ControlButton>

            <ControlButton
              active={reactionPickerOpen}
              onClick={() => setReactionPickerOpen((v) => !v)}
              activeColor="bg-accent"
              inactiveColor="bg-white/15"
              label="реакция"
            >
              <Smile className="w-6 h-6" />
            </ControlButton>

            <button
              onClick={controller.hangup}
              className="w-16 h-16 rounded-full bg-danger flex items-center justify-center shadow-2xl shadow-danger/40 hover:scale-105 active:scale-95 transition-transform"
              title="завершить"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Floats incoming + outgoing emoji reactions up the screen. Each entry
 * lives ~1.2s and self-prunes via a setTimeout. Outgoing reactions
 * (`side: 'me'`) lean right; incoming lean left so it's clear who
 * fired what.
 */
function ReactionLayer({
  reactions,
}: {
  reactions: { id: number; emoji: string; side: 'me' | 'peer' }[];
}) {
  // Track which ids have already animated; prune from store after their
  // exit so we don't re-render a list of stale rows.
  // Since we don't have direct mutation API for the array, we just key
  // by id — AnimatePresence handles enter/exit and the queue is capped
  // upstream in the store.
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {reactions.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{
              opacity: [0, 1, 1, 0],
              y: -120,
              scale: [0.6, 1.4, 1.2],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              [r.side === 'me' ? 'right' : 'left']: `${20 + Math.random() * 20}%`,
            }}
            className="absolute bottom-44 text-5xl drop-shadow-2xl"
          >
            {r.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  children,
  activeColor,
  inactiveColor,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeColor: string;
  inactiveColor: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'w-14 h-14 rounded-full flex items-center justify-center backdrop-blur transition-all',
        active ? activeColor : inactiveColor,
        'hover:scale-105 active:scale-95',
      )}
    >
      {children}
    </button>
  );
}

function PhaseLabel({
  call,
}: {
  call: NonNullable<ReturnType<typeof useCallStore.getState>['call']>;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (call.phase !== 'active') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [call.phase]);

  if (call.phase === 'outgoing-ringing') return <span>вызов…</span>;
  if (call.phase === 'connecting') return <span>соединение…</span>;
  if (call.phase === 'active' && call.answeredAt) {
    const s = Math.floor((now - call.answeredAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return <span>{mm}:{ss}</span>;
  }
  return null;
}

function QualityIndicator({ quality }: { quality: string }) {
  const color =
    quality === 'critical'
      ? 'text-danger'
      : quality === 'poor'
        ? 'text-amber-400'
        : 'text-success';
  return (
    <span className={cn('inline-flex items-center gap-1', color)}>
      <Signal className="w-3.5 h-3.5" />
    </span>
  );
}
