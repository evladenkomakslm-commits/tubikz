import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Only allow deletion of un-used codes — once used they're tied to a user.
  const row = await prisma.inviteCode.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (row.usedById) {
    return NextResponse.json({ error: 'already_used' }, { status: 400 });
  }

  await prisma.inviteCode.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
