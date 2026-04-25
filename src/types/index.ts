export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface ChatUser {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  isOnline: boolean;
  lastSeenAt: string;
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
  status?: MessageStatus;
  readBy?: string[];
}

export interface ConversationSummary {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title?: string | null;
  peer?: ChatUser;
  lastMessage?: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
}

export type SocketEvent =
  | { type: 'message:new'; message: ChatMessage }
  | { type: 'message:read'; conversationId: string; userId: string; messageIds: string[] }
  | { type: 'typing'; conversationId: string; userId: string; isTyping: boolean }
  | { type: 'presence'; userId: string; isOnline: boolean };
