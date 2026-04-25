'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
    setMessages(msgs.messages ?? []);
    setLoading(false);
    fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('conversation:join', conversationId);

    const onMessage = (payload: { message: ChatMessage }) => {
      if (payload.message.conversationId !== conversationId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
      if (payload.message.senderId !== currentUserId) {
        fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(
          () => {},
        );
      }
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
    <div className="flex flex-col h-full min-h-0">
      <header className="px-5 py-3 border-b border-border bg-bg-panel flex items-center gap-3">
        <Link href="/chat" className="md:hidden text-text-muted hover:text-text">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {peer && (
          <>
            <Avatar
              src={peer.avatarUrl}
              name={peer.username}
              size={40}
              online={peer.isOnline}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {peer.displayName ?? peer.username}
              </div>
              <div className="text-xs text-text-muted">
                {peerTyping ? (
                  <span className="text-accent">печатает…</span>
                ) : peer.isOnline ? (
                  'онлайн'
                ) : (
                  `был в сети ${formatTime(peer.lastSeenAt)}`
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
        )}
      </header>

      <MessageList messages={messages} currentUserId={currentUserId} />
      {peerTyping && <TypingIndicator />}

      <Composer onSend={sendMessage} onTyping={emitTyping} />
    </div>
  );
}
