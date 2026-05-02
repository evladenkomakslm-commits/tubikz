import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server as IOServer } from 'socket.io';
import { getToken } from 'next-auth/jwt';
import { prisma } from './src/lib/db';
import { setIO } from './src/server/socket-bus';
import { startScheduler } from './src/server/scheduler';
import { pushToUser } from './src/lib/push';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 3000);
// Always bind to 0.0.0.0 — Render/Heroku/etc set HOSTNAME to the pod name,
// which makes the server unreachable from the edge proxy.
const hostname = '0.0.0.0';

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
    // Render и многие прокси режут idle TCP через ~30s. Шлём пинг каждые 20s,
    // так соединение никогда не считается idle.
    pingInterval: 20_000,
    pingTimeout: 25_000,
    transports: ['websocket', 'polling'],
    // Не мешать nginx-proxy-у с буферизацией ответов polling.
    allowEIO3: false,
    maxHttpBufferSize: 5e6,
  });

  setIO(io);

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie ?? '';

      // Parse cookie header into a plain object — NextAuth's getToken reads
      // req.cookies (object), not req.headers.cookie (string). Without this,
      // the SessionStore inside getToken silently sees zero cookies and
      // always returns null.
      const cookies: Record<string, string> = {};
      for (const part of cookieHeader.split(';')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const name = trimmed.slice(0, eq);
        const value = trimmed.slice(eq + 1);
        try {
          cookies[name] = decodeURIComponent(value);
        } catch {
          cookies[name] = value;
        }
      }

      const isHttps = (process.env.NEXTAUTH_URL ?? '').startsWith('https://');
      const fakeReq = {
        headers: { cookie: cookieHeader },
        cookies,
      } as unknown as Parameters<typeof getToken>[0]['req'];

      let token = await getToken({
        req: fakeReq,
        secret: process.env.NEXTAUTH_SECRET!,
        secureCookie: isHttps,
      });
      // Belt-and-suspenders: try the other scheme too in case of edge proxies.
      if (!token?.uid) {
        token = await getToken({
          req: fakeReq,
          secret: process.env.NEXTAUTH_SECRET!,
          secureCookie: !isHttps,
          cookieName: !isHttps
            ? '__Secure-next-auth.session-token'
            : 'next-auth.session-token',
        });
      }

      if (!token?.uid) {
        const cookieNames = Object.keys(cookies).join(',');
        console.warn(`[socket-auth] NO_TOKEN cookies=[${cookieNames}] nextauth_url=${process.env.NEXTAUTH_URL}`);
        return next(new Error('unauthorized'));
      }
      (socket.data as { userId?: string }).userId = token.uid as string;
      next();
    } catch (err) {
      console.error('[socket-auth] error', err);
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

    // ===== Call signaling (1-on-1) =====
    // All events carry { peerId } indicating the *other* user. We forward to user:<peerId>.
    const fwd = (event: string) => async (payload: { peerId: string } & Record<string, unknown>) => {
      if (!payload?.peerId || typeof payload.peerId !== 'string') return;
      const room = `user:${payload.peerId}`;
      const sockets = await io.in(room).fetchSockets();
      console.log(
        `[call] ${event} from=${userId} → peer=${payload.peerId}` +
        ` (sockets in room: ${sockets.length})`,
      );
      io.to(room).emit(event, { ...payload, from: userId });
    };

    // Special-case call:invite — also fire web push so the callee gets
    // an OS-level notification when the app isn't open.
    socket.on(
      'call:invite',
      async (payload: { peerId: string } & Record<string, unknown>) => {
        if (!payload?.peerId || typeof payload.peerId !== 'string') return;
        io.to(`user:${payload.peerId}`).emit('call:invite', {
          ...payload,
          from: userId,
        });
        // Best-effort push fan-out.
        void (async () => {
          try {
            const caller = await prisma.user.findUnique({
              where: { id: userId },
              select: { username: true, displayName: true },
            });
            const callType = (payload as { callType?: 'AUDIO' | 'VIDEO' })
              .callType;
            const conversationId =
              (payload as { conversationId?: string }).conversationId ?? '';
            await pushToUser(payload.peerId, {
              title:
                callType === 'VIDEO' ? '📹 Видеозвонок' : '📞 Входящий звонок',
              body: caller?.displayName ?? caller?.username ?? '',
              url: `/chat/${conversationId}`,
              tag: `call-${userId}`,
            });
          } catch {
            /* push is best-effort */
          }
        })();
      },
    );
    socket.on('call:answer', fwd('call:answer'));
    socket.on('call:ice', fwd('call:ice'));
    socket.on('call:cancel', fwd('call:cancel'));
    socket.on('call:decline', fwd('call:decline'));
    socket.on('call:hangup', fwd('call:hangup'));
    socket.on('call:renegotiate', fwd('call:renegotiate'));
    socket.on('call:reaction', fwd('call:reaction'));

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

  // Kick off the scheduled-message poller. Free-tier sleep is fine — on
  // wake-up the first tick releases everything that came due in the gap.
  startScheduler();

  httpServer.listen(port, hostname, () => {
    console.log(`▶ ₮ubikz ready on http://${hostname}:${port}`);
  });
});
