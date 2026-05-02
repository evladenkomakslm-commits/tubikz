import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { messageSchema } from '@/lib/validators';
import { emitToConversation } from '@/server/socket-bus';
import { messageInclude, toChatMessage } from '@/lib/messages';
import { pushToUser } from '@/lib/push';
import { extractUrls, resolvePreviews } from '@/lib/link-preview';
import { isBlockedBetween } from '@/lib/blocks';
import { audienceAllows } from '@/lib/privacy';

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
  //
  // Scheduled-but-not-yet-fired messages are visible only to their sender,
  // so they can see / cancel their own pending sends without leaking them
  // to the other side of the chat.
  const messages = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      OR: [
        { scheduledAt: null },
        { scheduledFiredAt: { not: null } },
        { senderId: session.user.id },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: messageInclude,
  });

  // Bulk-fetch any cached link previews for URLs in the loaded TEXT
  // messages — no live HTTP, just whatever's already in the cache so the
  // history paint stays fast.
  const allUrls = new Set<string>();
  for (const m of messages) {
    if (m.type === 'TEXT' && m.content && !m.deletedAt) {
      for (const u of extractUrls(m.content)) allUrls.add(u);
    }
  }
  const previews =
    allUrls.size > 0
      ? await prisma.linkPreview.findMany({ where: { url: { in: [...allUrls] } } })
      : [];
  const previewByUrl = new Map(previews.map((p) => [p.url, p]));

  return NextResponse.json({
    messages: messages.reverse().map((m) => {
      const projected = toChatMessage(m, session.user.id);
      if (m.type === 'TEXT' && m.content && !m.deletedAt) {
        const urls = extractUrls(m.content);
        const matched = urls
          .map((u) => previewByUrl.get(u))
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => ({
            url: p.url,
            title: p.title,
            description: p.description,
            imageUrl: p.imageUrl,
            siteName: p.siteName,
          }));
        if (matched.length > 0) projected.linkPreviews = matched;
      }
      return projected;
    }),
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

  // Block + privacy gate for DIRECT chats: refuse to write a message
  // to a 1:1 conversation with a user who blocked you (or vice versa),
  // and respect the recipient's "who can message me" setting.
  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: {
      type: true,
      participants: { select: { userId: true } },
    },
  });
  if (conv?.type === 'DIRECT') {
    const peerId = conv.participants.find((p) => p.userId !== session.user.id)?.userId;
    if (peerId) {
      if (await isBlockedBetween(session.user.id, peerId)) {
        return NextResponse.json({ error: 'blocked' }, { status: 403 });
      }
      const peer = await prisma.user.findUnique({
        where: { id: peerId },
        select: { messageAudience: true },
      });
      if (
        peer &&
        !(await audienceAllows(peer.messageAudience, peerId, session.user.id))
      ) {
        return NextResponse.json({ error: 'not_allowed_to_message' }, { status: 403 });
      }
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = messageSchema.safeParse({ ...body, conversationId: params.id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const {
    type,
    content,
    mediaUrl,
    mediaMimeType,
    durationMs,
    replyToId,
    scheduledAt: scheduledAtRaw,
  } = parsed.data;
  if (type === 'TEXT' && !content?.trim()) {
    return NextResponse.json({ error: 'empty message' }, { status: 400 });
  }
  // LOCATION + CONTACT carry their data inside `content`, no mediaUrl.
  if (
    type !== 'TEXT' &&
    type !== 'LOCATION' &&
    type !== 'CONTACT' &&
    !mediaUrl
  ) {
    return NextResponse.json({ error: 'mediaUrl required' }, { status: 400 });
  }
  if ((type === 'LOCATION' || type === 'CONTACT') && !content?.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  // Schedule-for-later: clamp to future, max 1 year out.
  let scheduledAt: Date | null = null;
  if (scheduledAtRaw) {
    const target = new Date(scheduledAtRaw);
    const now = Date.now();
    if (target.getTime() < now + 30_000) {
      return NextResponse.json({ error: 'scheduled_too_soon' }, { status: 400 });
    }
    if (target.getTime() > now + 365 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'scheduled_too_far' }, { status: 400 });
    }
    scheduledAt = target;
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
      scheduledAt,
    },
    include: messageInclude,
  });

  // Scheduled messages don't bump the conversation's updatedAt — that
  // happens when they actually fire.
  if (!scheduledAt) {
    await prisma.conversation.update({
      where: { id: params.id },
      data: { updatedAt: new Date() },
    });
  }

  const initialPayload = toChatMessage(created, session.user.id);

  // Resolve link previews for any URLs in the message before broadcasting.
  // Cached previews come back instantly; uncached ones add ≤4s of latency
  // (the fetcher times out on its own). Treated as best-effort — we attach
  // whatever we could grab and move on.
  let payload = initialPayload;
  if (created.type === 'TEXT') {
    const urls = extractUrls(created.content);
    if (urls.length > 0) {
      const previews = await resolvePreviews(urls);
      if (previews.length > 0) {
        payload = { ...initialPayload, linkPreviews: previews };
      }
    }
  }

  // Scheduled messages aren't broadcast / pushed yet — they show up only
  // for the sender (handled in GET below) until the cron flips them.
  if (scheduledAt) {
    return NextResponse.json({ message: payload });
  }

  emitToConversation(params.id, 'message:new', { message: payload });

  // Fan out web-push to every other participant whose chat isn't muted.
  // Fire-and-forget — don't block the response on push delivery.
  void (async () => {
    try {
      const others = await prisma.participant.findMany({
        where: {
          conversationId: params.id,
          userId: { not: session.user.id },
          OR: [{ mutedUntil: null }, { mutedUntil: { lt: new Date() } }],
        },
        select: { userId: true },
      });
      const sender = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { username: true, displayName: true },
      });
      const senderName =
        sender?.displayName ?? sender?.username ?? 'кто-то';
      const body =
        type === 'TEXT'
          ? content?.slice(0, 140) ?? ''
          : type === 'IMAGE'
            ? '📷 фото'
            : type === 'VIDEO'
              ? '🎬 видео'
              : type === 'VOICE'
                ? '🎙 голосовое'
                : '📎 файл';
      await Promise.all(
        others.map((p) =>
          pushToUser(p.userId, {
            title: senderName,
            body,
            url: `/chat/${params.id}`,
            tag: `conv-${params.id}`,
          }),
        ),
      );
    } catch {
      // Push is best-effort; silence failures.
    }
  })();

  return NextResponse.json({ message: payload });
}
