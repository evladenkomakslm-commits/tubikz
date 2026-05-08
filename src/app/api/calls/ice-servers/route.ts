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
 * Always includes a few public STUNs. If METERED_API_KEY is set, also
 * returns short-lived TURN credentials from metered.ca's free tier
 * (50 GB / month). Without TURN, peers behind symmetric NAT (most
 * mobile carriers) can't connect across networks — that's why a
 * tubikz↔batya call only works on the same Wi-Fi until TURN is wired.
 *
 * Result is cached for 1h on the server so we aren't hammering the
 * metered API on every call setup.
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

  // Fold in Metered TURN if configured.
  const meteredKey = process.env.METERED_API_KEY;
  const meteredApp = process.env.METERED_APP_NAME;
  if (meteredKey && meteredApp) {
    try {
      const res = await fetch(
        `https://${meteredApp}.metered.live/api/v1/turn/credentials?apiKey=${meteredKey}`,
        { next: { revalidate: 0 } },
      );
      if (res.ok) {
        const data = (await res.json()) as IceServer[];
        if (Array.isArray(data)) {
          servers.push(...data);
        }
      } else {
        console.warn('[ice] metered request failed', res.status);
      }
    } catch (e) {
      console.warn('[ice] metered fetch error', e);
    }
  }

  // Fall back to a manual TURN if the user wired one explicitly.
  const turnUrl = process.env.TURN_URL;
  const turnUser = process.env.TURN_USERNAME;
  const turnCred = process.env.TURN_CREDENTIAL;
  if (turnUrl && turnUser && turnCred) {
    servers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnCred,
    });
  }

  cache = { servers, expiresAt: now + 60 * 60 * 1000 };
  return NextResponse.json({ iceServers: servers });
}
