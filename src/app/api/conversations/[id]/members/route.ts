import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  MAX_MEMBERS,
  canManageMembers,
  loadGroupContext,
} from '@/lib/groups';
import { emitToConversation } from '@/server/socket-bus';

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

/** Add new members to a group (admin/owner). Caller must be friends with them. */
const addSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(MAX_MEMBERS),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const me = session.user.id;

  const ctx = await loadGroupContext(me, params.id);
  if (!ctx) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!canManageMembers(ctx.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }

  // Friend gate: only people you're friends with can be added (anti-spam).
  const friendships = await prisma.friendship.findMany({
    where: { ownerId: me, friendId: { in: parsed.data.userIds } },
    select: { friendId: true },
  });
  const friendSet = new Set(friendships.map((f) => f.friendId));

  // Skip users already in the group.
  const existing = await prisma.participant.findMany({
    where: { conversationId: params.id, userId: { in: parsed.data.userIds } },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((p) => p.userId));

  const toAdd = parsed.data.userIds.filter(
    (id) => friendSet.has(id) && !existingSet.has(id),
  );
  if (toAdd.length === 0) {
    return NextResponse.json({ error: 'nothing_to_add' }, { status: 400 });
  }

  // Capacity check.
  const total = await prisma.participant.count({
    where: { conversationId: params.id },
  });
  if (total + toAdd.length > MAX_MEMBERS) {
    return NextResponse.json(
      { error: 'too_many', max: MAX_MEMBERS },
      { status: 400 },
    );
  }

  await prisma.participant.createMany({
    data: toAdd.map((userId) => ({
      userId,
      conversationId: params.id,
      role: 'MEMBER',
    })),
  });

  emitToConversation(params.id, 'members:changed', {
    conversationId: params.id,
  });

  return NextResponse.json({ added: toAdd });
}
