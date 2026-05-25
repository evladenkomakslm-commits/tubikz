import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { smartReplies } from '@/lib/ai';
import { aiRateLimit } from '@/lib/ai-rate-limit';

const schema = z.object({
  text: z.string().min(1).max(800),
  contextHint: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rl = aiRateLimit(session.user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rl.retryAfter },
      { status: 429 },
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }
  const replies = await smartReplies(parsed.data.text, parsed.data.contextHint);
  return NextResponse.json({ replies });
}
