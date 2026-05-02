import webpush from 'web-push';
import { prisma } from '@/lib/db';

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:owner@example.com';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!PUBLIC || !PRIVATE) return;
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send a payload to every active push subscription for `userId`.
 * 410/404 endpoints are pruned (the user revoked permission or the
 * browser invalidated them).
 */
export async function pushToUser(userId: string, payload: PushPayload) {
  ensureConfigured();
  if (!configured) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.authKey },
          },
          JSON.stringify(payload),
          { TTL: 60 },
        );
      } catch (e: unknown) {
        const err = e as { statusCode?: number };
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await prisma.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => {});
        }
      }
    }),
  );
}
