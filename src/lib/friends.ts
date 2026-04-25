import { prisma } from './db';

export async function acceptFriendRequest(requestId: string, currentUserId: string) {
  const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
  if (!request || request.toUserId !== currentUserId) {
    throw new Error('request not found');
  }
  if (request.status !== 'PENDING') return;

  await prisma.$transaction([
    prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' },
    }),
    prisma.friendship.upsert({
      where: {
        ownerId_friendId: {
          ownerId: request.fromUserId,
          friendId: request.toUserId,
        },
      },
      create: { ownerId: request.fromUserId, friendId: request.toUserId },
      update: {},
    }),
    prisma.friendship.upsert({
      where: {
        ownerId_friendId: {
          ownerId: request.toUserId,
          friendId: request.fromUserId,
        },
      },
      create: { ownerId: request.toUserId, friendId: request.fromUserId },
      update: {},
    }),
  ]);
}

/** Find or create a 1-1 conversation between two users. */
export async function ensureDirectConversation(userA: string, userB: string) {
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { participants: { some: { userId: userA } } },
        { participants: { some: { userId: userB } } },
      ],
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.conversation.create({
    data: {
      type: 'DIRECT',
      participants: { create: [{ userId: userA }, { userId: userB }] },
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Find or create the user's "Saved Messages" conversation
 * (a chat with themselves — single participant).
 */
export async function ensureSavedConversation(userId: string) {
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'SAVED',
      participants: { some: { userId } },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.conversation.create({
    data: {
      type: 'SAVED',
      title: 'Избранное',
      participants: { create: [{ userId }] },
    },
    select: { id: true },
  });
  return created.id;
}
