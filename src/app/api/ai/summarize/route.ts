import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { summarizeMessages } from '@/lib/ai';
import { aiRateLimit } from '@/lib/ai-rate-limit';

/**
 * GET /api/ai/summarize?conversationId=...&limit=200
 * Pulls the last N text/poll messages from a conversation the caller
 * participates in and returns a short Russian summary.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rl = aiRateLimit(session.user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rl.retryAfter },
      { status: 429 },
    );
  }
  const url = new URL(req.url);
  const conversationId = url.searchParams.get('conversationId');
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
  }
  const limit = Math.min(
    Math.max(20, Number(url.searchParams.get('limit') ?? 80)),
    300,
  );

  const part = await prisma.participant.findUnique({
    where: {
      userId_conversationId: { userId: session.user.id, conversationId },
    },
    select: { id: true },
  });
  if (!part) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      type: { in: ['TEXT', 'POLL'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      sender: { select: { username: true, displayName: true } },
    },
  });
  const ordered = rows.reverse();
  const lines = ordered
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({
      author: m.sender.displayName ?? m.sender.username,
      text: m.content!.trim(),
    }));
  if (lines.length === 0) {
    return NextResponse.json({ summary: 'нечего пересказывать — чат пуст.' });
  }
  const summary = await summarizeMessages(lines);
  if (!summary) {
    return NextResponse.json({ error: 'ai_failed' }, { status: 502 });
  }
  return NextResponse.json({ summary, messageCount: lines.length });
}
