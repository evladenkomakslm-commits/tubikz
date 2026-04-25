'use client';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

let singleton: Socket | null = null;

function ensureSocket(): Socket {
  if (singleton) {
    if (!singleton.connected && !singleton.active) {
      // Socket был остановлен полностью — пересоздаём.
      try {
        singleton.removeAllListeners();
        singleton.close();
      } catch {
        // ignore
      }
      singleton = null;
    } else {
      // Socket жив или сам пытается переподключиться — отдаём как есть.
      if (!singleton.connected) singleton.connect();
      return singleton;
    }
  }

  singleton = io({
    path: '/api/socket',
    // WebSocket-приоритет, polling как fallback. На Render WebSocket поддержан,
    // но прокси иногда роняет idle-соединения — auto-reconnect внутри socket.io
    // нас спасает.
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });
  return singleton;
}

export function getSocket(): Socket {
  return ensureSocket();
}

export function useSocket() {
  const ref = useRef<Socket | null>(null);
  const [, force] = useState(0);

  if (!ref.current) ref.current = ensureSocket();

  useEffect(() => {
    const s = ensureSocket();
    ref.current = s;

    // Если страница вернулась в фокус — проверим что сокет жив.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !s.connected) {
        s.connect();
      }
    };
    const onOnline = () => {
      if (!s.connected) s.connect();
    };
    const onConnect = () => force((x) => x + 1);
    const onDisconnect = () => force((x) => x + 1);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return ref.current;
}
