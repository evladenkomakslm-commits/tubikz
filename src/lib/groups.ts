import { prisma } from '@/lib/db';
import type { GroupRole } from '@prisma/client';

export const MAX_MEMBERS = 30;

/**
 * Permissions matrix:
 *   - OWNER  : everything (promote, demote, kick, edit, delete group)
 *   - ADMIN  : add/kick MEMBERs, edit group meta, can't touch OWNER
 *              or other ADMINs and can't demote themselves out of admin
 *   - MEMBER : just chat, can leave any time
 */
export function canManageMembers(role: GroupRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canActOn(actorRole: GroupRole, targetRole: GroupRole): boolean {
  if (actorRole === 'OWNER') return true;
  if (actorRole === 'ADMIN') return targetRole === 'MEMBER';
  return false;
}

/** Resolve participant + group context for the current user. */
export async function loadGroupContext(userId: string, conversationId: string) {
  const part = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
    include: { conversation: true },
  });
  if (!part) return null;
  if (part.conversation.type !== 'GROUP') return null;
  return part;
}
