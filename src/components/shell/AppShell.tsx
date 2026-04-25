'use client';
import { useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { Sidebar } from './Sidebar';
import { CallProvider } from '@/components/calls/CallProvider';
import { DebugBar } from '@/components/debug/DebugBar';

export function AppShell({
  user,
  children,
}: {
  user: { id: string; username: string; avatarUrl: string | null };
  children: React.ReactNode;
}) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => {
      // Heartbeat / connection logged
    };
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [socket]);

  return (
    <CallProvider>
      <div className="h-screen w-screen flex overflow-hidden bg-bg">
        <Sidebar user={user} />
        <div className="flex-1 min-w-0 flex flex-col bg-bg-subtle">{children}</div>
      </div>
      <DebugBar />
    </CallProvider>
  );
}
