import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { InvitesPanel } from '@/components/admin/InvitesPanel';

export default async function AdminInvitesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) redirect('/chat');

  return (
    <div className="h-full overflow-y-auto scroll-smooth-y">
      <InvitesPanel />
    </div>
  );
}
