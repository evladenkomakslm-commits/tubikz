import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { emitToConversation } from '@/server/socket-bus';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const me = session.user.id;

  const part = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId: me, conversationId: params.id } },
  });
  if (!part) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const unread = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      senderId: { not: me },
      reads: { none: { userId: me } },
      deletedAt: null,
    },
    select: { id: true },
  });

  if (unread.length) {
    await prisma.$transaction(
      unread.map((m) =>
        prisma.messageRead.upsert({
          where: { messageId_userId: { messageId: m.id, userId: me } },
          create: { messageId: m.id, userId: me },
          update: {},
        }),
      ),
    );
  }

  await prisma.participant.update({
    where: { userId_conversationId: { userId: me, conversationId: params.id } },
    data: { lastReadAt: new Date() },
  });

  emitToConversation(params.id, 'message:read', {
    conversationId: params.id,
    userId: me,
    messageIds: unread.map((m) => m.id),
  });

  return NextResponse.json({ readCount: unread.length });
}
