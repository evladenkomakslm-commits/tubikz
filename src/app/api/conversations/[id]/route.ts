import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const me = session.user.id;
  const part = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId: me, conversationId: params.id } },
  });
  if (!part) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
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
    },
  });
  if (!conversation) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const peer = conversation.participants.find((p) => p.userId !== me)?.user ?? null;

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      avatarUrl: conversation.avatarUrl,
      description: conversation.description,
      ownerId: conversation.ownerId,
      memberCount: conversation.type === 'GROUP' ? conversation.participants.length : null,
      myRole: part.role,
      peer,
      mutedUntil: part.mutedUntil ? part.mutedUntil.toISOString() : null,
      archivedAt: part.archivedAt ? part.archivedAt.toISOString() : null,
    },
  });
}
