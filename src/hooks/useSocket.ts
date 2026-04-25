'use client';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

let singleton: Socket | null = null;

export function getSocket(): Socket {
  if (singleton && singleton.connected) return singleton;
  if (singleton) return singleton;
  singleton = io({
    path: '/api/socket',
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
  return singleton;
}

export function useSocket() {
  const ref = useRef<Socket | null>(null);
  useEffect(() => {
    ref.current = getSocket();
  }, []);
  return ref.current ?? getSocket();
}
