import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const MAX_MEMBERS = 30;

const schema = z.object({
  title: z.string().min(1, 'имя группы обязательно').max(48),
  description: z.string().max(200).optional(),
  avatarUrl: z.string().optional(),
  // List of friend ids to add. Caller is added as OWNER automatically and
  // doesn't need to appear here.
  memberIds: z.array(z.string().min(1)).min(1, 'добавь хотя бы одного').max(MAX_MEMBERS - 1),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const me = session.user.id;
  const requested = Array.from(new Set(parsed.data.memberIds.filter((id) => id !== me)));

  // Only allow adding people you're friends with — keeps spam attacks at bay.
  const friendships = await prisma.friendship.findMany({
    where: { ownerId: me, friendId: { in: requested } },
    select: { friendId: true },
  });
  const friendSet = new Set(friendships.map((f) => f.friendId));
  const validMembers = requested.filter((id) => friendSet.has(id));
  if (validMembers.length === 0) {
    return NextResponse.json({ error: 'no_valid_members' }, { status: 400 });
  }

  const conv = await prisma.conversation.create({
    data: {
      type: 'GROUP',
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      avatarUrl: parsed.data.avatarUrl || null,
      ownerId: me,
      participants: {
        create: [
          { userId: me, role: 'OWNER' },
          ...validMembers.map((id) => ({ userId: id, role: 'MEMBER' as const })),
        ],
      },
    },
  });

  return NextResponse.json({ id: conv.id });
}
