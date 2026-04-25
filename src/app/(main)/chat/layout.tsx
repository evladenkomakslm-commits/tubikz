import { ChatList } from '@/components/chat/ChatList';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      <ChatList />
      <section className="flex-1 min-w-0 flex flex-col bg-bg-subtle">{children}</section>
    </div>
  );
}
