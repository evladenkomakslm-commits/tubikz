'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  BellOff,
  Bookmark,
  Loader2,
  MoreVertical,
  Pin,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { GroupAvatar } from '@/components/ui/GroupAvatar';
import { useSocket } from '@/hooks/useSocket';
import { useToast } from '@/components/ui/Toast';
import { MessageList } from './MessageList';
import { Composer, type ReplyTarget, type EditTarget } from './Composer';
import { TypingIndicator } from './TypingIndicator';
import { GroupInfoSheet } from './GroupInfoSheet';
import { ImageViewer, type GalleryImage } from './ImageViewer';
import { CallButton } from '@/components/calls/CallButton';
import { compressImage } from '@/lib/image-compress';
import type { ChatMessage, PollView, ReactionSummary } from '@/types';
import { formatTime } from '@/lib/utils';
import { useSession } from 'next-auth/react';

interface PeerInfo {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string;
}

/** Helper: rebuild `mine` flags on a server-broadcast reaction set. */
function localizeReactions(
  reactions: ReactionSummary[],
  currentUserId: string,
): ReactionSummary[] {
  return reactions.map((r) => ({ ...r, mine: r.userIds.includes(currentUserId) }));
}

function previewOf(m: ChatMessage): string {
  if (m.type === 'IMAGE') return 'фото';
  if (m.type === 'VIDEO') return 'видео';
  if (m.type === 'VOICE') return 'голосовое';
  if (m.type === 'CALL') return 'звонок';
  if (m.type === 'POLL') return `📊 ${m.poll?.question ?? m.content ?? 'опрос'}`;
  if (m.type === 'LOCATION') return '📍 локация';
  if (m.type === 'CONTACT') {
    const username = (m.content ?? '').split('|')[1] ?? '';
    return `👤 ${username || 'контакт'}`;
  }
  if (m.type === 'FILE') {
    // FILE bubble stashes "filename|size" in content; show only the name.
    return (m.content ?? '').split('|')[0] || 'файл';
  }
  return m.content?.trim() || '...';
}

