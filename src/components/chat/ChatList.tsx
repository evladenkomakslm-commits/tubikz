'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useSocket } from '@/hooks/useSocket';
import { useToast } from '@/components/ui/Toast';
import { cn, formatDay } from '@/lib/utils';

interface ConvSummary {
  id: string;
  type: 'DIRECT' | 'GROUP' | 'SAVED';
  title: string | null;
  peer: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    isOnline: boolean;
  } | null;
  lastMessage: {
    id: string;
    senderId: string;
    type: string;
    content: string | null;
    createdAt: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

export function ChatList() {
  const params = useParams<{ id?: string }>();
  const { data: session } = useSession();
  const meId = session?.user?.id;
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const socket = useSocket();
  const toast = useToast();

  async function load() {
    const res = await fetch('/api/conversations');
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  // When user opens a chat, locally zero its unread badge — server-side
  // the ChatRoom will POST /read on mount.
  useEffect(() => {
    if (!params?.id) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === params.id && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c)),
    );
  }, [params?.id]);

  useEffect(() => {
    if (!socket) return;

    const onMessage = (payload: { message: ConvSummary['lastMessage'] & { conversationId: string } }) => {
      if (!payload?.message) return;
      const m = payload.message;
      const isOwn = meId && m.senderId === meId;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === m.conversationId);
        if (idx === -1) {
          // New conversation — refetch list (could be a chat we just got added to).
          load();
          return prev;
        }
        const isActive = params?.id === m.conversationId;
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          lastMessage: m,
          updatedAt: m.createdAt,
          unreadCount:
            isActive || isOwn ? next[idx].unreadCount : next[idx].unreadCount + 1,
        };
        next.sort(
          (a, b) =>
            new Date(b.lastMessage?.createdAt ?? b.updatedAt).getTime() -
            new Date(a.lastMessage?.createdAt ?? a.updatedAt).getTime(),
        );
        return next;
      });

      // Don't toast for our own messages or for the chat we're already viewing.
      if (isOwn) return;
      const conv = conversationsRef.current.find((c) => c.id === m.conversationId);
      if (params?.id !== m.conversationId && conv?.peer && document.visibilityState !== 'visible') {
        toast.push({
          message: `${conv.peer.displayName ?? conv.peer.username}: ${preview(m)}`,
        });
      }
    };

    const onPresence = (p: { userId: string; isOnline: boolean }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.peer?.id === p.userId
            ? { ...c, peer: { ...c.peer, isOnline: p.isOnline } }
            : c,
        ),
      );
    };

    socket.on('message:new', onMessage);
    socket.on('presence', onPresence);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('presence', onPresence);
    };
  }, [socket, params?.id, toast, meId]);

  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  return (
    <aside className="w-72 sm:w-80 shrink-0 border-r border-border bg-bg-panel flex flex-col">
      <header className="px-5 py-4 border-b border-border">
        <h2 className="text-lg font-semibold">чаты</h2>
        <p className="text-xs text-text-muted mt-0.5">{conversations.length} активных</p>
      </header>
      <div className="flex-1 overflow-y-auto scroll-smooth-y">
        {conversations.length === 0 ? (
          <div className="px-5 py-10 text-center text-text-muted text-sm">
            пока пусто. начни диалог из вкладки «друзья»
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {conversations.map((c) => {
              const active = params?.id === c.id;
              const isSaved = c.type === 'SAVED';
              const name = isSaved
                ? 'Избранное'
                : (c.peer?.displayName ?? c.peer?.username ?? c.title ?? 'чат');
              return (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Link
                    href={`/chat/${c.id}`}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl transition-colors',
                      active
                        ? 'bg-accent-soft'
                        : 'hover:bg-bg-hover',
                    )}
                  >
                    {isSaved ? (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-accent to-fuchsia-500 flex items-center justify-center shrink-0 shadow-lg shadow-accent/30">
                        <Bookmark className="w-5 h-5 text-white" fill="currentColor" />
                      </div>
                    ) : (
                      <Avatar
                        src={c.peer?.avatarUrl}
                        name={c.peer?.username ?? 'tubik'}
                        size={44}
                        online={c.peer?.isOnline}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-medium truncate text-sm">{name}</div>
                        {c.lastMessage && (
                          <div className="text-[10px] text-text-subtle shrink-0">
                            {formatDay(c.lastMessage.createdAt)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="text-xs text-text-muted truncate">
                          {c.lastMessage ? preview(c.lastMessage) : 'нет сообщений'}
                        </div>
                        {c.unreadCount > 0 && !active && (
                          <span className="bg-accent text-white text-[10px] font-medium rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </aside>
  );
}

function preview(m: { type: string; content: string | null }) {
  if (m.type === 'TEXT') return m.content ?? '';
  if (m.type === 'IMAGE') return '📷 фото';
  if (m.type === 'VIDEO') return '🎬 видео';
  if (m.type === 'VOICE') return '🎙 голосовое';
  return '📎 файл';
}

