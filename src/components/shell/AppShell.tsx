'use client';
import { useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { Sidebar } from './Sidebar';
import { CallProvider } from '@/components/calls/CallProvider';
import { DebugBar } from '@/components/debug/DebugBar';

/**
 * Mirror the visual viewport's actual height into --app-h. iOS keeps the
 * layout viewport at full screen height regardless of the keyboard, so we
 * can't trust 100dvh / 100vh — they'd leave a strip of body bg below the
 * composer. visualViewport.height *is* the visible area, so we use it
 * verbatim and let body + AppShell pin to it.
 */
function useAppHeightVar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const apply = () => {
      const h = vv?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-h', `${h}px`);
    };
    apply();
    if (vv) {
      vv.addEventListener('resize', apply);
      vv.addEventListener('scroll', apply);
    }
    window.addEventListener('orientationchange', apply);
    return () => {
      if (vv) {
        vv.removeEventListener('resize', apply);
        vv.removeEventListener('scroll', apply);
      }
      window.removeEventListener('orientationchange', apply);
    };
  }, []);
}

export function AppShell({
  user,
  children,
}: {
  user: { id: string; username: string; avatarUrl: string | null; isAdmin?: boolean };
  children: React.ReactNode;
}) {
  const socket = useSocket();
  useAppHeightVar();

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
      <div
        // h-full == 100% of body, which itself is glued to --app-h
        // (== visualViewport.height). Keyboard open or closed, this
        // exactly fills the visible region.
        className="h-full w-screen flex flex-col-reverse md:flex-row overflow-hidden bg-bg"
      >
        <Sidebar user={user} />
        <div className="flex-1 min-w-0 flex flex-col bg-bg-subtle overflow-hidden">
          {children}
        </div>
      </div>
      <DebugBar />
    </CallProvider>
  );
}
