import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { messageSchema } from '@/lib/validators';
import { emitToConversation } from '@/server/socket-bus';

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

  const messages = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { reads: { select: { userId: true, readAt: true } } },
  });

  return NextResponse.json({
    messages: messages.reverse().map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      type: m.type,
      content: m.content,
      mediaUrl: m.mediaUrl,
      mediaMimeType: m.mediaMimeType,
      durationMs: m.durationMs,
      createdAt: m.createdAt,
      readBy: m.reads.map((r) => r.userId),
    })),
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
  const { type, content, mediaUrl, mediaMimeType, durationMs } = parsed.data;
  if (type === 'TEXT' && !content?.trim()) {
    return NextResponse.json({ error: 'empty message' }, { status: 400 });
  }
  if (type !== 'TEXT' && !mediaUrl) {
    return NextResponse.json({ error: 'mediaUrl required' }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: {
      conversationId: params.id,
      senderId: session.user.id,
      type,
      content: content ?? null,
      mediaUrl: mediaUrl ?? null,
      mediaMimeType: mediaMimeType ?? null,
      durationMs: durationMs ?? null,
    },
  });

  await prisma.conversation.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  const payload = {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    content: message.content,
    mediaUrl: message.mediaUrl,
    mediaMimeType: message.mediaMimeType,
    durationMs: message.durationMs,
    createdAt: message.createdAt,
    readBy: [] as string[],
  };

  emitToConversation(params.id, 'message:new', { message: payload });

  return NextResponse.json({ message: payload });
}
