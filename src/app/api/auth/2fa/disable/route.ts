import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { verifyTotp } from '@/lib/totp';

/**
 * Disable 2FA. We require BOTH the current password AND a valid TOTP code,
 * to prevent a stolen-session attacker from turning off 2FA.
 */
const schema = z.object({
  password: z.string().min(1),
  token: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { totp: true },
  });
  if (!user || !user.totp || !user.totp.enabled) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const passOk = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!passOk) {
    return NextResponse.json({ error: 'wrong_password' }, { status: 400 });
  }
  if (!verifyTotp(user.totp.secret, parsed.data.token)) {
    return NextResponse.json({ error: 'wrong_code' }, { status: 400 });
  }

  await prisma.totpSecret.delete({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
