'use client';
import { Phone, Video } from 'lucide-react';
import { getCallController } from './CallProvider';
import type { CallPeer, CallType } from '@/types/calls';
import { useCallStore } from '@/lib/calls/store';

export function CallButton({
  peer,
  conversationId,
}: {
  peer: CallPeer;
  conversationId: string;
}) {
  const inCall = useCallStore((s) => !!s.call);

  const start = (type: CallType) => {
    if (inCall) return;
    void getCallController().startCall(peer, conversationId, type);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => start('AUDIO')}
        disabled={inCall}
        className="p-2 rounded-full text-text-muted hover:text-accent hover:bg-bg-hover transition-colors disabled:opacity-40"
        title="голосовой звонок"
      >
        <Phone className="w-5 h-5" />
      </button>
      <button
        onClick={() => start('VIDEO')}
        disabled={inCall}
        className="p-2 rounded-full text-text-muted hover:text-accent hover:bg-bg-hover transition-colors disabled:opacity-40"
        title="видеозвонок"
      >
        <Video className="w-5 h-5" />
      </button>
    </div>
  );
}
