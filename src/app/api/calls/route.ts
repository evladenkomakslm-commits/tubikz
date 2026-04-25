import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { emitToConversation } from '@/server/socket-bus';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.callId || !body?.conversationId || !body?.callerId || !body?.calleeId) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const part = await prisma.participant.findUnique({
    where: {
      userId_conversationId: {
        userId: session.user.id,
        conversationId: body.conversationId,
      },
    },
  });
  if (!part) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Idempotent on callId — caller and callee both POST when call ends.
  const existing = await prisma.call.findFirst({
    where: { id: body.callId },
  });

  let call = existing;
  if (!existing) {
    call = await prisma.call.create({
      data: {
        id: body.callId,
        conversationId: body.conversationId,
        callerId: body.callerId,
        calleeId: body.calleeId,
        type: body.type === 'VIDEO' ? 'VIDEO' : 'AUDIO',
        status: body.status ?? 'ENDED',
        startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
        answeredAt: body.answeredAt ? new Date(body.answeredAt) : null,
        endedAt: body.endedAt ? new Date(body.endedAt) : new Date(),
        durationMs: body.durationMs ?? null,
        endReason: body.endReason ?? null,
      },
    });

    // Drop a system message in the conversation so it shows up in history.
    const labelDuration = (ms: number) => {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    };
    let label: string;
    if (call.status === 'MISSED') label = 'пропущенный звонок';
    else if (call.status === 'DECLINED') label = 'звонок отклонён';
    else if (call.durationMs) label = `звонок · ${labelDuration(call.durationMs)}`;
    else label = 'звонок завершён';

    const msg = await prisma.message.create({
      data: {
        conversationId: call.conversationId,
        senderId: call.callerId,
        type: 'CALL',
        content: label,
        callId: call.id,
        durationMs: call.durationMs ?? null,
      },
    });

    await prisma.conversation.update({
      where: { id: call.conversationId },
      data: { updatedAt: new Date() },
    });

    emitToConversation(call.conversationId, 'message:new', {
      message: {
        id: msg.id,
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        type: msg.type,
        content: msg.content,
        mediaUrl: null,
        mediaMimeType: null,
        durationMs: msg.durationMs,
        callId: msg.callId,
        createdAt: msg.createdAt,
        readBy: [],
      },
    });
  }

  return NextResponse.json({ call });
}
