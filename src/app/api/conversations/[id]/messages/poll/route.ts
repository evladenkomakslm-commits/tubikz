import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { emitToConversation } from '@/server/socket-bus';
import { messageInclude, toChatMessage } from '@/lib/messages';
import { pushToUser } from '@/lib/push';

const schema = z.object({
  question: z.string().min(1, 'нужен вопрос').max(200),
  options: z
    .array(z.string().min(1).max(80))
    .min(2, 'добавь хотя бы два варианта')
    .max(10, 'не больше 10 вариантов'),
  multipleChoice: z.boolean().default(false),
  anonymous: z.boolean().default(false),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const me = session.user.id;

  const part = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId: me, conversationId: params.id } },
    select: { id: true },
  });
  if (!part) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { question, options, multipleChoice, anonymous } = parsed.data;
  const trimmedOptions = [
    ...new Set(options.map((o) => o.trim()).filter((o) => o.length > 0)),
  ];
  if (trimmedOptions.length < 2) {
    return NextResponse.json({ error: 'need_two_options' }, { status: 400 });
  }

  const created = await prisma.message.create({
    data: {
      conversationId: params.id,
      senderId: me,
      type: 'POLL',
      content: question.trim(),
      poll: {
        create: {
          question: question.trim(),
          multipleChoice,
          anonymous,
          options: {
            create: trimmedOptions.map((text, i) => ({ text, position: i })),
          },
        },
      },
    },
    include: messageInclude,
  });

  await prisma.conversation.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  const payload = toChatMessage(created, me);
  emitToConversation(params.id, 'message:new', { message: payload });

  // Same push fanout as a regular text message.
  void (async () => {
    try {
      const others = await prisma.participant.findMany({
        where: {
          conversationId: params.id,
          userId: { not: me },
          OR: [{ mutedUntil: null }, { mutedUntil: { lt: new Date() } }],
        },
        select: { userId: true },
      });
      const sender = await prisma.user.findUnique({
        where: { id: me },
        select: { username: true, displayName: true },
      });
      const senderName = sender?.displayName ?? sender?.username ?? 'кто-то';
      await Promise.all(
        others.map((p) =>
          pushToUser(p.userId, {
            title: senderName,
            body: `📊 ${question.trim().slice(0, 100)}`,
            url: `/chat/${params.id}`,
            tag: `conv-${params.id}`,
          }),
        ),
      );
    } catch {
      /* best-effort */
    }
  })();

  return NextResponse.json({ message: payload });
}
