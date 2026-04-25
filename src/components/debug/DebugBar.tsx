'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSocket } from '@/hooks/useSocket';
import { useDebugStore } from '@/lib/debug-store';

interface LogEntry {
  ts: number;
  text: string;
  kind: 'in' | 'out' | 'sys';
}

export function DebugBar() {
  const { data: session } = useSession();
  const socket = useSocket();
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<LogEntry[]>([]);
  const visibleByCommand = useDebugStore((s) => s.visible);
  const [byUrl, setByUrl] = useState(false);
  const enabled = visibleByCommand || byUrl;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setByUrl(new URLSearchParams(window.location.search).has('debug'));
  }, []);

  useEffect(() => {
    if (!enabled || !socket) return;

    const push = (entry: LogEntry) => {
      logsRef.current = [...logsRef.current, entry].slice(-30);
      setLogs([...logsRef.current]);
    };

    const onConnect = () => {
      setConnected(true);
      push({ ts: Date.now(), text: `connected · sid=${socket.id?.slice(0, 6)}`, kind: 'sys' });
    };
    const onDisconnect = (reason: string) => {
      setConnected(false);
      push({ ts: Date.now(), text: `disconnected · ${reason}`, kind: 'sys' });
    };
    const onConnectError = (err: Error) => {
      push({ ts: Date.now(), text: `connect_error · ${err.message}`, kind: 'sys' });
    };
    const onAny = (event: string, ...args: unknown[]) => {
      const summary = JSON.stringify(args[0] ?? '').slice(0, 100);
      push({ ts: Date.now(), text: `← ${event} · ${summary}`, kind: 'in' });
    };
    const onAnyOutgoing = (event: string, ...args: unknown[]) => {
      const summary = JSON.stringify(args[0] ?? '').slice(0, 100);
      push({ ts: Date.now(), text: `→ ${event} · ${summary}`, kind: 'out' });
    };

    setConnected(socket.connected);
    if (socket.connected) {
      push({ ts: Date.now(), text: `already connected · sid=${socket.id?.slice(0, 6)}`, kind: 'sys' });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.onAny(onAny);
    socket.onAnyOutgoing(onAnyOutgoing);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.offAny(onAny);
      socket.offAnyOutgoing(onAnyOutgoing);
    };
  }, [enabled, socket]);

  if (!enabled) return null;

  const time = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-3 left-3 z-[200] w-[360px] max-w-[90vw] rounded-xl bg-black/90 border border-border backdrop-blur p-3 text-[11px] font-mono shadow-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-danger'}`}
          />
          <span className="text-text-muted">
            socket: {connected ? 'connected' : 'disconnected'}
          </span>
        </div>
        <button
          onClick={() => {
            logsRef.current = [];
            setLogs([]);
          }}
          className="text-text-subtle hover:text-text"
        >
          clear
        </button>
      </div>
      <div className="text-text-subtle text-[10px] mb-2">
        me: {session?.user?.id?.slice(0, 12) ?? '—'}
        {socket?.id && ` · sid: ${socket.id.slice(0, 6)}`}
      </div>
      <div className="max-h-[260px] overflow-y-auto scroll-smooth-y space-y-0.5">
        {logs.length === 0 && (
          <div className="text-text-subtle text-[10px]">пусто. сделай действие</div>
        )}
        {logs.map((l, i) => (
          <div
            key={i}
            className={
              l.kind === 'in'
                ? 'text-success'
                : l.kind === 'out'
                  ? 'text-accent'
                  : 'text-text-muted'
            }
          >
            <span className="text-text-subtle">{time(l.ts)} </span>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}
