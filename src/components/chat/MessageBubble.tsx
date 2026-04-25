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

  return (
    <div
      className={cn(
        'flex',
        isMe ? 'justify-end' : 'justify-start',
        grouped ? 'mt-0.5' : 'mt-2',
      )}
    >
      <div
        className={cn(
          'max-w-[80%] sm:max-w-[60%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug shadow-sm',
          isMe
            ? 'bg-accent text-white rounded-br-md'
            : 'bg-bg-panel border border-border rounded-bl-md',
          message.type !== 'TEXT' && 'p-1.5',
        )}
      >
        {message.type === 'TEXT' && (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}

        {message.type === 'IMAGE' && message.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.mediaUrl}
            alt="фото"
            className="rounded-xl max-h-80 object-cover"
          />
        )}

        {message.type === 'VIDEO' && message.mediaUrl && (
          <video
            src={message.mediaUrl}
            controls
            className="rounded-xl max-h-80"
          />
        )}

        {message.type === 'VOICE' && message.mediaUrl && (
          <VoiceBubble
            url={message.mediaUrl}
            durationMs={message.durationMs ?? 0}
            isMe={isMe}
          />
        )}

        <div
          className={cn(
            'flex items-center justify-end gap-1 mt-1 text-[10px]',
            isMe ? 'text-white/70' : 'text-text-subtle',
            message.type !== 'TEXT' && 'px-2 pb-1',
          )}
        >
          <span>{formatTime(message.createdAt)}</span>
          {isMe && (
            <span className="flex items-center">
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
