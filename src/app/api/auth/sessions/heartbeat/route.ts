import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Client-side heartbeat: lets us record User-Agent and approximate IP
 * (which the NextAuth jwt callback can't see). Called on first authenticated
 * mount of AppShell.
 */
const schema = z.object({ userAgent: z.string().max(400).optional() });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true });

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
  if (!token?.sid) return NextResponse.json({ ok: true });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;

  await prisma.activeSession
    .update({
      where: { jti: token.sid as string },
      data: {
        userAgent: parsed.data.userAgent ?? null,
        ipAddress: ip,
        lastActiveAt: new Date(),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
