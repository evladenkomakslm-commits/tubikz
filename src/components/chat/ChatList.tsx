'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, MessageSquarePlus } from 'lucide-react';
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

  // Mobile: full-width when on /chat (no chat selected). Hidden when in a chat
  // (the ChatRoom takes the full screen with a back button).
  // Desktop (md+): always visible as a 320px column.
  const router = useRouter();
  const inChat = !!params?.id;

  return (
    <aside
      className={cn(
        'relative shrink-0 border-r border-border bg-bg-panel flex-col',
        // mobile width and visibility
        inChat ? 'hidden md:flex' : 'flex w-full',
        // desktop fixed width
        'md:w-80 md:flex',
      )}
    >
      {/* Sticky header with safe-area for iOS notch */}
      <header className="sticky top-0 z-10 bg-bg-panel/95 backdrop-blur border-b border-border px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">чаты</h1>
          {conversations.length > 0 && (
            <span className="text-xs text-text-muted">{conversations.length}</span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-smooth-y overscroll-contain">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-bg-elevated flex items-center justify-center mb-4">
              <MessageSquarePlus className="w-7 h-7 text-text-muted" />
            </div>
            <p className="text-sm text-text-muted">
              пока никого. найди тюбика во вкладке «друзья»
            </p>
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
                      'flex items-center gap-3 px-4 py-3 transition-colors active:bg-bg-hover/80',
                      active
                        ? 'bg-accent-soft md:bg-accent-soft'
                        : 'hover:bg-bg-hover',
                    )}
                  >
                    {isSaved ? (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-fuchsia-500 flex items-center justify-center shrink-0 shadow-md shadow-accent/30">
                        <Bookmark className="w-5 h-5 text-white" fill="currentColor" />
                      </div>
                    ) : (
                      <Avatar
                        src={c.peer?.avatarUrl}
                        name={c.peer?.username ?? 'tubik'}
                        size={48}
                        online={c.peer?.isOnline}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-semibold truncate text-[15px] text-text">{name}</div>
                        {c.lastMessage && (
                          <div className={cn(
                            'text-[11px] shrink-0',
                            c.unreadCount > 0 && !active ? 'text-accent font-medium' : 'text-text-subtle',
                          )}>
                            {formatDay(c.lastMessage.createdAt)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="text-[13px] text-text-muted truncate leading-snug">
                          {c.lastMessage ? preview(c.lastMessage, meId) : 'нет сообщений'}
                        </div>
                        {c.unreadCount > 0 && !active && (
                          <span className="bg-accent text-white text-[11px] font-semibold rounded-full px-1.5 min-w-[20px] h-5 flex items-center justify-center shrink-0">
                            {c.unreadCount > 99 ? '99+' : c.unreadCount}
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

      {/* Floating action button — go to Friends to start a new chat. Mobile-only. */}
      <button
        onClick={() => router.push('/friends')}
        aria-label="новый чат"
        className="md:hidden absolute right-4 bottom-4 w-14 h-14 rounded-full bg-accent text-white shadow-2xl shadow-accent/40 flex items-center justify-center active:scale-95 transition-transform"
      >
        <MessageSquarePlus className="w-6 h-6" />
      </button>
    </aside>
  );
}

function preview(
  m: { type: string; content: string | null; senderId?: string },
  meId?: string,
) {
  const prefix = meId && m.senderId === meId ? 'вы: ' : '';
  if (m.type === 'TEXT') return prefix + (m.content ?? '');
  if (m.type === 'IMAGE') return prefix + '📷 фото';
  if (m.type === 'VIDEO') return prefix + '🎬 видео';
  if (m.type === 'VOICE') return prefix + '🎙 голосовое';
  if (m.type === 'CALL') return '📞 звонок';
  return prefix + '📎 файл';
}

