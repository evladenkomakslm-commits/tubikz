import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const STATIC_STUN: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

let cache: { servers: IceServer[]; expiresAt: number } | null = null;

/**
 * Returns the ICE-server list a client should use for WebRTC.
 *
 * Always includes public STUN. If CLOUDFLARE_TURN_TOKEN_ID +
 * CLOUDFLARE_TURN_API_TOKEN are set, mints short-lived TURN credentials
 * from Cloudflare Realtime (1 TB/month free, no expiry). Without TURN,
 * peers behind symmetric NAT (most mobile carriers) can't connect across
 * networks. Also honors a manual TURN_* trio as a last resort.
 *
 * Cloudflare creds are TTL'd (24h) and cached server-side for 1h.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json({ iceServers: cache.servers });
  }

  const servers: IceServer[] = [...STATIC_STUN];

  // Cloudflare Realtime TURN.
  const cfTokenId = process.env.CLOUDFLARE_TURN_TOKEN_ID;
  const cfApiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (cfTokenId && cfApiToken) {
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${cfTokenId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${cfApiToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ttl: 86400 }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { iceServers?: IceServer | IceServer[] };
        // Cloudflare returns either a single iceServers object or an array.
        if (Array.isArray(data.iceServers)) {
          servers.push(...data.iceServers);
        } else if (data.iceServers) {
          servers.push(data.iceServers);
        }
      } else {
        console.warn('[ice] cloudflare request failed', res.status);
      }
    } catch (e) {
      console.warn('[ice] cloudflare fetch error', e);
    }
  }

  // Manual TURN trio as a last-resort override.
  const turnUrl = process.env.TURN_URL;
  const turnUser = process.env.TURN_USERNAME;
  const turnCred = process.env.TURN_CREDENTIAL;
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  }

  cache = { servers, expiresAt: now + 60 * 60 * 1000 };
  return NextResponse.json({ iceServers: servers });
}
