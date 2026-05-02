import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { messageEditSchema } from '@/lib/validators';
import { emitToConversation } from '@/server/socket-bus';
import { messageInclude, toChatMessage } from '@/lib/messages';

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48h, matches Telegram

async function loadOwn(userId: string, conversationId: string, messageId: string) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      senderId: true,
      conversationId: true,
      type: true,
      createdAt: true,
      deletedAt: true,
    },
  });
  if (!msg || msg.conversationId !== conversationId) return null;
  return msg;
}

/** Edit text content. Sender only, TEXT only, within 48h, not deleted. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; mid: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const msg = await loadOwn(session.user.id, params.id, params.mid);
  if (!msg) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (msg.senderId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (msg.deletedAt) {
    return NextResponse.json({ error: 'deleted' }, { status: 410 });
  }
  if (msg.type !== 'TEXT') {
    return NextResponse.json({ error: 'not_editable' }, { status: 400 });
  }
  if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) {
    return NextResponse.json({ error: 'edit_window_expired' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = messageEditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const updated = await prisma.message.update({
    where: { id: params.mid },
    data: { content: parsed.data.content, editedAt: new Date() },
    include: messageInclude,
  });

  const payload = toChatMessage(updated, session.user.id);
  emitToConversation(params.id, 'message:edited', { message: payload });

  return NextResponse.json({ message: payload });
}

/** Soft-delete. Sender only. Replaces content with a tombstone marker. */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; mid: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const msg = await loadOwn(session.user.id, params.id, params.mid);
  if (!msg) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (msg.senderId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (msg.deletedAt) {
    // Idempotent — no-op response.
    return NextResponse.json({ ok: true });
  }

  await prisma.message.update({
    where: { id: params.mid },
    data: { deletedAt: new Date(), content: null, mediaUrl: null, mediaMimeType: null },
  });
  // Drop reactions on a deleted message — they'd be confusing.
  await prisma.messageReaction.deleteMany({ where: { messageId: params.mid } });

  emitToConversation(params.id, 'message:deleted', {
    conversationId: params.id,
    messageId: params.mid,
  });

  return NextResponse.json({ ok: true });
}
