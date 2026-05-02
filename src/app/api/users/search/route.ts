import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audienceAllows } from '@/lib/privacy';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const me = session.user.id;
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ users: [] });

  // Skip anyone I've blocked / who's blocked me, then DB-prefilter by name.
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: me }, { blockedId: me }] },
    select: { blockerId: true, blockedId: true },
  });
  const hidden = new Set<string>();
  for (const b of blocks) {
    hidden.add(b.blockerId === me ? b.blockedId : b.blockerId);
  }

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: me } },
        ...(hidden.size > 0 ? [{ id: { notIn: [...hidden] } }] : []),
        {
          OR: [
            { username: { contains: q } },
            { displayName: { contains: q } },
          ],
        },
      ],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isOnline: true,
      searchAudience: true,
    },
    take: 50,
  });

  // Apply searchAudience — drop users who didn't permit you to find them.
  const visible = await Promise.all(
    users.map(async (u) =>
      (await audienceAllows(u.searchAudience, u.id, me)) ? u : null,
    ),
  );

  return NextResponse.json({
    users: visible
      .filter((u): u is NonNullable<typeof u> => !!u)
      .slice(0, 20)
      // Strip the privacy field from the public response.
      .map(({ searchAudience: _s, ...rest }) => rest),
  });
}
