import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  return (
    <AppShell
      user={{
        id: session.user.id,
        username: session.user.username ?? 'tubik',
        avatarUrl: session.user.image ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}
