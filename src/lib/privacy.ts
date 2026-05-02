import { prisma } from '@/lib/db';
import type { PrivacyAudience } from '@prisma/client';

/** Are these two users friends (own side, irrespective of "owner")? */
async function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  const row = await prisma.friendship.findFirst({
    where: { ownerId: a, friendId: b },
    select: { id: true },
  });
  return !!row;
}

/**
 * Decide whether `viewerId` is allowed to see / do something gated by
 * `audience` set on `ownerId`'s profile.
 *
 *   EVERYONE → always yes
 *   FRIENDS  → yes if (a) viewer is owner, or (b) viewer is owner's friend
 *   NOBODY   → only owner themselves
 */
export async function audienceAllows(
  audience: PrivacyAudience,
  ownerId: string,
  viewerId: string | null | undefined,
): Promise<boolean> {
  if (!viewerId) return audience === 'EVERYONE';
  if (viewerId === ownerId) return true;
  if (audience === 'EVERYONE') return true;
  if (audience === 'NOBODY') return false;
  return await areFriends(ownerId, viewerId);
}
