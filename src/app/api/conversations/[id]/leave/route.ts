import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loadGroupContext } from '@/lib/groups';
import { emitToConversation } from '@/server/socket-bus';

/**
 * Leave a group conversation.
 *
 *  - non-OWNER: just deletes the participant row.
 *  - OWNER:
 *      - if there's at least one ADMIN, ownership transfers to the
 *        oldest admin (joinedAt asc) before the OWNER row is removed.
 *      - else if there are MEMBERs left, the oldest member is promoted
 *        to OWNER first.
 *      - else (caller is the only person in the group) the group is
 *        deleted entirely (cascades to messages, etc.).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const me = session.user.id;

  const ctx = await loadGroupContext(me, params.id);
  if (!ctx) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (ctx.role !== 'OWNER') {
    await prisma.participant.delete({ where: { id: ctx.id } });
    emitToConversation(params.id, 'members:changed', { conversationId: params.id });
    return NextResponse.json({ ok: true, deletedConversation: false });
  }

  // OWNER path — find a successor.
  const successor = await prisma.participant.findFirst({
    where: { conversationId: params.id, userId: { not: me } },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
  });

  if (!successor) {
    // Last person — kill the group.
    await prisma.conversation.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, deletedConversation: true });
  }

  await prisma.$transaction([
    prisma.participant.update({
      where: { id: successor.id },
      data: { role: 'OWNER' },
    }),
    prisma.conversation.update({
      where: { id: params.id },
      data: { ownerId: successor.userId },
    }),
    prisma.participant.delete({ where: { id: ctx.id } }),
  ]);

  emitToConversation(params.id, 'members:changed', { conversationId: params.id });

  return NextResponse.json({ ok: true, deletedConversation: false });
}
