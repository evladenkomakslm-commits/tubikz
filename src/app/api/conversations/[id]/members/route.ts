import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** Members of a conversation (works for groups + direct, mainly used by groups). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const part = await prisma.participant.findUnique({
    where: {
      userId_conversationId: { userId: session.user.id, conversationId: params.id },
    },
    select: { id: true },
  });
  if (!part) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const rows = await prisma.participant.findMany({
    where: { conversationId: params.id },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
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
  });

  return NextResponse.json({
    members: rows.map((r) => ({
      id: r.user.id,
      username: r.user.username,
      displayName: r.user.displayName,
      avatarUrl: r.user.avatarUrl,
      isOnline: r.user.isOnline,
      lastSeenAt: r.user.lastSeenAt,
      role: r.role,
      joinedAt: r.joinedAt,
    })),
  });
}
