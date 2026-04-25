'use client';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export function VoiceBubble({
  url,
  durationMs,
  isMe,
}: {
  url: string;
  durationMs: number;
  isMe: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;
    const onTime = () => {
      setProgress(audio.currentTime / (audio.duration || durationMs / 1000));
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [url, durationMs]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  const seconds = Math.round(durationMs / 1000);
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className={cn('flex items-center gap-3 px-2 py-1.5 min-w-[180px]')}>
      <button
        onClick={toggle}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isMe ? 'bg-white/20 text-white' : 'bg-accent/20 text-accent',
        )}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-[1px]" />}
      </button>
      <div className="flex-1">
        <div
          className={cn(
            'h-1 rounded-full overflow-hidden',
            isMe ? 'bg-white/25' : 'bg-bg-elevated',
          )}
        >
          <div
            className={cn('h-full transition-all', isMe ? 'bg-white' : 'bg-accent')}
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
        <div className={cn('text-[10px] mt-1', isMe ? 'text-white/70' : 'text-text-subtle')}>
          {mm}:{ss}
        </div>
      </div>
    </div>
  );
}
