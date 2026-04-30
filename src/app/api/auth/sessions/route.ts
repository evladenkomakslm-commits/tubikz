import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** List the current user's active sessions, marking which one is "this device". */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v.join('='));
  }
  const token = await getToken({
    req: { headers: { cookie: cookieHeader }, cookies } as Parameters<typeof getToken>[0]['req'],
    secret: process.env.NEXTAUTH_SECRET!,
    secureCookie: (process.env.NEXTAUTH_URL ?? '').startsWith('https://'),
  });
  const currentJti = token?.sid as string | undefined;

  const rows = await prisma.activeSession.findMany({
    where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: 'desc' },
  });

  return NextResponse.json({
    sessions: rows.map((r) => ({
      id: r.id,
      userAgent: r.userAgent,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt,
      lastActiveAt: r.lastActiveAt,
      expiresAt: r.expiresAt,
      isCurrent: r.jti === currentJti,
    })),
  });
}
