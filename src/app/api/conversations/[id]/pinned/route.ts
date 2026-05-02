import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { messageInclude, toChatMessage } from '@/lib/messages';

/** List currently pinned messages for a conversation, newest pin first. */
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

  const rows = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      pinnedAt: { not: null },
      deletedAt: null,
    },
    orderBy: { pinnedAt: 'desc' },
    include: messageInclude,
  });

  return NextResponse.json({
    messages: rows.map((m) => toChatMessage(m, session.user.id)),
  });
}
