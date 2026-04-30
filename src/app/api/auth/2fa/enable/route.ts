import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { verifyTotp } from '@/lib/totp';

const schema = z.object({ token: z.string().regex(/^\d{6}$/) });

/**
 * Activate 2FA. Caller already started setup (so a row exists with enabled=false).
 * They scan the QR with an authenticator app and POST a 6-digit token to confirm.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const row = await prisma.totpSecret.findUnique({
    where: { userId: session.user.id },
  });
  if (!row) {
    return NextResponse.json({ error: 'no_setup' }, { status: 400 });
  }

  if (!verifyTotp(row.secret, parsed.data.token)) {
    return NextResponse.json({ error: 'wrong_code' }, { status: 400 });
  }

  await prisma.totpSecret.update({
    where: { userId: session.user.id },
    data: { enabled: true, enabledAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
