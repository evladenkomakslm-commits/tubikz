import { prisma } from '@/lib/db';
import { emitToConversation } from '@/server/socket-bus';
import { messageInclude, toChatMessage } from '@/lib/messages';
import { pushToUser } from '@/lib/push';

const TICK_MS = 30_000; // 30s — same as Telegram's published delivery window
let timer: NodeJS.Timeout | null = null;

/**
 * Fire-due-scheduled-messages tick. Runs every 30s and on startup so that,
 * if the Render free-tier service slept through some scheduled times, all
 * the overdue messages are released the moment we wake up. Picks up at
 * most 50 messages per tick to keep DB load bounded.
 */
async function fireDue() {
  const now = new Date();
  const due = await prisma.message.findMany({
    where: {
      scheduledAt: { lte: now },
      scheduledFiredAt: null,
    },
    orderBy: { scheduledAt: 'asc' },
    take: 50,
    include: messageInclude,
  });
  if (due.length === 0) return;

  for (const m of due) {
    try {
      const updated = await prisma.message.update({
        where: { id: m.id },
        data: { scheduledFiredAt: now, createdAt: now },
        include: messageInclude,
      });
      // Bump the conversation so list previews / sort order refresh.
      await prisma.conversation.update({
        where: { id: m.conversationId },
        data: { updatedAt: now },
      });

      const payload = toChatMessage(updated, updated.senderId);
      emitToConversation(m.conversationId, 'message:new', { message: payload });

      // Push to muted-OK participants except the sender.
      const others = await prisma.participant.findMany({
        where: {
          conversationId: m.conversationId,
          userId: { not: updated.senderId },
          OR: [{ mutedUntil: null }, { mutedUntil: { lt: new Date() } }],
        },
        select: { userId: true },
      });
      const sender = await prisma.user.findUnique({
        where: { id: updated.senderId },
        select: { username: true, displayName: true },
      });
      const senderName = sender?.displayName ?? sender?.username ?? 'кто-то';
      const body =
        updated.type === 'TEXT'
          ? (updated.content ?? '').slice(0, 140)
          : updated.type === 'IMAGE'
            ? '📷 фото'
            : updated.type === 'VIDEO'
              ? '🎬 видео'
              : updated.type === 'VOICE'
                ? '🎙 голосовое'
                : updated.type === 'LOCATION'
                  ? '📍 локация'
                  : updated.type === 'CONTACT'
                    ? '👤 контакт'
                    : updated.type === 'POLL'
                      ? `📊 ${(updated.content ?? '').slice(0, 100)}`
                      : '📎 файл';
      await Promise.all(
        others.map((p) =>
          pushToUser(p.userId, {
            title: senderName,
            body,
            url: `/chat/${m.conversationId}`,
            tag: `conv-${m.conversationId}`,
          }),
        ),
      );
    } catch (e) {
      // Don't let one bad row stall the rest.
      console.error('[scheduler] failed to fire', m.id, e);
    }
  }
}

export function startScheduler() {
  if (timer) return;
  // Catch-up immediately on boot, then keep ticking.
  void fireDue();
  timer = setInterval(() => {
    fireDue().catch((e) => console.error('[scheduler] tick error', e));
  }, TICK_MS);
}
