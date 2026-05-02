import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const schema = z.object({
  targetUserId: z.string().min(1).optional(),
  targetMessageId: z.string().min(1).optional(),
  reason: z.enum(['SPAM', 'HARASSMENT', 'EXPLICIT', 'OTHER']),
  details: z.string().max(500).optional(),
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
  if (!parsed.data.targetUserId && !parsed.data.targetMessageId) {
    return NextResponse.json({ error: 'target_required' }, { status: 400 });
  }
  // Resolve targetUserId from message if only message was supplied.
  let targetUserId = parsed.data.targetUserId ?? null;
  if (!targetUserId && parsed.data.targetMessageId) {
    const m = await prisma.message.findUnique({
      where: { id: parsed.data.targetMessageId },
      select: { senderId: true },
    });
    targetUserId = m?.senderId ?? null;
  }
  await prisma.report.create({
    data: {
      reporterId: session.user.id,
      targetUserId,
      targetMessageId: parsed.data.targetMessageId ?? null,
      reason: parsed.data.reason,
      details: parsed.data.details ?? null,
    },
  });
  return NextResponse.json({ ok: true });
}
