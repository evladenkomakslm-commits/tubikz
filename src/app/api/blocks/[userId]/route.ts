import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Block a user. Idempotent. Implicitly tears down any friendship +
 * pending request between us so a blocked user disappears from the
 * friends list and can't try again.
 */
export async function POST(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const me = session.user.id;
  if (params.userId === me) {
    return NextResponse.json({ error: 'cannot_block_self' }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: me, blockedId: params.userId } },
      create: { blockerId: me, blockedId: params.userId },
      update: {},
    }),
    // Drop friendship in both directions.
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { ownerId: me, friendId: params.userId },
          { ownerId: params.userId, friendId: me },
        ],
      },
    }),
    // Drop any pending friend requests in either direction.
    prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { fromUserId: me, toUserId: params.userId },
          { fromUserId: params.userId, toUserId: me },
        ],
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

/** Unblock. Friendship is NOT auto-restored — the user has to re-friend. */
export async function DELETE(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await prisma.block
    .delete({
      where: {
        blockerId_blockedId: {
          blockerId: session.user.id,
          blockedId: params.userId,
        },
      },
    })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
