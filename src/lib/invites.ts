import crypto from 'node:crypto';
import { prisma } from './db';

/**
 * Generate a new invite code. Format: 4-4 alphanumeric (e.g. "G7K2-9XQR").
 * Excluded look-alikes: 0/O/1/I/L/B/8.
 */
const ALPHA = 'ACDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(): string {
  const buf = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += ALPHA[buf[i] % ALPHA.length];
    if (i === 3) out += '-';
  }
  return out;
}

/** Look up an invite code; returns the row if it's valid (not used, not expired). */
export async function findValidInviteCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const invite = await prisma.inviteCode.findUnique({
    where: { code: normalized },
  });
  if (!invite) return null;
  if (invite.usedById) return null;
  if (invite.expiresAt && invite.expiresAt < new Date()) return null;
  return invite;
}

export async function consumeInviteCode(inviteId: string, userId: string) {
  await prisma.inviteCode.update({
    where: { id: inviteId },
    data: { usedById: userId, usedAt: new Date() },
  });
}
