import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/shell/AppShell';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userRow = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  return (
    <AppShell
      user={{
        id: session.user.id,
        username: session.user.username ?? 'tubik',
        avatarUrl: session.user.image ?? null,
        isAdmin: userRow?.isAdmin ?? false,
      }}
    >
      {children}
    </AppShell>
  );
}
