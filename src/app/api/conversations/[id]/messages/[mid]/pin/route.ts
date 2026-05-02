import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { emitToConversation } from '@/server/socket-bus';

const MAX_PINNED = 10; // Telegram-ish — keep the banner finite

/** Toggle pin/unpin on a message. Any participant of the chat can pin. */
export async function POST(
  _req: Request,
  { params }: { params: { id: string; mid: string } },
) {
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

  const msg = await prisma.message.findUnique({
    where: { id: params.mid },
    select: {
      id: true,
      conversationId: true,
      pinnedAt: true,
      deletedAt: true,
    },
  });
  if (!msg || msg.conversationId !== params.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (msg.deletedAt) {
    return NextResponse.json({ error: 'deleted' }, { status: 410 });
  }

  let pinnedAt: Date | null;
  let pinnedById: string | null;

  if (msg.pinnedAt) {
    // Currently pinned → unpin.
    await prisma.message.update({
      where: { id: msg.id },
      data: { pinnedAt: null, pinnedById: null },
    });
    pinnedAt = null;
    pinnedById = null;
  } else {
    // Cap concurrent pins per conversation.
    const count = await prisma.message.count({
      where: { conversationId: params.id, pinnedAt: { not: null } },
    });
    if (count >= MAX_PINNED) {
      return NextResponse.json(
        { error: 'too_many_pins', max: MAX_PINNED },
        { status: 400 },
      );
    }
    pinnedAt = new Date();
    pinnedById = session.user.id;
    await prisma.message.update({
      where: { id: msg.id },
      data: { pinnedAt, pinnedById },
    });
  }

  emitToConversation(params.id, 'message:pinned', {
    conversationId: params.id,
    messageId: msg.id,
    pinnedAt: pinnedAt ? pinnedAt.toISOString() : null,
    pinnedById,
  });

  return NextResponse.json({
    pinnedAt: pinnedAt ? pinnedAt.toISOString() : null,
    pinnedById,
  });
}
