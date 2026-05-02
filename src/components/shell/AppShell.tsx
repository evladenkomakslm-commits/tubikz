'use client';
import { useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { Sidebar } from './Sidebar';
import { CallProvider } from '@/components/calls/CallProvider';
import { DebugBar } from '@/components/debug/DebugBar';

/**
 * Track the iOS soft-keyboard height by watching `visualViewport`.
 * `interactive-widget=resizes-content` does this for free on iOS 16.4+,
 * but older iOS / older Capacitor WebView still leave a black gap below
 * the composer. Mirroring the visual viewport into a CSS variable lets
 * AppShell's outer container shrink in lockstep.
 */
function useKeyboardOffsetVar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${offset}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
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
  useKeyboardOffsetVar();

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
        // height = visible viewport minus on-screen keyboard. On platforms
        // that respect `interactive-widget=resizes-content`, --kb stays 0
        // because the dvh itself shrinks; the JS hook is a fallback.
        style={{ height: 'calc(100dvh - var(--kb, 0px))' }}
        className="w-screen flex flex-col-reverse md:flex-row overflow-hidden bg-bg"
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
