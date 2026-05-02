import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { messageSchema } from '@/lib/validators';
import { emitToConversation } from '@/server/socket-bus';
import { messageInclude, toChatMessage } from '@/lib/messages';

async function assertParticipant(userId: string, conversationId: string) {
  const part = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
  });
  return !!part;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await assertParticipant(session.user.id, params.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const before = url.searchParams.get('before');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100);

  // Note: we no longer hard-filter `deletedAt: null` — we still want the
  // tombstone visible in the timeline ("сообщение удалено") so reply chains
  // don't go silent. The projection in `toChatMessage` handles the redaction.
  const messages = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: messageInclude,
  });

  return NextResponse.json({
    messages: messages.reverse().map((m) => toChatMessage(m, session.user.id)),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await assertParticipant(session.user.id, params.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = messageSchema.safeParse({ ...body, conversationId: params.id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { type, content, mediaUrl, mediaMimeType, durationMs, replyToId } = parsed.data;
  if (type === 'TEXT' && !content?.trim()) {
    return NextResponse.json({ error: 'empty message' }, { status: 400 });
  }
  if (type !== 'TEXT' && !mediaUrl) {
    return NextResponse.json({ error: 'mediaUrl required' }, { status: 400 });
  }

  // Validate the reply target lives in the same conversation. Otherwise
  // someone could quote messages from chats they aren't in.
  let validReplyToId: string | null = null;
  if (replyToId) {
    const target = await prisma.message.findUnique({
      where: { id: replyToId },
      select: { conversationId: true, deletedAt: true },
    });
    if (target && target.conversationId === params.id && !target.deletedAt) {
      validReplyToId = replyToId;
    }
  }

  const created = await prisma.message.create({
    data: {
      conversationId: params.id,
      senderId: session.user.id,
      type,
      content: content ?? null,
      mediaUrl: mediaUrl ?? null,
      mediaMimeType: mediaMimeType ?? null,
      durationMs: durationMs ?? null,
      replyToId: validReplyToId,
    },
    include: messageInclude,
  });

  await prisma.conversation.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  const payload = toChatMessage(created, session.user.id);
  emitToConversation(params.id, 'message:new', { message: payload });

  return NextResponse.json({ message: payload });
}
