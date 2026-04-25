'use client';
import { useEffect, useRef, useState } from 'react';
import { Maximize2, PhoneOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallStore } from '@/lib/calls/store';
import { getCallController } from './CallProvider';
import { Avatar } from '@/components/ui/Avatar';

export function MiniCallWindow() {
  const call = useCallStore((s) => s.call);
  const remoteStream = useCallStore((s) => s.remoteStream);
  const setMinimized = useCallStore((s) => s.setMinimized);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 24, y: 24 });

  useEffect(() => {
    if (audioRef.current && remoteStream) audioRef.current.srcObject = remoteStream;
    if (videoRef.current && remoteStream) videoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  if (!call) return null;
  const controller = getCallController();
  const isVideo = call.type === 'VIDEO';

  return (
    <motion.div
      drag
      dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
      dragElastic={0.05}
      dragMomentum={false}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, x: pos.x, y: pos.y }}
      onDragEnd={(_, info) => setPos({ x: pos.x + info.offset.x, y: pos.y + info.offset.y })}
      className="fixed bottom-4 right-4 z-[95] w-64 rounded-2xl bg-bg-panel border border-border shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing"
    >
      <div className="aspect-video bg-bg-elevated relative">
        {isVideo ? (
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Avatar src={call.peer.avatarUrl} name={call.peer.username} size={56} />
          </div>
        )}
        <audio ref={audioRef} autoPlay playsInline />
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {call.peer.displayName ?? call.peer.username}
          </div>
          <div className="text-[10px] text-text-muted">в звонке</div>
        </div>
        <button
          onClick={() => setMinimized(false)}
          className="p-1.5 rounded-lg bg-bg-hover hover:bg-bg-elevated transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={controller.hangup}
          className="p-1.5 rounded-lg bg-danger text-white hover:opacity-90 transition-opacity"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
