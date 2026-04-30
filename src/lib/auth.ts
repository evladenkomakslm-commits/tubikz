import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from './db';
import { loginSchema } from './validators';
import { verifyTotp } from './totp';
import { AUTH_ERR } from './auth-errors';

export { AUTH_ERR };

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'email', type: 'email' },
        password: { label: 'password', type: 'password' },
        totpCode: { label: 'totpCode', type: 'text' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) throw new Error(AUTH_ERR.WRONG);

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          include: { totp: true },
        });
        if (!user) throw new Error(AUTH_ERR.WRONG);

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) throw new Error(AUTH_ERR.WRONG);

        // 2FA gate. If user has TOTP enabled, the code is required and must verify.
        if (user.totp?.enabled) {
          if (!parsed.data.totpCode) {
            throw new Error(AUTH_ERR.NEEDS_2FA);
          }
          if (!verifyTotp(user.totp.secret, parsed.data.totpCode)) {
            throw new Error(AUTH_ERR.WRONG_2FA);
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.username,
          image: user.avatarUrl ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Fresh sign-in: provision a server-tracked session row and stash its jti
      // in the JWT. The presence of that row is what makes the JWT "valid" —
      // delete the row to revoke the device.
      if (user) {
        token.uid = user.id;
        token.username = user.name;
        // Don't overwrite if we somehow already have one (NextAuth retries).
        const sid = (token.sid as string | undefined) ?? crypto.randomUUID();
        token.sid = sid;
        try {
          await prisma.activeSession.create({
            data: {
              userId: user.id,
              jti: sid,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });
        } catch {
          // race / collision — fall through; session check will catch it
        }
        return token;
      }

      // Subsequent JWT reads: validate the sid is still active.
      if (token.sid && typeof token.sid === 'string') {
        const row = await prisma.activeSession.findUnique({
          where: { jti: token.sid },
          select: { id: true, expiresAt: true },
        });
        if (!row || row.expiresAt < new Date()) {
          return { ...token, uid: undefined };
        }
        // Cheap heartbeat — bump lastActiveAt no more than once a minute.
        const lastBumpAt = (token.lastBump as number | undefined) ?? 0;
        const now = Date.now();
        if (now - lastBumpAt > 60_000) {
          prisma.activeSession
            .update({
              where: { jti: token.sid },
              data: { lastActiveAt: new Date() },
            })
            .catch(() => {});
          token.lastBump = now;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid as string;
        session.user.username = token.username as string;
      } else {
        return { ...session, user: undefined as unknown as typeof session.user };
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      // 'token' is present in JWT strategy but typed loosely on this event.
      const sid = (message as { token?: { sid?: string } }).token?.sid;
      if (sid) {
        await prisma.activeSession
          .deleteMany({ where: { jti: sid } })
          .catch(() => {});
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
