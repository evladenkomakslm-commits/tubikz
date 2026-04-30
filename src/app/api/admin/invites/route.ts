import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { generateInviteCode } from '@/lib/invites';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const codes = await prisma.inviteCode.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      usedBy: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
  return NextResponse.json({ codes });
}

const createSchema = z.object({
  count: z.number().int().min(1).max(20).default(1),
  note: z.string().max(60).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { count, note, expiresInDays } = parsed.data;
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const created = [];
  for (let i = 0; i < count; i++) {
    // Retry on unique-constraint clash (extremely rare but possible).
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await prisma.inviteCode.create({
          data: {
            code: generateInviteCode(),
            note: note ?? null,
            expiresAt,
            createdById: admin.id,
          },
        });
        created.push(row);
        break;
      } catch {
        // Probably unique violation — try a fresh code.
      }
    }
  }

  return NextResponse.json({ codes: created }, { status: 201 });
}
