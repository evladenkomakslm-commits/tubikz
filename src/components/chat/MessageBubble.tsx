'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  Phone,
  PhoneMissed,
  Reply,
  Pencil,
  Trash2,
  Copy,
  Image as ImageIconSm,
  Video as VideoIconSm,
  Mic as MicIconSm,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage } from '@/types';
import { cn, formatTime } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { VoiceBubble } from './VoiceBubble';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;

export function MessageBubble({
  message,
  isMe,
  grouped,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onJumpTo,
}: {
  message: ChatMessage;
  isMe: boolean;
  grouped: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onJumpTo: (messageId: string) => void;
}) {
  const status = inferStatus(message, isMe);
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);
  const isDeleted = !!message.deletedAt;
  const toast = useToast();

  async function copyContent() {
    const text = message.content ?? '';
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older iOS Safari.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast.push({ message: 'скопировано' });
    } catch {
      toast.push({ message: 'не удалось скопировать', kind: 'error' });
    }
  }

  // Outside click closes the action menu.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [menuOpen]);

  if (message.type === 'CALL') {
    const isMissed = (message.content ?? '').includes('пропущен');
    return (
      <div className="flex justify-center my-2">
        <div className="inline-flex items-center gap-2 bg-bg-panel border border-border rounded-full px-3.5 py-1.5 text-xs text-text-muted">
          {isMissed ? (
            <PhoneMissed className="w-3.5 h-3.5 text-danger" />
          ) : (
            <Phone className="w-3.5 h-3.5 text-success" />
          )}
          <span>{message.content}</span>
          <span className="text-text-subtle">· {formatTime(message.createdAt)}</span>
        </div>
      </div>
    );
  }

  // Render a deleted message as a discreet tombstone.
  if (isDeleted) {
    return (
      <div className={cn('flex px-1', isMe ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-1.5')}>
        <div className="max-w-[78%] sm:max-w-[65%] rounded-2xl px-3.5 py-1.5 text-[13px] italic text-text-subtle bg-bg-panel/60 border border-dashed border-border/50">
          сообщение удалено
        </div>
      </div>
    );
  }

  const isText = message.type === 'TEXT';
  const hasReactions = (message.reactions?.length ?? 0) > 0;

  function startLongPress(e: React.TouchEvent | React.MouseEvent) {
    e.stopPropagation();
    longPressFiredRef.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true;
      // Drop any text-selection that iOS might have started despite
      // user-select:none, so it doesn't sit highlighted under our menu.
      const sel = window.getSelection?.();
      sel?.removeAllRanges?.();
      setMenuOpen(true);
    }, 450);
  }
  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <div
      className={cn(
        'flex px-1 group/msg',
        isMe ? 'justify-end' : 'justify-start',
        grouped ? 'mt-0.5' : 'mt-1.5',
      )}
    >
      {/* Wrapper holds the bubble + reactions row + floating action menu. */}
      <div className={cn('relative max-w-[78%] sm:max-w-[65%]', isMe ? 'items-end' : 'items-start')}>
        <div
          onContextMenu={(e) => {
            // Block the native long-press menu (iOS "Copy / Look Up").
            e.preventDefault();
            setMenuOpen(true);
          }}
          onTouchStart={startLongPress}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          onTouchCancel={cancelLongPress}
          // Prevent text-selection drag from hijacking the long-press.
          // We expose an explicit "копировать" action in the menu instead.
          style={{
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
          className={cn(
            'relative rounded-2xl text-[15px] leading-[1.35] shadow-sm',
            isMe
              ? 'bg-accent text-white'
              : 'bg-bg-panel/95 border border-border/60 backdrop-blur-sm',
            !grouped && (isMe ? 'rounded-br-md' : 'rounded-bl-md'),
            isText ? 'pl-3 pr-3 py-1.5' : 'p-1',
          )}
        >
          {/* Reply quote — sits inside the bubble at the top. */}
          {message.replyTo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onJumpTo(message.replyTo!.id);
              }}
              className={cn(
                'block w-full text-left rounded-lg px-2 py-1 mb-1 text-[12.5px] transition-colors',
                isMe
                  ? 'bg-white/15 hover:bg-white/25 border-l-2 border-white/70'
                  : 'bg-bg-elevated hover:bg-bg-hover border-l-2 border-accent',
              )}
            >
              <div className={cn('font-medium truncate', isMe ? 'text-white' : 'text-accent')}>
                {message.replyTo.deleted ? 'удалённое сообщение' : message.replyTo.senderName}
              </div>
              <div
                className={cn(
                  'truncate flex items-center gap-1',
                  isMe ? 'text-white/85' : 'text-text-muted',
                )}
              >
                {replyPreviewText(message.replyTo)}
              </div>
            </button>
          )}

          {isText && (
            <p className="whitespace-pre-wrap break-words pb-3">
              {message.content}
              {/* Spacer for the absolutely-positioned time so it doesn't overlap the last word. */}
              <span className="inline-block w-16 align-bottom" aria-hidden />
            </p>
          )}

          {message.type === 'IMAGE' && message.mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.mediaUrl}
              alt="фото"
              className="rounded-xl max-h-80 object-cover w-full"
            />
          )}

          {message.type === 'VIDEO' && message.mediaUrl && (
            <video
              src={message.mediaUrl}
              controls
              className="rounded-xl max-h-80 w-full"
            />
          )}

          {message.type === 'VOICE' && message.mediaUrl && (
            <VoiceBubble
              url={message.mediaUrl}
              durationMs={message.durationMs ?? 0}
              isMe={isMe}
            />
          )}

          {/* Time + edited marker + status, bottom-right corner. */}
          <div
            className={cn(
              'absolute right-2 bottom-1 flex items-center gap-0.5 text-[10px] leading-none select-none',
              isMe ? 'text-white/75' : 'text-text-subtle',
              !isText &&
                'right-2.5 bottom-1.5 px-1.5 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white/90',
            )}
          >
            {message.editedAt && <span className="mr-0.5 italic opacity-80">ред.</span>}
            <span>{formatTime(message.createdAt)}</span>
            {isMe && (
              <span className="flex items-center -mr-0.5">
                {status === 'sending' && <Clock className="w-3 h-3" />}
                {status === 'sent' && <Check className="w-3 h-3" />}
                {status === 'delivered' && <CheckCheck className="w-3 h-3" />}
                {status === 'read' && <CheckCheck className="w-3 h-3 text-sky-200" />}
              </span>
            )}
          </div>

          {/* Desktop hover quick-reply button — sits outside the bubble. */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReply();
            }}
            className={cn(
              'hidden md:flex absolute top-1 -translate-y-1/2 w-7 h-7 items-center justify-center rounded-full bg-bg-panel border border-border text-text-muted hover:text-accent shadow-md opacity-0 group-hover/msg:opacity-100 transition-opacity',
              isMe ? '-left-9' : '-right-9',
            )}
            title="ответить"
            aria-label="ответить"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Reactions row, just under the bubble. */}
        {hasReactions && (
          <div className={cn('flex flex-wrap gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
            {message.reactions!.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(r.emoji)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full text-[12px] px-2 py-0.5 border transition-colors',
                  r.mine
                    ? 'bg-accent/20 border-accent/60 text-accent'
                    : 'bg-bg-panel border-border text-text-muted hover:bg-bg-hover',
                )}
                title={r.mine ? 'убрать' : 'поставить'}
              >
                <span className="leading-none">{r.emoji}</span>
                <span className="tabular-nums">{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Floating action menu — opens on long-press / right-click. */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className={cn(
                'absolute z-30 flex flex-col gap-1 bg-bg-panel border border-border rounded-2xl p-1.5 shadow-2xl min-w-[180px]',
                isMe ? 'right-0' : 'left-0',
                'top-full mt-1.5',
              )}
            >
              {/* Quick reactions row */}
              <div className="flex items-center justify-between gap-0.5 px-1 pb-1 border-b border-border/60">
                {QUICK_EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      onReact(e);
                      setMenuOpen(false);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-hover text-lg transition-colors"
                    aria-label={`реакция ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <MenuItem
                icon={<Reply className="w-4 h-4" />}
                label="ответить"
                onClick={() => {
                  onReply();
                  setMenuOpen(false);
                }}
              />
              {message.type === 'TEXT' && message.content && (
                <MenuItem
                  icon={<Copy className="w-4 h-4" />}
                  label="копировать"
                  onClick={() => {
                    copyContent();
                    setMenuOpen(false);
                  }}
                />
              )}
              {isMe && message.type === 'TEXT' && (
                <MenuItem
                  icon={<Pencil className="w-4 h-4" />}
                  label="изменить"
                  onClick={() => {
                    onEdit();
                    setMenuOpen(false);
                  }}
                />
              )}
              {isMe && (
                <MenuItem
                  icon={<Trash2 className="w-4 h-4" />}
                  label="удалить"
                  danger
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors',
        danger
          ? 'text-danger hover:bg-danger/10'
          : 'text-text hover:bg-bg-hover',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function replyPreviewText(reply: NonNullable<ChatMessage['replyTo']>) {
  if (reply.deleted) return <span className="italic">удалённое сообщение</span>;
  if (reply.type === 'IMAGE')
    return (
      <>
        <ImageIconSm className="w-3.5 h-3.5 inline -mt-0.5" /> фото
      </>
    );
  if (reply.type === 'VIDEO')
    return (
      <>
        <VideoIconSm className="w-3.5 h-3.5 inline -mt-0.5" /> видео
      </>
    );
  if (reply.type === 'VOICE')
    return (
      <>
        <MicIconSm className="w-3.5 h-3.5 inline -mt-0.5" /> голосовое
      </>
    );
  return <span className="truncate">{reply.content || '...'}</span>;
}

function inferStatus(m: ChatMessage, isMe: boolean): ChatMessage['status'] {
  if (!isMe) return undefined;
  if (m.status === 'sending' || m.id.startsWith('tmp-')) return 'sending';
  if (m.readBy && m.readBy.length > 0) return 'read';
  return 'sent';
}
