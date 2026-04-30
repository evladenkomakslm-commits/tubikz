#!/usr/bin/env node
// Promote a user to admin (sets isAdmin = true).
// Usage:  node scripts/make-admin.mjs <email-or-username>
import { PrismaClient } from '@prisma/client';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/make-admin.mjs <email-or-username>');
  process.exit(1);
}

const p = new PrismaClient();
try {
  const user = await p.user.findFirst({
    where: {
      OR: [{ email: target.toLowerCase() }, { username: target.toLowerCase() }],
    },
  });
  if (!user) {
    console.error(`✗ user not found: ${target}`);
    process.exit(1);
  }
  if (user.isAdmin) {
    console.log(`already admin: @${user.username}`);
    process.exit(0);
  }
  await p.user.update({ where: { id: user.id }, data: { isAdmin: true } });
  console.log(`✓ promoted to admin: @${user.username} (${user.email})`);
} finally {
  await p.$disconnect();
}
