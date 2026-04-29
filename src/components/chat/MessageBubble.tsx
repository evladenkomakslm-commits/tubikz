'use client';
import { Check, CheckCheck, Clock, Phone, PhoneMissed } from 'lucide-react';
import type { ChatMessage } from '@/types';
import { cn, formatTime } from '@/lib/utils';
import { VoiceBubble } from './VoiceBubble';

export function MessageBubble({
  message,
  isMe,
  grouped,
}: {
  message: ChatMessage;
  isMe: boolean;
  grouped: boolean;
}) {
  const status = inferStatus(message, isMe);

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

  const isText = message.type === 'TEXT';

  return (
    <div
      className={cn(
        'flex px-1',
        isMe ? 'justify-end' : 'justify-start',
        grouped ? 'mt-0.5' : 'mt-1.5',
      )}
    >
      <div
        className={cn(
          'relative max-w-[78%] sm:max-w-[65%] rounded-2xl text-[15px] leading-[1.35] shadow-sm',
          isMe
            ? 'bg-accent text-white'
            : 'bg-bg-panel/95 border border-border/60 backdrop-blur-sm',
          // Telegram-like tails: only on the last bubble in a group
          !grouped && (isMe ? 'rounded-br-md' : 'rounded-bl-md'),
          isText ? 'pl-3 pr-3 py-1.5' : 'p-1',
        )}
      >
        {isText && (
          <p className="whitespace-pre-wrap break-words pb-3">
            {message.content}
            {/* Spacer for the absolutely-positioned time so it doesn't overlap the last word. */}
            <span className="inline-block w-12 align-bottom" aria-hidden />
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

        {/* Time + status — tucked in the bottom-right corner like Telegram */}
        <div
          className={cn(
            'absolute right-2 bottom-1 flex items-center gap-0.5 text-[10px] leading-none select-none',
            isMe ? 'text-white/75' : 'text-text-subtle',
            !isText && 'right-2.5 bottom-1.5 px-1.5 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white/90',
          )}
        >
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
      </div>
    </div>
  );
}

function inferStatus(m: ChatMessage, isMe: boolean): ChatMessage['status'] {
  if (!isMe) return undefined;
  if (m.status === 'sending' || m.id.startsWith('tmp-')) return 'sending';
  if (m.readBy && m.readBy.length > 0) return 'read';
  return 'sent';
}
