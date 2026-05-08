import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Verbose TURN diagnostic. Shows whether the env vars are visible to
 * the runtime, what URL the server would call, the HTTP status, and a
 * truncated response body — so the user can see at a glance why TURN
 * isn't being attached to the ICE list.
 *
 * Auth-gated and intentionally verbose for debugging only.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.METERED_API_KEY ?? null;
  const appName = process.env.METERED_APP_NAME ?? null;

  const out: Record<string, unknown> = {
    metered_api_key_set: !!apiKey,
    metered_api_key_first_chars: apiKey ? apiKey.slice(0, 6) + '…' : null,
    metered_api_key_length: apiKey ? apiKey.length : 0,
    metered_app_name: appName,
    manual_turn_set:
      !!process.env.TURN_URL &&
      !!process.env.TURN_USERNAME &&
      !!process.env.TURN_CREDENTIAL,
  };

  if (apiKey && appName) {
    const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`;
    out.metered_url_tried = url.replace(apiKey, '<key>');
    try {
      const res = await fetch(url);
      out.metered_status = res.status;
      out.metered_status_text = res.statusText;
      const text = await res.text();
      out.metered_body_first_500 = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          out.servers_count = parsed.length;
          out.first_server_urls =
            parsed[0]?.urls ?? null;
        }
      } catch {
        out.parse_error = 'response was not valid JSON';
      }
    } catch (e) {
      out.fetch_error = e instanceof Error ? e.message : 'unknown';
    }
  }

  return NextResponse.json(out, {
    // Pretty-print in the browser viewer.
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
