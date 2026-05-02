import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { pushToUser } from '@/lib/push';

/**
 * Hit this endpoint while logged in to fire a test push to yourself.
 * Surfaces diagnostic info so you can tell apart "no subscription" vs
 * "subscription exists but VAPID delivery failed".
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const subs = await prisma.pushSubscription.count({
    where: { userId: session.user.id },
  });
  if (subs === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'no_subscriptions',
      hint: 'go to profile → notifications → enable push',
    });
  }
  await pushToUser(session.user.id, {
    title: '🔔 Тест уведомления',
    body: 'если ты это видишь — push работает',
    url: '/chat',
    tag: 'tk-test',
  });
  return NextResponse.json({
    ok: true,
    subs,
    vapidConfigured:
      !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      !!process.env.VAPID_PRIVATE_KEY,
  });
}
