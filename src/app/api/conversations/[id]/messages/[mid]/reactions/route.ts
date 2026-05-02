import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { reactionSchema } from '@/lib/validators';
import { emitToConversation } from '@/server/socket-bus';
import { aggregateReactions } from '@/lib/messages';

const MAX_DISTINCT_PER_USER = 4; // Telegram-style cap, prevents reaction spam

/**
 * Toggle a reaction. If the user already reacted with this emoji on this
 * message, remove it. Otherwise add it. Always broadcasts the up-to-date
 * aggregated reactions for the message so every client converges.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string; mid: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Caller must be a participant of the conversation that owns the message.
  const target = await prisma.message.findUnique({
    where: { id: params.mid },
    select: { conversationId: true, deletedAt: true },
  });
  if (!target || target.conversationId !== params.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (target.deletedAt) {
    return NextResponse.json({ error: 'deleted' }, { status: 410 });
  }
  const part = await prisma.participant.findUnique({
    where: {
      userId_conversationId: { userId: session.user.id, conversationId: params.id },
    },
    select: { id: true },
  });
  if (!part) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = reactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const emoji = parsed.data.emoji;

  const existing = await prisma.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: {
        messageId: params.mid,
        userId: session.user.id,
        emoji,
      },
    },
  });

  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
  } else {
    // Cap distinct emojis from one user on one message.
    const myCount = await prisma.messageReaction.count({
      where: { messageId: params.mid, userId: session.user.id },
    });
    if (myCount >= MAX_DISTINCT_PER_USER) {
      return NextResponse.json(
        { error: 'too_many_reactions', max: MAX_DISTINCT_PER_USER },
        { status: 400 },
      );
    }
    await prisma.messageReaction.create({
      data: { messageId: params.mid, userId: session.user.id, emoji },
    });
  }

  const rows = await prisma.messageReaction.findMany({
    where: { messageId: params.mid },
    select: { emoji: true, userId: true },
  });
  const reactions = aggregateReactions(rows, session.user.id);

  emitToConversation(params.id, 'message:reaction', {
    conversationId: params.id,
    messageId: params.mid,
    reactions: aggregateReactions(rows, ''), // server-broadcast: client recomputes `mine` itself
  });

  return NextResponse.json({ reactions });
}
