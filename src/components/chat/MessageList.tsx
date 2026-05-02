'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage } from '@/types';
import { MessageBubble } from './MessageBubble';
import { formatDay } from '@/lib/utils';

export function MessageList({
  messages,
  currentUserId,
  isGroup = false,
  members,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onTogglePin,
  onJumpTo,
  onOpenImage,
}: {
  messages: ChatMessage[];
  currentUserId: string;
  isGroup?: boolean;
  members?: Record<
    string,
    { username: string; displayName: string | null; avatarUrl: string | null }
  >;
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onTogglePin: (m: ChatMessage) => void;
  onJumpTo: (messageId: string) => void;
  onOpenImage: (messageId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const last = messages[messages.length - 1];
    const isNew = last && last.id !== lastIdRef.current;
    lastIdRef.current = last?.id ?? null;
    if (isNew) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTo({ top: ref.current.scrollHeight });
  }, []);

  let lastDay = '';

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto scroll-smooth-y px-4 sm:px-6 py-6 space-y-1"
    >
      {messages.length === 0 && (
        <div className="text-center text-text-muted text-sm py-12 animate-fade-in">
          здесь пока тихо. напиши первое сообщение
        </div>
      )}
      <AnimatePresence initial={false}>
        {messages.map((m, i) => {
          const day = formatDay(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const prev = messages[i - 1];
          const grouped =
            prev && prev.senderId === m.senderId &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 60_000;
          return (
            <div key={m.id} id={`msg-${m.id}`}>
              {showDay && (
                <div className="flex justify-center my-4">
                  <span className="text-[11px] uppercase tracking-wider text-text-subtle bg-bg-panel border border-border rounded-full px-3 py-1">
                    {day}
                  </span>
                </div>
              )}
              <motion.div
                layout="position"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <MessageBubble
                  message={m}
                  isMe={m.senderId === currentUserId}
                  grouped={grouped}
                  showSender={isGroup && m.senderId !== currentUserId && !grouped}
                  sender={members?.[m.senderId]}
                  onReply={() => onReply(m)}
                  onEdit={() => onEdit(m)}
                  onDelete={() => onDelete(m)}
                  onReact={(emoji) => onReact(m, emoji)}
                  onTogglePin={() => onTogglePin(m)}
                  onJumpTo={onJumpTo}
                  onOpenImage={() => onOpenImage(m.id)}
                />
              </motion.div>
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
