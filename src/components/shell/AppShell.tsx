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
  user: { id: string; username: string; avatarUrl: string | null; isAdmin?: boolean };
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

  // Record the device on the active sessions page (UA + IP).
  useEffect(() => {
    fetch('/api/auth/sessions/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAgent: navigator.userAgent }),
    }).catch(() => {});
  }, []);

  return (
    <CallProvider>
      {/*
        Mobile (default): column with Sidebar at the bottom (bottom-tab nav).
        Desktop (md+): row with Sidebar on the left.
      */}
      <div className="h-[100dvh] w-screen flex flex-col-reverse md:flex-row overflow-hidden bg-bg">
        <Sidebar user={user} />
        <div className="flex-1 min-w-0 flex flex-col bg-bg-subtle overflow-hidden">
          {children}
        </div>
      </div>
      <DebugBar />
    </CallProvider>
  );
}
