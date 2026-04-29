'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { useSocket } from '@/hooks/useSocket';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { TypingIndicator } from './TypingIndicator';
import { CallButton } from '@/components/calls/CallButton';
import type { ChatMessage } from '@/types';
import { formatTime } from '@/lib/utils';

interface PeerInfo {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string;
}

export function ChatRoom({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string;
}) {
  const [peer, setPeer] = useState<PeerInfo | null>(null);
  const [convType, setConvType] = useState<'DIRECT' | 'GROUP' | 'SAVED'>('DIRECT');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const socket = useSocket();

  const reload = useCallback(async () => {
    setLoading(true);
    const [convRes, msgsRes] = await Promise.all([
      fetch(`/api/conversations/${conversationId}`),
      fetch(`/api/conversations/${conversationId}/messages`),
    ]);
    const conv = await convRes.json();
    const msgs = await msgsRes.json();
    setPeer(conv.conversation?.peer ?? null);
    setConvType(conv.conversation?.type ?? 'DIRECT');
    setMessages(msgs.messages ?? []);
    setLoading(false);
    fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
  }, [conversationId]);

  const isSaved = convType === 'SAVED';

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('conversation:join', conversationId);

    const onMessage = (payload: { message: ChatMessage }) => {
      if (payload.message.conversationId !== conversationId) return;
      // Sender flow: optimistic insert + API response is enough — the broadcast
      // back to ourselves can race with the API resolution and create a duplicate
      // because our optimistic id ('tmp-…') hasn't been swapped yet. Just ignore
      // our own broadcasts.
      if (payload.message.senderId === currentUserId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
      fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(
        () => {},
      );
    };

    const onRead = (payload: {
      conversationId: string;
      userId: string;
      messageIds: string[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.userId === currentUserId) return;
      setMessages((prev) =>
        prev.map((m) =>
          payload.messageIds.includes(m.id)
            ? { ...m, readBy: Array.from(new Set([...(m.readBy ?? []), payload.userId])) }
            : m,
        ),
      );
    };

    const onTyping = (payload: {
      conversationId: string;
      userId: string;
      isTyping: boolean;
    }) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.userId === currentUserId) return;
      setPeerTyping(payload.isTyping);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (payload.isTyping) {
        typingTimerRef.current = setTimeout(() => setPeerTyping(false), 4000);
      }
    };

    const onPresence = (p: { userId: string; isOnline: boolean }) => {
      if (peer && p.userId === peer.id) {
        setPeer({ ...peer, isOnline: p.isOnline });
      }
    };

    socket.on('message:new', onMessage);
    socket.on('message:read', onRead);
    socket.on('typing', onTyping);
    socket.on('presence', onPresence);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:read', onRead);
      socket.off('typing', onTyping);
      socket.off('presence', onPresence);
    };
  }, [socket, conversationId, currentUserId, peer]);

  async function sendMessage(input: {
    type: ChatMessage['type'];
    content?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
    durationMs?: number;
  }) {
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      conversationId,
      senderId: currentUserId,
      type: input.type,
      content: input.content ?? null,
      mediaUrl: input.mediaUrl ?? null,
      mediaMimeType: input.mediaMimeType ?? null,
      durationMs: input.durationMs ?? null,
      createdAt: new Date().toISOString(),
      status: 'sending',
      readBy: [],
    };
    setMessages((prev) => [...prev, optimistic]);

    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...m, status: 'sending' } : m)),
      );
      return;
    }
    const data = await res.json();
    setMessages((prev) =>
      prev.map((m) =>
        m.id === optimistic.id ? { ...data.message, status: 'sent' } : m,
      ),
    );
  }

  function emitTyping(isTyping: boolean) {
    socket?.emit('typing', { conversationId, isTyping });
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 chat-wallpaper">
      {/* Sticky header with safe-area for iOS notch */}
      <header className="sticky top-0 z-10 bg-bg-panel/95 backdrop-blur border-b border-border flex items-center gap-3 px-3 md:px-5 py-2.5 pt-[max(env(safe-area-inset-top),0.625rem)]">
        <Link
          href="/chat"
          className="md:hidden -ml-1 p-2 -my-2 rounded-full text-text hover:bg-bg-hover active:bg-bg-hover/80 transition-colors"
          aria-label="назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {isSaved ? (
          <>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-fuchsia-500 flex items-center justify-center shrink-0 shadow-md shadow-accent/30">
              <Bookmark className="w-5 h-5 text-white" fill="currentColor" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate text-[15px]">Избранное</div>
              <div className="text-[12px] text-text-muted">личные заметки</div>
            </div>
          </>
        ) : peer ? (
          <>
            <Avatar
              src={peer.avatarUrl}
              name={peer.username}
              size={40}
              online={peer.isOnline}
            />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate text-[15px]">
                {peer.displayName ?? peer.username}
              </div>
              <div className="text-[12px] text-text-muted truncate">
                {peerTyping ? (
                  <span className="text-accent">печатает…</span>
                ) : peer.isOnline ? (
                  'в сети'
                ) : (
                  `был в сети в ${formatTime(peer.lastSeenAt)}`
                )}
              </div>
            </div>
            <CallButton
              peer={{
                id: peer.id,
                username: peer.username,
                displayName: peer.displayName,
                avatarUrl: peer.avatarUrl,
              }}
              conversationId={conversationId}
            />
          </>
        ) : null}
      </header>

      <MessageList messages={messages} currentUserId={currentUserId} />
      {!isSaved && peerTyping && <TypingIndicator />}

      <Composer
        onSend={sendMessage}
        onTyping={isSaved ? () => {} : emitTyping}
      />
    </div>
  );
}
