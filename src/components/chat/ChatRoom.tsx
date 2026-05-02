'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { useSocket } from '@/hooks/useSocket';
import { useToast } from '@/components/ui/Toast';
import { MessageList } from './MessageList';
import { Composer, type ReplyTarget, type EditTarget } from './Composer';
import { TypingIndicator } from './TypingIndicator';
import { CallButton } from '@/components/calls/CallButton';
import type { ChatMessage, ReactionSummary } from '@/types';
import { formatTime } from '@/lib/utils';
import { useSession } from 'next-auth/react';

interface PeerInfo {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string;
}

/** Helper: rebuild `mine` flags on a server-broadcast reaction set. */
function localizeReactions(
  reactions: ReactionSummary[],
  currentUserId: string,
): ReactionSummary[] {
  return reactions.map((r) => ({ ...r, mine: r.userIds.includes(currentUserId) }));
}

function previewOf(m: ChatMessage): string {
  if (m.type === 'IMAGE') return 'фото';
  if (m.type === 'VIDEO') return 'видео';
  if (m.type === 'VOICE') return 'голосовое';
  if (m.type === 'CALL') return 'звонок';
  return m.content?.trim() || '...';
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
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const socket = useSocket();
  const toast = useToast();
  const { data: session } = useSession();
  const myName = session?.user?.username ?? 'я';

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
      // back to ourselves can race with the API resolution and create a duplicate.
      if (payload.message.senderId === currentUserId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
      fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(
        () => {},
      );
    };

    const onEdited = (payload: { message: ChatMessage }) => {
      if (payload.message.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.message.id ? { ...m, ...payload.message } : m)),
      );
    };

    const onDeleted = (payload: { conversationId: string; messageId: string }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? {
                ...m,
                content: null,
                mediaUrl: null,
                mediaMimeType: null,
                deletedAt: new Date().toISOString(),
                reactions: [],
              }
            : m,
        ),
      );
      // If we were replying to or editing the now-deleted message, clear it.
      setReplyTo((r) => (r && r.id === payload.messageId ? null : r));
      setEditing((e) => (e && e.id === payload.messageId ? null : e));
    };

    const onReaction = (payload: {
      conversationId: string;
      messageId: string;
      reactions: ReactionSummary[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      const localized = localizeReactions(payload.reactions, currentUserId);
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, reactions: localized } : m)),
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
    socket.on('message:edited', onEdited);
    socket.on('message:deleted', onDeleted);
    socket.on('message:reaction', onReaction);
    socket.on('message:read', onRead);
    socket.on('typing', onTyping);
    socket.on('presence', onPresence);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:edited', onEdited);
      socket.off('message:deleted', onDeleted);
      socket.off('message:reaction', onReaction);
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
    replyToId?: string;
  }) {
    // Resolve the optimistic replyTo preview from local state so the bubble
    // can show the quote even before the server echoes back.
    const replied = input.replyToId
      ? messages.find((m) => m.id === input.replyToId)
      : null;
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
      replyToId: input.replyToId ?? null,
      replyTo: replied
        ? {
            id: replied.id,
            senderId: replied.senderId,
            senderName:
              replied.senderId === currentUserId
                ? myName
                : peer?.displayName ?? peer?.username ?? '',
            type: replied.type,
            content: replied.content,
            mediaUrl: replied.mediaUrl,
          }
        : null,
      reactions: [],
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
      toast.push({ message: 'не удалось отправить', kind: 'error' });
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

  // Action handlers passed down to MessageList → MessageBubble.
  function handleReply(m: ChatMessage) {
    if (m.deletedAt) return;
    setEditing(null);
    setReplyTo({
      id: m.id,
      senderName:
        m.senderId === currentUserId
          ? myName
          : peer?.displayName ?? peer?.username ?? '',
      preview: previewOf(m),
    });
  }

  function handleEditStart(m: ChatMessage) {
    if (m.senderId !== currentUserId || m.type !== 'TEXT' || m.deletedAt) return;
    setReplyTo(null);
    setEditing({ id: m.id, initialContent: m.content ?? '' });
  }

  async function handleEditSubmit(id: string, content: string) {
    // Optimistic: patch the bubble locally first.
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, content, editedAt: new Date().toISOString() } : m,
      ),
    );
    const res = await fetch(`/api/conversations/${conversationId}/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const code = (data?.error as string) ?? '';
      toast.push({
        message:
          code === 'edit_window_expired'
            ? 'нельзя редактировать спустя 48 часов'
            : 'не удалось изменить',
        kind: 'error',
      });
      // Reload to revert.
      reload();
    }
  }

  async function handleDelete(m: ChatMessage) {
    if (m.senderId !== currentUserId || m.deletedAt) return;
    if (typeof window !== 'undefined' && !window.confirm('удалить сообщение?')) return;
    // Optimistic tombstone.
    setMessages((prev) =>
      prev.map((x) =>
        x.id === m.id
          ? {
              ...x,
              content: null,
              mediaUrl: null,
              mediaMimeType: null,
              deletedAt: new Date().toISOString(),
              reactions: [],
            }
          : x,
      ),
    );
    const res = await fetch(`/api/conversations/${conversationId}/messages/${m.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.push({ message: 'не удалось удалить', kind: 'error' });
      reload();
    }
  }

  async function handleReact(m: ChatMessage, emoji: string) {
    if (m.deletedAt) return;
    // Optimistic toggle.
    setMessages((prev) =>
      prev.map((x) => {
        if (x.id !== m.id) return x;
        const cur = x.reactions ?? [];
        const idx = cur.findIndex((r) => r.emoji === emoji);
        let next: ReactionSummary[];
        if (idx === -1) {
          next = [
            ...cur,
            { emoji, count: 1, userIds: [currentUserId], mine: true },
          ];
        } else {
          const r = cur[idx];
          if (r.mine) {
            const newCount = r.count - 1;
            next = newCount <= 0
              ? cur.filter((_, i) => i !== idx)
              : cur.map((rr, i) =>
                  i === idx
                    ? {
                        ...rr,
                        count: newCount,
                        userIds: rr.userIds.filter((u) => u !== currentUserId),
                        mine: false,
                      }
                    : rr,
                );
          } else {
            next = cur.map((rr, i) =>
              i === idx
                ? {
                    ...rr,
                    count: rr.count + 1,
                    userIds: [...rr.userIds, currentUserId],
                    mine: true,
                  }
                : rr,
            );
          }
        }
        return { ...x, reactions: next };
      }),
    );
    const res = await fetch(
      `/api/conversations/${conversationId}/messages/${m.id}/reactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.push({
        message:
          data?.error === 'too_many_reactions'
            ? `не больше ${data.max ?? 4} реакций`
            : 'реакция не сохранилась',
        kind: 'error',
      });
      reload();
      return;
    }
    const data = await res.json();
    if (data.reactions) {
      const localized = localizeReactions(data.reactions, currentUserId);
      setMessages((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, reactions: localized } : x)),
      );
    }
  }

  function handleJumpTo(messageId: string) {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-flash');
      setTimeout(() => el.classList.remove('msg-flash'), 1200);
    }
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

      <MessageList
        messages={messages}
        currentUserId={currentUserId}
        onReply={handleReply}
        onEdit={handleEditStart}
        onDelete={handleDelete}
        onReact={handleReact}
        onJumpTo={handleJumpTo}
      />
      {!isSaved && peerTyping && <TypingIndicator />}

      <Composer
        onSend={sendMessage}
        onTyping={isSaved ? () => {} : emitTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        onSubmitEdit={handleEditSubmit}
      />
    </div>
  );
}
