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
  Pin,
  PinOff,
  Download,
  File as FileIcon,
  MapPin,
  Image as ImageIconSm,
  Video as VideoIconSm,
  Mic as MicIconSm,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage } from '@/types';
import { cn, formatTime } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { haptic } from '@/lib/haptics';
import { RichText } from '@/lib/markdown';
import { Avatar } from '@/components/ui/Avatar';
import { VoiceBubble } from './VoiceBubble';
import { PollBubble } from './PollBubble';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;

/** Burst payload — a copy of an emoji that scales up + drifts before fading. */
type Burst = { id: number; emoji: string };

export function MessageBubble({
  message,
  isMe,
  grouped,
  showSender,
  sender,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onTogglePin,
  onJumpTo,
  onOpenImage,
  onVote,
}: {
  message: ChatMessage;
  isMe: boolean;
  grouped: boolean;
  showSender?: boolean;
  sender?: { username: string; displayName: string | null; avatarUrl: string | null };
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onTogglePin: () => void;
  onJumpTo: (messageId: string) => void;
  onOpenImage?: () => void;
  onVote?: (optionIds: string[]) => Promise<void>;
}) {
  const status = inferStatus(message, isMe);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuOpensUp, setMenuOpensUp] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);
  const isDeleted = !!message.deletedAt;
  const toast = useToast();

  /**
   * When the action menu opens, decide whether to drop it below or float
   * it above the bubble based on available space. Last few messages of a
   * chat would otherwise hide the menu behind the composer.
   */
  useEffect(() => {
    if (!menuOpen || !bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    // Menu height: ~250px (quick-emoji row + 3-4 items + padding).
    const MENU_H = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    setMenuOpensUp(spaceBelow < MENU_H);
  }, [menuOpen]);

  /**
   * Reaction tap — both from the long-press strip and from the chip below
   * the bubble. We compute "is this the user adding (vs removing)" against
   * the *current* reactions snapshot and only fire the pop animation +
   * haptic on add. Removal is intentionally quiet, like Telegram.
   */
  function fireReact(emoji: string) {
    const existing = (message.reactions ?? []).find((r) => r.emoji === emoji);
    const isAdding = !existing?.mine;
    if (isAdding) {
      haptic('pop');
      const id = Date.now() + Math.random();
      setBursts((b) => [...b, { id, emoji }]);
      // Animation runs ~700ms; clean up after.
      window.setTimeout(() => {
        setBursts((b) => b.filter((x) => x.id !== id));
      }, 800);
    } else {
      haptic('tap');
    }
    onReact(emoji);
  }

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

  // Outside click closes the action menu. We have to inspect the event
  // target instead of relying on React's stopPropagation, because React's
  // synthetic stopPropagation doesn't stop native listeners attached to
  // `document` — they still fire after the bubble phase finishes. The
  // result was the menu closing on mousedown before the click event on
  // the actual menu item could fire (especially on desktop).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const node = menuRef.current;
      if (node && node.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
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
  const isPoll = message.type === 'POLL';
  const isLocation = message.type === 'LOCATION';
  const isContact = message.type === 'CONTACT';
  // TEXT-style padding for cards that look better with breathing room around
  // their inner content (POLL/LOCATION/CONTACT). FILE still uses media-p-1.
  const usesTextLayout = isText || isPoll || isLocation || isContact;
  const hasReactions = (message.reactions?.length ?? 0) > 0;
  const isPinned = !!message.pinnedAt;

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
      {/* Sender avatar — only shown in groups, on the side of incoming
          messages, and only for the *last* bubble in a same-sender run
          (so a vertical chain of messages doesn't repeat avatars). */}
      {showSender && !isMe && (
        <div className="shrink-0 mr-1.5 self-end mb-0.5">
          <Avatar
            src={sender?.avatarUrl ?? null}
            name={sender?.username ?? '?'}
            size={28}
          />
        </div>
      )}
      {/* Same-sender continuation gets a spacer so bubbles stay aligned. */}
      {!isMe && !showSender && grouped && (
        <div className="shrink-0 mr-1.5 w-7" />
      )}

      {/* Wrapper holds the bubble + reactions row + floating action menu. */}
      <div className={cn('relative max-w-[78%] sm:max-w-[65%]', isMe ? 'items-end' : 'items-start')}>
        <div
          ref={bubbleRef}
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
            usesTextLayout ? 'pl-3 pr-3 py-1.5' : 'p-1',
          )}
        >
          {/* Sender name — group chats, incoming messages, only at the
              start of a same-sender run. */}
          {showSender && !isMe && usesTextLayout && (
            <div className="text-[12.5px] font-semibold text-accent pb-0.5">
              {sender?.displayName ?? sender?.username ?? '...'}
            </div>
          )}

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
              <RichText text={message.content ?? ''} />
              {/* Spacer for the absolutely-positioned time so it doesn't overlap the last word. */}
              <span className="inline-block w-16 align-bottom" aria-hidden />
            </p>
          )}

          {/* Link previews — at most 2 cards under the text bubble. */}
          {isText && message.linkPreviews && message.linkPreviews.length > 0 && (
            <div className="-mt-1 mb-2 space-y-1.5">
              {message.linkPreviews.slice(0, 2).map((p) => (
                <a
                  key={p.url}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'block rounded-xl overflow-hidden border-l-2 transition-colors',
                    isMe
                      ? 'border-white/70 bg-white/10 hover:bg-white/15'
                      : 'border-accent bg-bg-elevated hover:bg-bg-hover',
                  )}
                >
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="w-full max-h-40 object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="px-2.5 py-2">
                    {p.siteName && (
                      <div
                        className={cn(
                          'text-[11px] uppercase tracking-wider truncate',
                          isMe ? 'text-white/70' : 'text-accent',
                        )}
                      >
                        {p.siteName}
                      </div>
                    )}
                    {p.title && (
                      <div
                        className={cn(
                          'text-[13.5px] font-medium truncate',
                          isMe ? 'text-white' : 'text-text',
                        )}
                      >
                        {p.title}
                      </div>
                    )}
                    {p.description && (
                      <div
                        className={cn(
                          'text-[12px] line-clamp-2',
                          isMe ? 'text-white/80' : 'text-text-muted',
                        )}
                      >
                        {p.description}
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}

          {message.type === 'IMAGE' && message.mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.mediaUrl}
              alt="фото"
              onClick={(e) => {
                // Don't fight the long-press menu — only open the viewer on
                // a short tap that didn't open it.
                if (longPressFiredRef.current) return;
                e.stopPropagation();
                onOpenImage?.();
              }}
              className="rounded-xl max-h-80 object-cover w-full cursor-pointer"
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

          {isPoll && message.poll && (
            <div className="pb-3">
              <PollBubble
                poll={message.poll}
                isMe={isMe}
                onVote={onVote ?? (async () => {})}
              />
            </div>
          )}

          {isLocation && message.content && (() => {
            // content = "lat,lng[,label]"
            const [latStr, lngStr] = message.content.split(',');
            const lat = parseFloat(latStr);
            const lng = parseFloat(lngStr);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            const map = staticMapTile(lat, lng);
            const open = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
            return (
              <a
                href={open}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="block min-w-[220px] max-w-[300px] rounded-xl overflow-hidden pb-3 group/loc"
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={map}
                    alt="карта"
                    className="w-full h-32 object-cover bg-bg-elevated"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className={cn(
                        'rounded-full p-1.5 shadow-md',
                        isMe ? 'bg-white text-accent' : 'bg-accent text-white',
                      )}
                    >
                      <MapPin className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    'pt-2 px-1 flex items-center gap-1.5 text-[12.5px]',
                    isMe ? 'text-white/85' : 'text-text-muted',
                  )}
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate group-hover/loc:underline">
                    локация · {lat.toFixed(4)}, {lng.toFixed(4)}
                  </span>
                </div>
              </a>
            );
          })()}

          {isContact && message.content && (() => {
            // content = "userId|username|displayName|avatarUrl?"
            const [userId, username, displayName, avatarUrl] = (
              message.content ?? ''
            ).split('|');
            if (!username) return null;
            return (
              <ContactCardInline
                isMe={isMe}
                userId={userId}
                username={username}
                displayName={displayName || null}
                avatarUrl={avatarUrl || null}
              />
            );
          })()}

          {message.type === 'FILE' && message.mediaUrl && (() => {
            // We stash "filename|sizeBytes" in `content` at upload time so
            // the bubble can render a proper file card without needing
            // extra schema columns.
            const [name, sizeStr] = (message.content ?? '').split('|');
            const size = Number(sizeStr) || 0;
            return (
              <a
                href={message.mediaUrl}
                download={name || 'file'}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2 min-w-[200px] max-w-[300px] transition-colors',
                  isMe
                    ? 'bg-white/10 hover:bg-white/20'
                    : 'bg-bg-elevated hover:bg-bg-hover',
                )}
              >
                <div
                  className={cn(
                    'shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
                    isMe ? 'bg-white/20 text-white' : 'bg-accent/15 text-accent',
                  )}
                >
                  <FileIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      'text-[13.5px] font-medium truncate',
                      isMe ? 'text-white' : 'text-text',
                    )}
                  >
                    {name || 'файл'}
                  </div>
                  <div
                    className={cn(
                      'text-[11px]',
                      isMe ? 'text-white/70' : 'text-text-muted',
                    )}
                  >
                    {formatBytes(size)}
                  </div>
                </div>
                <Download
                  className={cn(
                    'w-4 h-4 shrink-0',
                    isMe ? 'text-white/70' : 'text-text-muted',
                  )}
                />
              </a>
            );
          })()}

          {/* Time + edited marker + status, bottom-right corner. */}
          <div
            className={cn(
              'absolute right-2 bottom-1 flex items-center gap-0.5 text-[10px] leading-none select-none',
              isMe ? 'text-white/75' : 'text-text-subtle',
              !usesTextLayout &&
                'right-2.5 bottom-1.5 px-1.5 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white/90',
            )}
          >
            {message.scheduledAt && !message.scheduledFiredAt && (
              <Clock className="w-3 h-3 mr-0.5" />
            )}
            {isPinned && <Pin className="w-3 h-3 mr-0.5" />}
            {message.editedAt && <span className="mr-0.5 italic opacity-80">ред.</span>}
            <span>
              {message.scheduledAt && !message.scheduledFiredAt
                ? formatScheduled(message.scheduledAt)
                : formatTime(message.createdAt)}
            </span>
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

        {/* Reactions row, just under the bubble. Each chip pulses on count change. */}
        {hasReactions && (
          <div className={cn('flex flex-wrap gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
            {message.reactions!.map((r) => (
              <motion.button
                key={r.emoji}
                onClick={() => fireReact(r.emoji)}
                // `key={count}` would re-mount; we'd rather animate in place.
                // Use the count as the animation trigger via `animate`.
                animate={{ scale: [1, 1.18, 1] }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                whileTap={{ scale: 0.9 }}
                // Re-run the keyframes whenever the count changes.
                custom={r.count}
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
              </motion.button>
            ))}
          </div>
        )}

        {/* Burst layer — pops out from where the bubble lives and floats up. */}
        <div
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 z-40',
            isMe ? 'right-2' : 'left-2',
          )}
        >
          <AnimatePresence>
            {bursts.map((b) => (
              <motion.span
                key={b.id}
                initial={{ scale: 0.4, opacity: 0, y: 0 }}
                animate={{ scale: [0.4, 1.6, 1.2], opacity: [0, 1, 0], y: -48 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="absolute text-3xl select-none drop-shadow-lg"
              >
                {b.emoji}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* Floating action menu — opens on long-press / right-click. */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className={cn(
                'absolute z-30 flex flex-col gap-1 bg-bg-panel border border-border rounded-2xl p-1.5 shadow-2xl min-w-[180px]',
                isMe ? 'right-0' : 'left-0',
                // Flip above the bubble when there's no space below
                // (otherwise the menu hides behind the composer).
                menuOpensUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
              )}
            >
              {/* Quick reactions row */}
              <div className="flex items-center justify-between gap-0.5 px-1 pb-1 border-b border-border/60">
                {QUICK_EMOJIS.map((e) => (
                  <motion.button
                    key={e}
                    whileTap={{ scale: 1.4 }}
                    transition={{ duration: 0.12 }}
                    onClick={() => {
                      fireReact(e);
                      setMenuOpen(false);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-hover text-lg transition-colors"
                    aria-label={`реакция ${e}`}
                  >
                    {e}
                  </motion.button>
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
              <MenuItem
                icon={isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                label={isPinned ? 'открепить' : 'закрепить'}
                onClick={() => {
                  onTogglePin();
                  setMenuOpen(false);
                }}
              />
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

/**
 * Inline contact card. Tap → opens (or creates) a direct chat with
 * the shared user via POST /api/conversations.
 */
function ContactCardInline({
  isMe,
  userId,
  username,
  displayName,
  avatarUrl,
}: {
  isMe: boolean;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  async function open() {
    if (!userId) return;
    try {
      const r = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId: userId }),
      });
      if (!r.ok) return;
      const data = await r.json();
      if (data?.id) window.location.href = `/chat/${data.id}`;
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="min-w-[220px] max-w-[300px] pb-3">
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2',
          isMe ? 'bg-white/10' : 'bg-bg-elevated',
        )}
      >
        <Avatar src={avatarUrl} name={username} size={40} />
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              'text-[14px] font-medium truncate',
              isMe ? 'text-white' : 'text-text',
            )}
          >
            {displayName ?? username}
          </div>
          <div
            className={cn(
              'text-[12px] truncate',
              isMe ? 'text-white/70' : 'text-text-muted',
            )}
          >
            @{username}
          </div>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
        className={cn(
          'mt-1.5 w-full rounded-lg py-1.5 text-[13px] font-medium transition-colors',
          isMe
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-accent/15 hover:bg-accent/25 text-accent',
        )}
      >
        написать
      </button>
    </div>
  );
}

/**
 * Static map thumbnail. Uses the public OSM staticmap mirror — no API key
 * required, returns a PNG ready for an <img>.
 */
function staticMapTile(lat: number, lng: number): string {
  return (
    `https://staticmap.openstreetmap.de/staticmap.php` +
    `?center=${lat},${lng}&zoom=15&size=400x180&maptype=mapnik&markers=${lat},${lng},red-pushpin`
  );
}

function formatScheduled(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mo} ${hh}:${mm}`;
}

function formatBytes(n: number): string {
  if (!n) return '—';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

function inferStatus(m: ChatMessage, isMe: boolean): ChatMessage['status'] {
  if (!isMe) return undefined;
  if (m.status === 'sending' || m.id.startsWith('tmp-')) return 'sending';
  if (m.readBy && m.readBy.length > 0) return 'read';
  return 'sent';
}
