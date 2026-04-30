import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { prisma } from './db';

/**
 * Resolve the currently authenticated user IF they are flagged as admin.
 * Returns null in all non-admin cases (including unauthenticated). Use as
 * `if (!(await requireAdmin())) return 403`.
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isAdmin: true },
  });
  return user?.isAdmin ? user : null;
}
