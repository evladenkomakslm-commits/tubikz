import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canManageMembers, loadGroupContext } from '@/lib/groups';
import { emitToConversation } from '@/server/socket-bus';

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

/** Edit group meta — title / description / avatar. Owner & admins only. */
const patchSchema = z.object({
  title: z.string().min(1).max(48).optional(),
  description: z.string().max(200).nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const ctx = await loadGroupContext(session.user.id, params.id);
  if (!ctx) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!canManageMembers(ctx.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }

  const data: {
    title?: string;
    description?: string | null;
    avatarUrl?: string | null;
  } = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description?.trim() || null;
  }
  if (parsed.data.avatarUrl !== undefined) {
    data.avatarUrl = parsed.data.avatarUrl || null;
  }

  const updated = await prisma.conversation.update({
    where: { id: params.id },
    data,
  });

  emitToConversation(params.id, 'group:updated', {
    conversationId: params.id,
    title: updated.title,
    description: updated.description,
    avatarUrl: updated.avatarUrl,
  });

  return NextResponse.json({
    title: updated.title,
    description: updated.description,
    avatarUrl: updated.avatarUrl,
  });
}

/** Delete a group entirely. Owner only. Cascades through Prisma to messages, etc. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const ctx = await loadGroupContext(session.user.id, params.id);
  if (!ctx) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (ctx.role !== 'OWNER') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Snapshot participant ids so we can broadcast a kick before the row is gone.
  const others = await prisma.participant.findMany({
    where: { conversationId: params.id },
    select: { userId: true },
  });

  await prisma.conversation.delete({ where: { id: params.id } });

  emitToConversation(params.id, 'group:deleted', {
    conversationId: params.id,
    userIds: others.map((o) => o.userId),
  });

  return NextResponse.json({ ok: true });
}
