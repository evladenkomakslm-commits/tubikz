import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** Toggle archive state of a conversation for the current user. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const part = await prisma.participant.findUnique({
    where: {
      userId_conversationId: { userId: session.user.id, conversationId: params.id },
    },
    select: { id: true, archivedAt: true },
  });
  if (!part) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const next = part.archivedAt ? null : new Date();
  await prisma.participant.update({
    where: { id: part.id },
    data: { archivedAt: next },
  });
  return NextResponse.json({ archivedAt: next ? next.toISOString() : null });
}
