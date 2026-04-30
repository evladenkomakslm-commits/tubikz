import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** "Logout other devices" — keep current jti, drop everything else. */
export async function POST(req: Request) {
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

  const result = await prisma.activeSession.deleteMany({
    where: {
      userId: session.user.id,
      ...(currentJti ? { NOT: { jti: currentJti } } : {}),
    },
  });

  return NextResponse.json({ removed: result.count });
}
