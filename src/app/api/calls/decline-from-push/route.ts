import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { emitToUser } from '@/server/socket-bus';

/**
 * Tapped "Отклонить" on the incoming-call push notification.
 * Tells the caller (via socket) we declined. Symmetric to what
 * `signaling.decline` would emit if the app were open.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const callerId = typeof body?.callerId === 'string' ? body.callerId : null;
  const callId = typeof body?.callId === 'string' ? body.callId : null;
  if (!callerId || !callId) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }
  emitToUser(callerId, 'call:decline', {
    callId,
    from: session.user.id,
  });
  return NextResponse.json({ ok: true });
}
