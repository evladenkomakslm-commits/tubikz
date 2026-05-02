import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const audience = z.enum(['EVERYONE', 'FRIENDS', 'NOBODY']);

const schema = z.object({
  lastSeenAudience: audience.optional(),
  searchAudience: audience.optional(),
  messageAudience: audience.optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      lastSeenAudience: true,
      searchAudience: true,
      messageAudience: true,
    },
  });
  return NextResponse.json({ privacy: u });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }
  const u = await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: {
      lastSeenAudience: true,
      searchAudience: true,
      messageAudience: true,
    },
  });
  return NextResponse.json({ privacy: u });
}
