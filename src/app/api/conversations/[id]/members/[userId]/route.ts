import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canActOn, canManageMembers, loadGroupContext } from '@/lib/groups';
import { emitToConversation } from '@/server/socket-bus';

/** Remove (kick) a member. Owner/admin only; can't kick yourself or owner. */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; userId: string } },
) {
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
  if (params.userId === me) {
    return NextResponse.json({ error: 'use_leave' }, { status: 400 });
  }

  const target = await prisma.participant.findUnique({
    where: {
      userId_conversationId: {
        userId: params.userId,
        conversationId: params.id,
      },
    },
  });
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canActOn(ctx.role, target.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await prisma.participant.delete({ where: { id: target.id } });

  emitToConversation(params.id, 'members:changed', { conversationId: params.id });

  return NextResponse.json({ ok: true });
}

/** Change a member's role. */
const patchSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; userId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const me = session.user.id;
  const ctx = await loadGroupContext(me, params.id);
  if (!ctx) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }
  const newRole = parsed.data.role;

  // Only the OWNER can transfer OWNER. Admins can't promote anyone to OWNER
  // and can't touch other admins or the owner.
  if (newRole === 'OWNER' && ctx.role !== 'OWNER') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!canManageMembers(ctx.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const target = await prisma.participant.findUnique({
    where: {
      userId_conversationId: {
        userId: params.userId,
        conversationId: params.id,
      },
    },
  });
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canActOn(ctx.role, target.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (target.userId === me && newRole !== 'OWNER') {
    return NextResponse.json({ error: 'no_self_demote' }, { status: 400 });
  }

  // Atomic owner transfer: demote previous owner to admin and promote target.
  if (newRole === 'OWNER') {
    await prisma.$transaction([
      prisma.participant.updateMany({
        where: { conversationId: params.id, role: 'OWNER' },
        data: { role: 'ADMIN' },
      }),
      prisma.participant.update({
        where: { id: target.id },
        data: { role: 'OWNER' },
      }),
      prisma.conversation.update({
        where: { id: params.id },
        data: { ownerId: target.userId },
      }),
    ]);
  } else {
    await prisma.participant.update({
      where: { id: target.id },
      data: { role: newRole },
    });
  }

  emitToConversation(params.id, 'members:changed', { conversationId: params.id });

  return NextResponse.json({ ok: true });
}
