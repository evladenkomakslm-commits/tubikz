import type { Message, MessageReaction, User } from '@prisma/client';
import type { ChatMessage, ReactionSummary, ReplyPreview } from '@/types';

type ReplyShape =
  | (Pick<Message, 'id' | 'senderId' | 'type' | 'content' | 'mediaUrl' | 'deletedAt'> & {
      sender: Pick<User, 'username' | 'displayName'>;
    })
  | null;

type ReadShape = { userId: string };
type ReactionShape = Pick<MessageReaction, 'emoji' | 'userId'>;

export type MessageWithRelations = Message & {
  reads?: ReadShape[];
  reactions?: ReactionShape[];
  replyTo?: ReplyShape;
};

/** Roll up `MessageReaction` rows into one entry per emoji. */
export function aggregateReactions(
  rows: ReactionShape[] | undefined,
  currentUserId: string,
): ReactionSummary[] {
  if (!rows || rows.length === 0) return [];
  const map = new Map<string, ReactionSummary>();
  for (const r of rows) {
    const cur = map.get(r.emoji) ?? {
      emoji: r.emoji,
      count: 0,
      userIds: [],
      mine: false,
    };
    cur.count += 1;
    cur.userIds.push(r.userId);
    if (r.userId === currentUserId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  // Sort by count desc, then emoji for stability.
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji),
  );
}

export function toReplyPreview(reply: ReplyShape): ReplyPreview | null {
  if (!reply) return null;
  return {
    id: reply.id,
    senderId: reply.senderId,
    senderName: reply.sender?.displayName ?? reply.sender?.username ?? '',
    type: reply.type,
    content: reply.deletedAt ? null : reply.content,
    mediaUrl: reply.deletedAt ? null : reply.mediaUrl,
    deleted: !!reply.deletedAt,
  };
}

/** Standard projection used by every endpoint that returns messages. */
export function toChatMessage(
  m: MessageWithRelations,
  currentUserId: string,
): ChatMessage {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    type: m.type,
    content: m.deletedAt ? null : m.content,
    mediaUrl: m.deletedAt ? null : m.mediaUrl,
    mediaMimeType: m.deletedAt ? null : m.mediaMimeType,
    durationMs: m.durationMs,
    callId: m.callId,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
    replyToId: m.replyToId,
    replyTo: toReplyPreview(m.replyTo ?? null),
    reactions: aggregateReactions(m.reactions, currentUserId),
    pinnedAt: m.pinnedAt ? m.pinnedAt.toISOString() : null,
    pinnedById: m.pinnedById,
    readBy: m.reads?.map((r) => r.userId) ?? [],
  };
}

/** Prisma `include` block kept consistent across all endpoints. */
export const messageInclude = {
  reads: { select: { userId: true, readAt: true } },
  reactions: { select: { emoji: true, userId: true } },
  replyTo: {
    select: {
      id: true,
      senderId: true,
      type: true,
      content: true,
      mediaUrl: true,
      deletedAt: true,
      sender: { select: { username: true, displayName: true } },
    },
  },
} as const;
