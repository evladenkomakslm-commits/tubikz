import { prisma } from '@/lib/db';

/**
 * Returns true if either user blocks the other. Both directions
 * matter: if A blocks B, B also can't reach A.
 */
export async function isBlockedBetween(
  userA: string,
  userB: string,
): Promise<boolean> {
  if (userA === userB) return false;
  const row = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

/** True if `me` has blocked `them` specifically (one direction). */
export async function hasBlocked(me: string, them: string): Promise<boolean> {
  if (me === them) return false;
  const row = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId: me, blockedId: them } },
    select: { id: true },
  });
  return !!row;
}

/** Returns the set of user ids the current user has blocked. */
export async function blockedByMe(me: string): Promise<Set<string>> {
  const rows = await prisma.block.findMany({
    where: { blockerId: me },
    select: { blockedId: true },
  });
  return new Set(rows.map((r) => r.blockedId));
}
