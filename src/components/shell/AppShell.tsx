'use client';
import { useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { Sidebar } from './Sidebar';
import { CallProvider } from '@/components/calls/CallProvider';
import { DebugBar } from '@/components/debug/DebugBar';

/**
 * Pin AppShell to the *visual* viewport rather than the layout viewport.
 *
 * On iOS Safari, focusing an input opens the keyboard and shifts the
 * visualViewport up by ~300px. position:fixed elements still anchor to
 * the layout viewport, so anything `bottom: 0` ends up under the keyboard,
 * and the page scrolls weirdly. Telegram-style fix: drive AppShell with
 * `position: fixed` + a manual translateY equal to visualViewport.offsetTop
 * and a height equal to visualViewport.height. Now the whole app lives
 * exactly inside the visible window, no matter what iOS does with the
 * layout viewport.
 */
function useViewportVars() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const apply = () => {
      const h = vv?.height ?? window.innerHeight;
      const top = vv?.offsetTop ?? 0;
      document.documentElement.style.setProperty('--app-h', `${h}px`);
      document.documentElement.style.setProperty('--app-top', `${top}px`);
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
  useViewportVars();

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
        // Pinned to the visual viewport. iOS will move the visualViewport
        // (offsetTop) and shrink it (height) when the keyboard opens —
        // this div follows in lock-step, so the composer is always glued
        // to the top of the keyboard.
        style={{
          position: 'fixed',
          top: 'var(--app-top, 0px)',
          left: 0,
          width: '100%',
          height: 'var(--app-h, 100dvh)',
        }}
        className="flex flex-col-reverse md:flex-row overflow-hidden bg-bg"
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
