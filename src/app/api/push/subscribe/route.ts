import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(400).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }
  const { endpoint, keys, userAgent } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: session.user.id,
      endpoint,
      p256dh: keys.p256dh,
      authKey: keys.auth,
      userAgent: userAgent ?? null,
    },
    update: {
      userId: session.user.id,
      p256dh: keys.p256dh,
      authKey: keys.auth,
      userAgent: userAgent ?? null,
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null;
  if (!endpoint) return NextResponse.json({ ok: true });

  await prisma.pushSubscription
    .delete({ where: { endpoint } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
