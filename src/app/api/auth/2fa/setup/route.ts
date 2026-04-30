import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { newTotpSecret } from '@/lib/totp';

/**
 * Begin 2FA setup. Generates a fresh secret, stores it as enabled=false,
 * returns provisioning URI + QR data-URL to render in the UI.
 *
 * If the user already has an enabled secret, refuse — they must disable first.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const existing = await prisma.totpSecret.findUnique({
    where: { userId: session.user.id },
  });
  if (existing?.enabled) {
    return NextResponse.json({ error: 'already_enabled' }, { status: 400 });
  }

  const username = session.user.username ?? session.user.email ?? 'tubik';
  const { secret, uri } = newTotpSecret(username);

  await prisma.totpSecret.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, secret, enabled: false },
    update: { secret, enabled: false },
  });

  // QR as data URL — frontend can drop straight into <img src=...>
  const qrDataUrl = await QRCode.toDataURL(uri, {
    margin: 1,
    width: 280,
    color: { dark: '#ededf0', light: '#16161a' },
  });

  return NextResponse.json({ secret, uri, qrDataUrl });
}
