import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { registerSchema } from '@/lib/validators';
import { findValidInviteCode } from '@/lib/invites';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const username = parsed.data.username.toLowerCase();
  const inviteCode = parsed.data.inviteCode;

  // Validate invite code BEFORE checking duplicates — bots will fail here.
  const invite = await findValidInviteCode(inviteCode);
  if (!invite) {
    return NextResponse.json(
      { error: 'invalid_invite', message: 'код приглашения неверен или уже использован' },
      { status: 400 },
    );
  }

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (exists) {
    return NextResponse.json(
      {
        error: 'taken',
        field: exists.email === email ? 'email' : 'username',
      },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { email, username, passwordHash, displayName: username },
      select: { id: true, email: true, username: true },
    });
    await tx.inviteCode.update({
      where: { id: invite.id },
      data: { usedById: u.id, usedAt: new Date() },
    });
    return u;
  });

  return NextResponse.json({ user }, { status: 201 });
}
