import type { Server as IOServer } from 'socket.io';

/**
 * Bridge module so Next.js API routes (running in the same Node process)
 * can emit socket events without a circular import on the server bootstrap.
 */
const g = globalThis as unknown as { __io?: IOServer };

export function setIO(io: IOServer) {
  g.__io = io;
}

export function getIO(): IOServer | undefined {
  return g.__io;
}

export function emitToConversation(
  conversationId: string,
  event: string,
  payload: unknown,
) {
  const io = getIO();
  if (!io) return;
  io.to(`conv:${conversationId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  const io = getIO();
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}
