import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { emitToConversation } from '@/server/socket-bus';
import { toPollView } from '@/lib/messages';

const schema = z.object({
  // Single-choice polls expect length 1 (or 0 to revoke). Multi-choice
  // accepts 0..N. Server enforces using poll.multipleChoice.
  optionIds: z.array(z.string().min(1)).max(10),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string; mid: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const me = session.user.id;

  const part = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId: me, conversationId: params.id } },
    select: { id: true },
  });
  if (!part) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }

  const msg = await prisma.message.findUnique({
    where: { id: params.mid },
    include: {
      poll: {
        include: { options: true },
      },
    },
  });
  if (!msg || msg.conversationId !== params.id || !msg.poll) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (msg.poll.closedAt) {
    return NextResponse.json({ error: 'closed' }, { status: 400 });
  }

  const validOptionIds = new Set(msg.poll.options.map((o) => o.id));
  const requested = parsed.data.optionIds.filter((id) => validOptionIds.has(id));

  if (!msg.poll.multipleChoice && requested.length > 1) {
    return NextResponse.json({ error: 'single_choice_only' }, { status: 400 });
  }

  // Replace vote set atomically: drop everything for this user on this poll,
  // then re-insert what they picked. Idempotent for a "tap to unvote" UX.
  await prisma.$transaction([
    prisma.pollVote.deleteMany({
      where: { pollId: msg.poll.id, userId: me },
    }),
    ...(requested.length > 0
      ? [
          prisma.pollVote.createMany({
            data: requested.map((optionId) => ({
              pollId: msg.poll!.id,
              optionId,
              userId: me,
            })),
          }),
        ]
      : []),
  ]);

  // Re-read the full poll for the broadcast / response.
  const fresh = await prisma.poll.findUnique({
    where: { id: msg.poll.id },
    include: { options: { include: { votes: true } }, votes: true },
  });
  if (!fresh) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const projected = toPollView(fresh, me);

  // Broadcast carries per-option voterIds so each receiver localizes
  // its own `mine` flags. Anonymous polls still send these — the
  // anonymity flag drives UI rendering, not data transfer between
  // each user's own clients.
  const voters: Record<string, string[]> = {};
  for (const o of fresh.options) {
    voters[o.id] = o.votes.map((v) => v.userId);
  }
  emitToConversation(params.id, 'poll:voted', {
    conversationId: params.id,
    messageId: msg.id,
    poll: { ...projected, mine: undefined },
    voters,
  });

  return NextResponse.json({ poll: projected });
}