export function ChatRoom({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string;
}) {
  const [peer, setPeer] = useState<PeerInfo | null>(null);
  const [convType, setConvType] = useState<'DIRECT' | 'GROUP' | 'SAVED'>('DIRECT');
  const [groupMeta, setGroupMeta] = useState<{
    title: string | null;
    description: string | null;
    avatarUrl: string | null;
    memberCount: number | null;
    myRole: 'OWNER' | 'ADMIN' | 'MEMBER';
  }>({
    title: null,
    description: null,
    avatarUrl: null,
    memberCount: null,
    myRole: 'MEMBER',
  });
  const [members, setMembers] = useState<
    Record<
      string,
      { username: string; displayName: string | null; avatarUrl: string | null }
    >
  >({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const dropDepthRef = useRef(0);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const socket = useSocket();
  const toast = useToast();
  const { data: session } = useSession();
  const myName = session?.user?.username ?? 'я';

  const reload = useCallback(async () => {
    setLoading(true);
    const [convRes, msgsRes] = await Promise.all([
      fetch(`/api/conversations/${conversationId}`),
      fetch(`/api/conversations/${conversationId}/messages`),
    ]);
    const conv = await convRes.json();
    const msgs = await msgsRes.json();
    setPeer(conv.conversation?.peer ?? null);
    setConvType(conv.conversation?.type ?? 'DIRECT');
    setGroupMeta({
      title: conv.conversation?.title ?? null,
      description: conv.conversation?.description ?? null,
      avatarUrl: conv.conversation?.avatarUrl ?? null,
      memberCount: conv.conversation?.memberCount ?? null,
      myRole: conv.conversation?.myRole ?? 'MEMBER',
    });
    setMutedUntil(conv.conversation?.mutedUntil ?? null);
    setArchivedAt(conv.conversation?.archivedAt ?? null);
    setMessages(msgs.messages ?? []);
    setLoading(false);
    fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});

    // Pull the member roster for groups — used to attribute messages.
    if (conv.conversation?.type === 'GROUP') {
      fetch(`/api/conversations/${conversationId}/members`)
        .then((r) => r.json())
        .then((d) => {
          const map: Record<
            string,
            { username: string; displayName: string | null; avatarUrl: string | null }
          > = {};
          for (const m of d.members ?? []) {
            map[m.id] = {
              username: m.username,
              displayName: m.displayName,
              avatarUrl: m.avatarUrl,
            };
          }
          setMembers(map);
        })
        .catch(() => {});
    } else {
      setMembers({});
    }
  }, [conversationId]);

  const isSaved = convType === 'SAVED';

  useEffect(() => {
    reload();
  }, [reload]);

  // Close header menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const node = headerMenuRef.current;
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

  const isMuted =
    !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();
  const isArchived = !!archivedAt;
  const isGroup = convType === 'GROUP';

  async function setMute(duration: 1 | 8 | 24 | 'forever' | null) {
    const res = await fetch(`/api/conversations/${conversationId}/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration }),
    });
    if (!res.ok) {
      toast.push({ message: 'не удалось изменить', kind: 'error' });
      return;
    }
    const data = await res.json();
    setMutedUntil(data.mutedUntil ?? null);
    toast.push({
      message:
        duration === null
          ? 'звук включён'
          : duration === 'forever'
            ? 'отключено навсегда'
            : `отключено на ${duration}ч`,
    });
  }

  /**
   * Drag-and-drop upload. Detects type by MIME prefix and routes through
   * the same /api/upload pipeline the composer uses, including image
   * compression. Multiple files are sent sequentially.
   */
  async function handleDroppedFiles(files: File[]) {
    if (files.length === 0) return;
    for (const f of files) {
      const isImage = f.type.startsWith('image/');
      const isVideo = f.type.startsWith('video/');
      const type: 'IMAGE' | 'VIDEO' | 'FILE' = isImage
        ? 'IMAGE'
        : isVideo
          ? 'VIDEO'
          : 'FILE';
      const finalFile = isImage ? await compressImage(f) : f;
      const fd = new FormData();
      fd.append('file', finalFile);
      fd.append('kind', isImage ? 'image' : isVideo ? 'video' : 'file');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.push({ message: data.error ?? 'не удалось загрузить', kind: 'error' });
        continue;
      }
      const data = await res.json();
      await sendMessage({
        type,
        mediaUrl: data.url,
        mediaMimeType: data.mimeType,
        content: type === 'FILE' ? `${finalFile.name}|${finalFile.size}` : undefined,
      });
    }
  }

  async function toggleArchive() {
    const res = await fetch(`/api/conversations/${conversationId}/archive`, {
      method: 'POST',
    });
    if (!res.ok) {
      toast.push({ message: 'не удалось изменить', kind: 'error' });
      return;
    }
    const data = await res.json();
    setArchivedAt(data.archivedAt ?? null);
    toast.push({ message: data.archivedAt ? 'в архиве' : 'из архива' });
  }

  useEffect(() => {
    if (!socket) return;
    socket.emit('conversation:join', conversationId);

    const onMessage = (payload: { message: ChatMessage }) => {
      if (payload.message.conversationId !== conversationId) return;
      // Sender flow: optimistic insert + API response is enough — the broadcast
      // back to ourselves can race with the API resolution and create a duplicate.
      if (payload.message.senderId === currentUserId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
      fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(
        () => {},
      );
    };

    const onEdited = (payload: { message: ChatMessage }) => {
      if (payload.message.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.message.id ? { ...m, ...payload.message } : m)),
      );
    };

    const onDeleted = (payload: { conversationId: string; messageId: string }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? {
                ...m,
                content: null,
                mediaUrl: null,
                mediaMimeType: null,
                deletedAt: new Date().toISOString(),
                reactions: [],
              }
            : m,
        ),
      );
      // If we were replying to or editing the now-deleted message, clear it.
      setReplyTo((r) => (r && r.id === payload.messageId ? null : r));
      setEditing((e) => (e && e.id === payload.messageId ? null : e));
    };

    const onReaction = (payload: {
      conversationId: string;
      messageId: string;
      reactions: ReactionSummary[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      const localized = localizeReactions(payload.reactions, currentUserId);
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, reactions: localized } : m)),
      );
    };

    const onPinned = (payload: {
      conversationId: string;
      messageId: string;
      pinnedAt: string | null;
      pinnedById: string | null;
    }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, pinnedAt: payload.pinnedAt, pinnedById: payload.pinnedById }
            : m,
        ),
      );
    };

    const onRead = (payload: {
      conversationId: string;
      userId: string;
      messageIds: string[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.userId === currentUserId) return;
      setMessages((prev) =>
        prev.map((m) =>
          payload.messageIds.includes(m.id)
            ? { ...m, readBy: Array.from(new Set([...(m.readBy ?? []), payload.userId])) }
            : m,
        ),
      );
    };

    const onTyping = (payload: {
      conversationId: string;
      userId: string;
      isTyping: boolean;
    }) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.userId === currentUserId) return;
      setPeerTyping(payload.isTyping);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (payload.isTyping) {
        typingTimerRef.current = setTimeout(() => setPeerTyping(false), 4000);
      }
    };

    const onPresence = (p: { userId: string; isOnline: boolean }) => {
      if (peer && p.userId === peer.id) {
        setPeer({ ...peer, isOnline: p.isOnline });
      }
    };

    const onPollVoted = (payload: {
      conversationId: string;
      messageId: string;
      poll: Omit<PollView, 'options'> & {
        options: Array<Omit<PollView['options'][number], 'mine'>>;
      };
      voters: Record<string, string[]>;
    }) => {
      if (payload.conversationId !== conversationId) return;
      // Localize: pick `mine` from the voter map for our user id.
      const localized: PollView = {
        ...payload.poll,
        options: payload.poll.options.map((o) => ({
          ...o,
          mine: (payload.voters[o.id] ?? []).includes(currentUserId),
        })),
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, poll: localized } : m)),
      );
    };

    const onMembers = (payload: { conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
      // Member roster changed (added / kicked / role flip / leave). Just
      // reload the meta + roster so the header count and bubble names sync.
      reload();
    };

    const onGroupUpdated = (payload: {
      conversationId: string;
      title: string | null;
      description: string | null;
      avatarUrl: string | null;
    }) => {
      if (payload.conversationId !== conversationId) return;
      setGroupMeta((prev) => ({
        ...prev,
        title: payload.title,
        description: payload.description,
        avatarUrl: payload.avatarUrl,
      }));
    };

    const onGroupDeleted = (payload: { conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
      // Owner removed the group while we were inside it — bounce out.
      toast.push({ message: 'группа удалена' });
      window.location.href = '/chat';
    };

    socket.on('message:new', onMessage);
    socket.on('message:edited', onEdited);
    socket.on('message:deleted', onDeleted);
    socket.on('message:reaction', onReaction);
    socket.on('message:pinned', onPinned);
    socket.on('message:read', onRead);
    socket.on('members:changed', onMembers);
    socket.on('group:updated', onGroupUpdated);
    socket.on('group:deleted', onGroupDeleted);
    socket.on('poll:voted', onPollVoted);
    socket.on('typing', onTyping);
    socket.on('presence', onPresence);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:edited', onEdited);
      socket.off('message:deleted', onDeleted);
      socket.off('message:reaction', onReaction);
      socket.off('message:pinned', onPinned);
      socket.off('message:read', onRead);
      socket.off('members:changed', onMembers);
      socket.off('group:updated', onGroupUpdated);
      socket.off('group:deleted', onGroupDeleted);
      socket.off('poll:voted', onPollVoted);
      socket.off('typing', onTyping);
      socket.off('presence', onPresence);
    };
  }, [socket, conversationId, currentUserId, peer, reload]);

  async function sendMessage(input: {
    type: ChatMessage['type'];
    content?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
    durationMs?: number;
    replyToId?: string;
    scheduledAt?: string;
  }) {
    // Resolve the optimistic replyTo preview from local state so the bubble
    // can show the quote even before the server echoes back.
    const replied = input.replyToId
      ? messages.find((m) => m.id === input.replyToId)
      : null;
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      conversationId,
      senderId: currentUserId,
      type: input.type,
      content: input.content ?? null,
      mediaUrl: input.mediaUrl ?? null,
      mediaMimeType: input.mediaMimeType ?? null,
      durationMs: input.durationMs ?? null,
      createdAt: new Date().toISOString(),
      status: 'sending',
      readBy: [],
      replyToId: input.replyToId ?? null,
      scheduledAt: input.scheduledAt ?? null,
      scheduledFiredAt: null,
      replyTo: replied
        ? {
            id: replied.id,
            senderId: replied.senderId,
            senderName:
              replied.senderId === currentUserId
                ? myName
                : peer?.displayName ?? peer?.username ?? '',
            type: replied.type,
            content: replied.content,
            mediaUrl: replied.mediaUrl,
          }
        : null,
      reactions: [],
    };
    setMessages((prev) => [...prev, optimistic]);

    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...m, status: 'sending' } : m)),
      );
      toast.push({ message: 'не удалось отправить', kind: 'error' });
      return;
    }
    const data = await res.json();
    setMessages((prev) =>
      prev.map((m) =>
        m.id === optimistic.id ? { ...data.message, status: 'sent' } : m,
      ),
    );
  }

  function emitTyping(isTyping: boolean) {
    socket?.emit('typing', { conversationId, isTyping });
  }

  // Action handlers passed down to MessageList → MessageBubble.
  function handleReply(m: ChatMessage) {
    if (m.deletedAt) return;
    setEditing(null);
    setReplyTo({
      id: m.id,
      senderName:
        m.senderId === currentUserId
          ? myName
          : peer?.displayName ?? peer?.username ?? '',
      preview: previewOf(m),
    });
  }

  function handleEditStart(m: ChatMessage) {
    if (m.senderId !== currentUserId || m.type !== 'TEXT' || m.deletedAt) return;
    setReplyTo(null);
    setEditing({ id: m.id, initialContent: m.content ?? '' });
  }

  async function handleEditSubmit(id: string, content: string) {
    // Optimistic: patch the bubble locally first.
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, content, editedAt: new Date().toISOString() } : m,
      ),
    );
    const res = await fetch(`/api/conversations/${conversationId}/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const code = (data?.error as string) ?? '';
      toast.push({
        message:
          code === 'edit_window_expired'
            ? 'нельзя редактировать спустя 48 часов'
            : 'не удалось изменить',
        kind: 'error',
      });
      // Reload to revert.
      reload();
    }
  }

  async function handleDelete(m: ChatMessage) {
    if (m.senderId !== currentUserId || m.deletedAt) return;
    if (typeof window !== 'undefined' && !window.confirm('удалить сообщение?')) return;
    // Optimistic tombstone.
    setMessages((prev) =>
      prev.map((x) =>
        x.id === m.id
          ? {
              ...x,
              content: null,
              mediaUrl: null,
              mediaMimeType: null,
              deletedAt: new Date().toISOString(),
              reactions: [],
            }
          : x,
      ),
    );
    const res = await fetch(`/api/conversations/${conversationId}/messages/${m.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.push({ message: 'не удалось удалить', kind: 'error' });
      reload();
    }
  }

  async function handleReact(m: ChatMessage, emoji: string) {
    if (m.deletedAt) return;
    // Optimistic toggle.
    setMessages((prev) =>
      prev.map((x) => {
        if (x.id !== m.id) return x;
        const cur = x.reactions ?? [];
        const idx = cur.findIndex((r) => r.emoji === emoji);
        let next: ReactionSummary[];
        if (idx === -1) {
          next = [
            ...cur,
            { emoji, count: 1, userIds: [currentUserId], mine: true },
          ];
        } else {
          const r = cur[idx];
          if (r.mine) {
            const newCount = r.count - 1;
            next = newCount <= 0
              ? cur.filter((_, i) => i !== idx)
              : cur.map((rr, i) =>
                  i === idx
                    ? {
                        ...rr,
                        count: newCount,
                        userIds: rr.userIds.filter((u) => u !== currentUserId),
                        mine: false,
                      }
                    : rr,
                );
          } else {
            next = cur.map((rr, i) =>
              i === idx
                ? {
                    ...rr,
                    count: rr.count + 1,
                    userIds: [...rr.userIds, currentUserId],
                    mine: true,
                  }
                : rr,
            );
          }
        }
        return { ...x, reactions: next };
      }),
    );
    const res = await fetch(
      `/api/conversations/${conversationId}/messages/${m.id}/reactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.push({
        message:
          data?.error === 'too_many_reactions'
            ? `не больше ${data.max ?? 4} реакций`
            : 'реакция не сохранилась',
        kind: 'error',
      });
      reload();
      return;
    }
    const data = await res.json();
    if (data.reactions) {
      const localized = localizeReactions(data.reactions, currentUserId);
      setMessages((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, reactions: localized } : x)),
      );
    }
  }

  function handleJumpTo(messageId: string) {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-flash');
      setTimeout(() => el.classList.remove('msg-flash'), 1200);
    }
  }

  async function handleTogglePin(m: ChatMessage) {
    const wasPinned = !!m.pinnedAt;
    // Optimistic flip.
    setMessages((prev) =>
      prev.map((x) =>
        x.id === m.id
          ? {
              ...x,
              pinnedAt: wasPinned ? null : new Date().toISOString(),
              pinnedById: wasPinned ? null : currentUserId,
            }
          : x,
      ),
    );
    const res = await fetch(
      `/api/conversations/${conversationId}/messages/${m.id}/pin`,
      { method: 'POST' },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.push({
        message:
          data?.error === 'too_many_pins'
            ? `больше ${data.max ?? 10} закреплённых нельзя`
            : 'не удалось изменить закрепление',
        kind: 'error',
      });
      reload();
      return;
    }
    toast.push({ message: wasPinned ? 'откреплено' : 'закреплено' });
  }

  // Most-recently pinned message — drives the banner under the header.
  const pinned = useMemo(() => {
    const list = messages.filter((m) => m.pinnedAt && !m.deletedAt);
    list.sort((a, b) => (a.pinnedAt! < b.pinnedAt! ? 1 : -1));
    return list;
  }, [messages]);
  const topPinned = pinned[0] ?? null;

  // Whole-conversation image gallery — used by the lightbox so it can
  // navigate through every photo, not just the one tapped.
  const gallery: GalleryImage[] = useMemo(() => {
    const out: GalleryImage[] = [];
    for (const m of messages) {
      if (m.type !== 'IMAGE' || !m.mediaUrl || m.deletedAt) continue;
      const senderName =
        m.senderId === currentUserId
          ? 'вы'
          : members[m.senderId]?.displayName ??
            members[m.senderId]?.username ??
            peer?.displayName ??
            peer?.username ??
            '';
      out.push({
        id: m.id,
        url: m.mediaUrl,
        caption: senderName ? `${senderName}` : undefined,
      });
    }
    return out;
  }, [messages, members, peer, currentUserId]);

  /**
   * Optimistic poll vote. We update the local poll snapshot first so the
   * UI is instantly responsive, then call the server. The server's
   * authoritative response replaces our local view, and a 'poll:voted'
   * broadcast keeps everyone else in sync.
   */
  async function handleVote(messageId: string, optionIds: string[]) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.poll) return m;
        const wantSet = new Set(optionIds);
        const wasMine = m.poll.options.some((o) => o.mine);
        // Recompute counts: remove my old votes, add new ones.
        const updatedOptions = m.poll.options.map((o) => {
          const willBeMine = wantSet.has(o.id);
          const delta = (willBeMine ? 1 : 0) - (o.mine ? 1 : 0);
          return { ...o, mine: willBeMine, votes: o.votes + delta };
        });
        const myVoteDelta =
          (optionIds.length > 0 ? 1 : 0) - (wasMine ? 1 : 0);
        // For multi-choice the per-option deltas don't sum to 1; total is
        // really how many people voted. So we recount total based on
        // distinct user counts — but for this optimistic step, just track
        // whether *I* count toward total or not.
        const total = m.poll.totalVotes + myVoteDelta;
        return {
          ...m,
          poll: {
            ...m.poll,
            options: updatedOptions,
            totalVotes: Math.max(0, total),
          },
        };
      }),
    );

    const res = await fetch(
      `/api/conversations/${conversationId}/messages/${messageId}/vote`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds }),
      },
    );
    if (!res.ok) {
      toast.push({ message: 'не удалось проголосовать', kind: 'error' });
      reload();
      return;
    }
    const data = (await res.json()) as { poll: PollView };
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.poll ? { ...m, poll: data.poll } : m,
      ),
    );
  }

  function openImage(messageId: string) {
    const i = gallery.findIndex((g) => g.id === messageId);
    if (i === -1) return;
    setViewerIndex(i);
    setViewerOpen(true);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full min-h-0 chat-wallpaper relative"
      onDragEnter={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        dropDepthRef.current += 1;
        setDragOver(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        // Use depth tracking — dragLeave also fires when crossing child
        // element boundaries, otherwise the overlay flickers off mid-drag.
        dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
        if (dropDepthRef.current === 0) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer?.files?.length) return;
        e.preventDefault();
        dropDepthRef.current = 0;
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        handleDroppedFiles(files);
      }}
    >
      <header className="sticky top-0 z-10 bg-bg-panel/95 backdrop-blur border-b border-border flex items-center gap-3 px-3 md:px-5 py-2.5 pt-[max(env(safe-area-inset-top),0.625rem)]">
        <Link
          href="/chat"
          className="md:hidden -ml-1 p-2 -my-2 rounded-full text-text hover:bg-bg-hover active:bg-bg-hover/80 transition-colors"
          aria-label="назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {isSaved ? (
          <>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-fuchsia-500 flex items-center justify-center shrink-0 shadow-md shadow-accent/30">
              <Bookmark className="w-5 h-5 text-white" fill="currentColor" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate text-[15px]">Избранное</div>
              <div className="text-[12px] text-text-muted">личные заметки</div>
            </div>
          </>
        ) : isGroup ? (
          <>
            <button
              onClick={() => setInfoOpen(true)}
              className="flex items-center gap-3 flex-1 min-w-0 -my-1 -ml-1 pl-1 pr-2 py-1 rounded-xl hover:bg-bg-hover transition-colors text-left"
            >
              <GroupAvatar
                src={groupMeta.avatarUrl}
                name={groupMeta.title ?? 'группа'}
                size={40}
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate text-[15px]">
                  {groupMeta.title ?? 'группа'}
                </div>
                <div className="text-[12px] text-text-muted truncate">
                  {peerTyping ? (
                    <span className="text-accent">кто-то печатает…</span>
                  ) : (
                    `${groupMeta.memberCount ?? 1} участн${(groupMeta.memberCount ?? 1) === 1 ? 'ик' : (groupMeta.memberCount ?? 1) < 5 ? 'ика' : 'иков'}`
                  )}
                </div>
              </div>
            </button>
            <div className="relative" ref={headerMenuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="p-2 -mr-1 rounded-full text-text-muted hover:bg-bg-hover transition-colors"
                aria-label="меню чата"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-30 min-w-[200px] bg-bg-panel border border-border rounded-2xl p-1.5 shadow-2xl">
                  {isMuted ? (
                    <HMenuItem
                      icon={<Bell className="w-4 h-4" />}
                      label="включить звук"
                      onClick={() => {
                        setMute(null);
                        setMenuOpen(false);
                      }}
                    />
                  ) : (
                    <>
                      <HMenuItem icon={<BellOff className="w-4 h-4" />} label="без звука 1ч"
                        onClick={() => { setMute(1); setMenuOpen(false); }} />
                      <HMenuItem icon={<BellOff className="w-4 h-4" />} label="без звука 8ч"
                        onClick={() => { setMute(8); setMenuOpen(false); }} />
                      <HMenuItem icon={<BellOff className="w-4 h-4" />} label="без звука 24ч"
                        onClick={() => { setMute(24); setMenuOpen(false); }} />
                      <HMenuItem icon={<BellOff className="w-4 h-4" />} label="навсегда"
                        onClick={() => { setMute('forever'); setMenuOpen(false); }} />
                    </>
                  )}
                  <div className="h-px bg-border my-1" />
                  <HMenuItem
                    icon={isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    label={isArchived ? 'из архива' : 'в архив'}
                    onClick={() => { toggleArchive(); setMenuOpen(false); }}
                  />
                </div>
              )}
            </div>
          </>
        ) : peer ? (
          <>
            <Avatar
              src={peer.avatarUrl}
              name={peer.username}
              size={40}
              online={peer.isOnline}
            />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate text-[15px]">
                {peer.displayName ?? peer.username}
              </div>
              <div className="text-[12px] text-text-muted truncate">
                {peerTyping ? (
                  <span className="text-accent">печатает…</span>
                ) : peer.isOnline ? (
                  'в сети'
                ) : (
                  `был в сети в ${formatTime(peer.lastSeenAt)}`
                )}
              </div>
            </div>
            <CallButton
              peer={{
                id: peer.id,
                username: peer.username,
                displayName: peer.displayName,
                avatarUrl: peer.avatarUrl,
              }}
              conversationId={conversationId}
            />
            <div className="relative" ref={headerMenuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="p-2 -mr-1 rounded-full text-text-muted hover:bg-bg-hover transition-colors"
                aria-label="меню чата"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-30 min-w-[200px] bg-bg-panel border border-border rounded-2xl p-1.5 shadow-2xl">
                  {isMuted ? (
                    <HMenuItem
                      icon={<Bell className="w-4 h-4" />}
                      label="включить звук"
                      onClick={() => {
                        setMute(null);
                        setMenuOpen(false);
                      }}
                    />
                  ) : (
                    <>
                      <HMenuItem
                        icon={<BellOff className="w-4 h-4" />}
                        label="без звука 1ч"
                        onClick={() => {
                          setMute(1);
                          setMenuOpen(false);
                        }}
                      />
                      <HMenuItem
                        icon={<BellOff className="w-4 h-4" />}
                        label="без звука 8ч"
                        onClick={() => {
                          setMute(8);
                          setMenuOpen(false);
                        }}
                      />
                      <HMenuItem
                        icon={<BellOff className="w-4 h-4" />}
                        label="без звука 24ч"
                        onClick={() => {
                          setMute(24);
                          setMenuOpen(false);
                        }}
                      />
                      <HMenuItem
                        icon={<BellOff className="w-4 h-4" />}
                        label="навсегда"
                        onClick={() => {
                          setMute('forever');
                          setMenuOpen(false);
                        }}
                      />
                    </>
                  )}
                  <div className="h-px bg-border my-1" />
                  <HMenuItem
                    icon={
                      isArchived ? (
                        <ArchiveRestore className="w-4 h-4" />
                      ) : (
                        <Archive className="w-4 h-4" />
                      )
                    }
                    label={isArchived ? 'из архива' : 'в архив'}
                    onClick={() => {
                      toggleArchive();
                      setMenuOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          </>
        ) : null}
      </header>

      {/* Pinned banner — sticks under the header, click to jump. */}
      {topPinned && !isSaved && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleJumpTo(topPinned.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleJumpTo(topPinned.id);
            }
          }}
          className="flex items-center gap-3 px-3 md:px-5 py-2 bg-bg-panel/95 backdrop-blur border-b border-border text-left hover:bg-bg-hover cursor-pointer transition-colors"
        >
          <Pin className="w-4 h-4 text-accent shrink-0" />
          <div className="flex-1 min-w-0 border-l-2 border-accent pl-2">
            <div className="text-[12px] font-medium text-accent">
              закреплённое{pinned.length > 1 ? ` · ${pinned.length}` : ''}
            </div>
            <div className="text-[13px] text-text-muted truncate">
              {previewOf(topPinned)}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePin(topPinned);
            }}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
            aria-label="открепить"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <MessageList
        messages={messages}
        currentUserId={currentUserId}
        isGroup={isGroup}
        members={members}
        onReply={handleReply}
        onEdit={handleEditStart}
        onDelete={handleDelete}
        onReact={handleReact}
        onTogglePin={handleTogglePin}
        onJumpTo={handleJumpTo}
        onOpenImage={openImage}
        onVote={handleVote}
      />
      {!isSaved && peerTyping && <TypingIndicator />}

      <Composer
        conversationId={conversationId}
        onSend={sendMessage}
        onTyping={isSaved ? () => {} : emitTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        onSubmitEdit={handleEditSubmit}
      />

      {viewerOpen && (
        <ImageViewer
          images={gallery}
          startIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {/* Drag-and-drop overlay — visible while user drags a file over the chat. */}
      {dragOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/85 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3 px-6 py-8 rounded-2xl border-2 border-dashed border-accent bg-bg-panel/95">
            <Upload className="w-10 h-10 text-accent" />
            <div className="text-[15px] font-medium">отпусти, чтобы отправить</div>
          </div>
        </div>
      )}

      {isGroup && (
        <GroupInfoSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          conversationId={conversationId}
          title={groupMeta.title ?? 'группа'}
          description={groupMeta.description}
          avatarUrl={groupMeta.avatarUrl}
          myRole={groupMeta.myRole}
          meId={currentUserId}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function HMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm hover:bg-bg-hover transition-colors"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
