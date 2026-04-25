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
  const { requestId, action } = await req.json().catch(() => ({}));
  if (!requestId || (action !== 'accept' && action !== 'decline')) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  try {
    if (action === 'accept') {
      await acceptFriendRequest(requestId, session.user.id);
    } else {
      await prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: 'DECLINED' },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed' },
      { status: 400 },
    );
  }
}
