'use client';
import { useState } from 'react';
import { BarChart3, Check, EyeOff, Loader2 } from 'lucide-react';
import type { PollView } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Renders a Poll inside a TEXT-shaped bubble. Tap an option to vote
 * (single-choice replaces, multi-choice toggles). Shows percent bars
 * once the user has voted, otherwise just plain options.
 */
export function PollBubble({
  poll,
  isMe,
  onVote,
}: {
  poll: PollView;
  isMe: boolean;
  onVote: (optionIds: string[]) => Promise<void>;
}) {
  const [voting, setVoting] = useState(false);
  const hasVoted = poll.options.some((o) => o.mine);
  const closed = !!poll.closedAt;

  async function tap(optionId: string) {
    if (closed || voting) return;
    setVoting(true);
    let next: string[];
    const cur = poll.options.filter((o) => o.mine).map((o) => o.id);
    if (poll.multipleChoice) {
      next = cur.includes(optionId)
        ? cur.filter((id) => id !== optionId)
        : [...cur, optionId];
    } else {
      // Single-choice: replace, or revoke if same option tapped.
      next = cur[0] === optionId ? [] : [optionId];
    }
    await onVote(next);
    setVoting(false);
  }

  const total = Math.max(0, poll.totalVotes);

  return (
    <div
      className={cn(
        'min-w-[240px] max-w-[320px] px-1 py-0.5',
        // Text-bubble owns the padding on the parent; we just lay out content here.
      )}
    >
      <div className="flex items-start gap-2 pb-2">
        <BarChart3
          className={cn('w-4 h-4 mt-0.5 shrink-0', isMe ? 'text-white/85' : 'text-accent')}
        />
        <div className="min-w-0">
          <div
            className={cn(
              'text-[15px] font-medium leading-snug break-words',
              isMe ? 'text-white' : 'text-text',
            )}
          >
            {poll.question}
          </div>
          <div
            className={cn(
              'text-[11px] mt-0.5 flex items-center gap-1',
              isMe ? 'text-white/70' : 'text-text-muted',
            )}
          >
            {poll.anonymous && <EyeOff className="w-3 h-3" />}
            <span>
              {poll.anonymous ? 'анонимный' : 'открытый'}
              {poll.multipleChoice ? ' · мультивыбор' : ''}
              {closed ? ' · закрыт' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {poll.options.map((o) => {
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          return (
            <button
              key={o.id}
              onClick={() => tap(o.id)}
              disabled={closed || voting}
              className={cn(
                'relative w-full text-left rounded-lg overflow-hidden transition-colors disabled:cursor-not-allowed',
                isMe
                  ? 'bg-white/10 hover:bg-white/20 disabled:bg-white/10'
                  : 'bg-bg-elevated hover:bg-bg-hover disabled:bg-bg-elevated',
              )}
            >
              {/* Progress fill — visible once user has voted. */}
              {hasVoted && (
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 transition-[width] duration-300',
                    isMe ? 'bg-white/20' : 'bg-accent/15',
                    o.mine && (isMe ? 'bg-white/35' : 'bg-accent/35'),
                  )}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative px-3 py-2 flex items-center gap-2">
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                    o.mine
                      ? isMe
                        ? 'bg-white border-white'
                        : 'bg-accent border-accent'
                      : isMe
                        ? 'border-white/50'
                        : 'border-border',
                  )}
                >
                  {o.mine && (
                    <Check
                      className={cn('w-3 h-3', isMe ? 'text-accent' : 'text-white')}
                    />
                  )}
                </div>
                <div
                  className={cn(
                    'flex-1 text-[14px] truncate',
                    isMe ? 'text-white' : 'text-text',
                  )}
                >
                  {o.text}
                </div>
                {hasVoted && (
                  <span
                    className={cn(
                      'text-[12px] tabular-nums shrink-0',
                      isMe ? 'text-white/85' : 'text-text-muted',
                    )}
                  >
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          'mt-2 text-[11px] flex items-center justify-between',
          isMe ? 'text-white/70' : 'text-text-muted',
        )}
      >
        <span>
          {total} голос
          {total === 1 ? '' : total < 5 ? 'а' : 'ов'}
        </span>
        {voting && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>
    </div>
  );
}
