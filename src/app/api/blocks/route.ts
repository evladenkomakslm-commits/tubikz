import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** List users I have blocked. Used by the privacy settings card. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await prisma.block.findMany({
    where: { blockerId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      blocked: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });
  return NextResponse.json({
    blocks: rows.map((r) => ({
      id: r.blocked.id,
      username: r.blocked.username,
      displayName: r.blocked.displayName,
      avatarUrl: r.blocked.avatarUrl,
      blockedAt: r.createdAt.toISOString(),
    })),
  });
}
