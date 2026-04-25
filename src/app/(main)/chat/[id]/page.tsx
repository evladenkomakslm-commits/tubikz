import { ChatRoom } from '@/components/chat/ChatRoom';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';

export default async function ChatRoomPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return notFound();

  const part = await prisma.participant.findUnique({
    where: {
      userId_conversationId: { userId: session.user.id, conversationId: params.id },
    },
  });
  if (!part) return notFound();

  return <ChatRoom conversationId={params.id} currentUserId={session.user.id} />;
}
