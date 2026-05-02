import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const FOREVER = new Date('2999-01-01T00:00:00Z');
const HOURS = z.union([z.literal(1), z.literal(8), z.literal(24)]);

const schema = z.object({
  // null  → unmute
  // 1/8/24 → mute for that many hours from now
  // 'forever' → muted indefinitely
  duration: z.union([z.null(), HOURS, z.literal('forever')]),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const part = await prisma.participant.findUnique({
    where: {
      userId_conversationId: { userId: session.user.id, conversationId: params.id },
    },
    select: { id: true },
  });
  if (!part) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }

  let mutedUntil: Date | null;
  if (parsed.data.duration === null) {
    mutedUntil = null;
  } else if (parsed.data.duration === 'forever') {
    mutedUntil = FOREVER;
  } else {
    mutedUntil = new Date(Date.now() + parsed.data.duration * 60 * 60 * 1000);
  }

  await prisma.participant.update({
    where: { id: part.id },
    data: { mutedUntil },
  });

  return NextResponse.json({
    mutedUntil: mutedUntil ? mutedUntil.toISOString() : null,
  });
}
