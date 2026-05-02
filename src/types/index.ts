export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface ChatUser {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  isOnline: boolean;
  lastSeenAt: string;
}

/** Lean projection of a message used inside `replyTo` so we don't recurse forever. */
export interface ReplyPreview {
  id: string;
  senderId: string;
  senderName: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'VOICE' | 'FILE' | 'CALL';
  content?: string | null;
  mediaUrl?: string | null;
  deleted?: boolean;
}

/** Cached OG/Twitter card metadata, attached inline to text messages. */
export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

/** Aggregated reaction summary attached to a message. */
export interface ReactionSummary {
  emoji: string;
  count: number;
  /** User ids of everyone who reacted with this emoji. */
  userIds: string[];
  /** True iff the current user is one of them. */
  mine: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'VOICE' | 'FILE' | 'CALL';
  content?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  durationMs?: number | null;
  callId?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  replyToId?: string | null;
  replyTo?: ReplyPreview | null;
  reactions?: ReactionSummary[];
  pinnedAt?: string | null;
  pinnedById?: string | null;
  linkPreviews?: LinkPreview[];
  status?: MessageStatus;
  readBy?: string[];
}

export interface ConversationSummary {
  id: string;
  type: 'DIRECT' | 'GROUP' | 'SAVED';
  title?: string | null;
  peer?: ChatUser;
  lastMessage?: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
}

export type SocketEvent =
  | { type: 'message:new'; message: ChatMessage }
  | { type: 'message:edited'; message: ChatMessage }
  | { type: 'message:deleted'; conversationId: string; messageId: string }
  | {
      type: 'message:reaction';
      conversationId: string;
      messageId: string;
      reactions: ReactionSummary[];
    }
  | {
      type: 'message:pinned';
      conversationId: string;
      messageId: string;
      pinnedAt: string | null;
      pinnedById: string | null;
    }
  | { type: 'message:read'; conversationId: string; userId: string; messageIds: string[] }
  | { type: 'typing'; conversationId: string; userId: string; isTyping: boolean }
  | { type: 'presence'; userId: string; isOnline: boolean };
