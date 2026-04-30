import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** Revoke a specific session. The owning JWT becomes invalid on its next read. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const row = await prisma.activeSession.findUnique({ where: { id: params.id } });
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  await prisma.activeSession.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
