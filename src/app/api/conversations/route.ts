import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ensureDirectConversation } from '@/lib/friends';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const me = session.user.id;

  const parts = await prisma.participant.findMany({
    where: { userId: me },
    include: {
      conversation: {
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                  isOnline: true,
                  lastSeenAt: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  const summaries = await Promise.all(
    parts.map(async (p) => {
      const lastRaw = p.conversation.messages[0] ?? null;
      // Soft-deleted messages still show up in the timeline as a tombstone,
      // so the list preview should reflect that too.
      const last = lastRaw
        ? lastRaw.deletedAt
          ? { ...lastRaw, content: null, mediaUrl: null, mediaMimeType: null }
          : lastRaw
        : null;
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: p.conversationId,
          createdAt: { gt: p.lastReadAt },
          senderId: { not: me },
          deletedAt: null,
        },
      });
      const isGroup = p.conversation.type === 'GROUP';
      const others = p.conversation.participants.filter((x) => x.userId !== me);
      return {
        id: p.conversationId,
        type: p.conversation.type,
        title: p.conversation.title,
        avatarUrl: p.conversation.avatarUrl,
        memberCount: isGroup ? p.conversation.participants.length : null,
        peer: isGroup ? null : others[0]?.user ?? null,
        lastMessage: last
          ? {
              ...last,
              senderName: isGroup
                ? p.conversation.participants.find((x) => x.userId === last.senderId)
                    ?.user.username ?? null
                : null,
            }
          : null,
        unreadCount,
        updatedAt: p.conversation.updatedAt,
        mutedUntil: p.mutedUntil ? p.mutedUntil.toISOString() : null,
        archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
      };
    }),
  );

  summaries.sort((a, b) => {
    const ta = new Date(a.lastMessage?.createdAt ?? a.updatedAt).getTime();
    const tb = new Date(b.lastMessage?.createdAt ?? b.updatedAt).getTime();
    return tb - ta;
  });

  return NextResponse.json({ conversations: summaries });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { peerId } = await req.json().catch(() => ({}));
  if (!peerId || typeof peerId !== 'string') {
    return NextResponse.json({ error: 'peerId required' }, { status: 400 });
  }
  if (peerId === session.user.id) {
    return NextResponse.json({ error: 'cannot chat with yourself' }, { status: 400 });
  }
  const id = await ensureDirectConversation(session.user.id, peerId);
  return NextResponse.json({ id });
}
