import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { acceptFriendRequest } from '@/lib/friends';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { toUserId } = await req.json().catch(() => ({}));
  if (!toUserId || typeof toUserId !== 'string') {
    return NextResponse.json({ error: 'toUserId required' }, { status: 400 });
  }
  if (toUserId === session.user.id) {
    return NextResponse.json({ error: 'cannot add yourself' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!target) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const existingFriendship = await prisma.friendship.findUnique({
    where: { ownerId_friendId: { ownerId: session.user.id, friendId: toUserId } },
  });
  if (existingFriendship) return NextResponse.json({ status: 'already_friends' });

  const reverse = await prisma.friendRequest.findUnique({
    where: {
      fromUserId_toUserId: { fromUserId: toUserId, toUserId: session.user.id },
    },
  });
  if (reverse && reverse.status === 'PENDING') {
    await acceptFriendRequest(reverse.id, session.user.id);
    return NextResponse.json({ status: 'accepted' });
  }

  await prisma.friendRequest.upsert({
    where: { fromUserId_toUserId: { fromUserId: session.user.id, toUserId } },
    create: { fromUserId: session.user.id, toUserId, status: 'PENDING' },
    update: { status: 'PENDING' },
  });
  return NextResponse.json({ status: 'sent' });
}
