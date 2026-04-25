import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server as IOServer } from 'socket.io';
import { getToken } from 'next-auth/jwt';
import { prisma } from './src/lib/db';
import { setIO } from './src/server/socket-bus';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? '0.0.0.0';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

void app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '/', true);
    handle(req, res, parsedUrl);
  });

  const io = new IOServer(httpServer, {
    path: '/api/socket',
    cors: { origin: '*' },
  });

  setIO(io);

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie ?? '';
      const fakeReq = { headers: { cookie: cookieHeader } } as Parameters<typeof getToken>[0]['req'];
      const token = await getToken({
        req: fakeReq,
        secret: process.env.NEXTAUTH_SECRET!,
      });
      if (!token?.uid) return next(new Error('unauthorized'));
      (socket.data as { userId?: string }).userId = token.uid as string;
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error('auth failed'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = (socket.data as { userId?: string }).userId;
    if (!userId) return socket.disconnect(true);

    socket.join(`user:${userId}`);

    // Join all conversation rooms the user belongs to.
    const parts = await prisma.participant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    for (const p of parts) socket.join(`conv:${p.conversationId}`);

    // Mark online + broadcast presence to friends.
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline: true, lastSeenAt: new Date() },
    });
    const friends = await prisma.friendship.findMany({
      where: { ownerId: userId },
      select: { friendId: true },
    });
    for (const f of friends) {
      io.to(`user:${f.friendId}`).emit('presence', { userId, isOnline: true });
    }

    socket.on('typing', (payload: { conversationId: string; isTyping: boolean }) => {
      if (!payload?.conversationId) return;
      socket.to(`conv:${payload.conversationId}`).emit('typing', {
        conversationId: payload.conversationId,
        userId,
        isTyping: !!payload.isTyping,
      });
    });

    socket.on('conversation:join', (conversationId: string) => {
      if (typeof conversationId === 'string') socket.join(`conv:${conversationId}`);
    });

    socket.on('disconnect', async () => {
      const remaining = await io.in(`user:${userId}`).fetchSockets();
      if (remaining.length === 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { isOnline: false, lastSeenAt: new Date() },
        });
        for (const f of friends) {
          io.to(`user:${f.friendId}`).emit('presence', { userId, isOnline: false });
        }
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`▶ ₮ubikz ready on http://${hostname}:${port}`);
  });
});
