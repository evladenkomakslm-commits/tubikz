import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** Returns whether the current user has 2FA enabled. UI uses this to render the toggle state. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const row = await prisma.totpSecret.findUnique({
    where: { userId: session.user.id },
    select: { enabled: true, enabledAt: true },
  });
  return NextResponse.json({
    enabled: row?.enabled ?? false,
    enabledAt: row?.enabledAt ?? null,
  });
}
