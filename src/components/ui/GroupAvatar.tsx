'use client';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Avatar for group conversations. Falls back to a colorful gradient with
 * a Users icon when no avatarUrl was set; pretty enough that we don't
 * have to nag the user to upload a group photo.
 */
export function GroupAvatar({
  src,
  name,
  size = 40,
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const dim = { width: size, height: size };
  // Lightweight name → gradient hash so different groups look different.
  const grad = pickGradient(name ?? 'group');
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? 'группа'}
        style={dim}
        className={cn('rounded-full object-cover bg-bg-elevated shrink-0', className)}
      />
    );
  }
  return (
    <div
      style={dim}
      className={cn(
        'rounded-full flex items-center justify-center text-white shrink-0 shadow-md',
        grad,
        className,
      )}
    >
      <Users style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

const GRADIENTS = [
  'bg-gradient-to-br from-accent to-fuchsia-500 shadow-accent/30',
  'bg-gradient-to-br from-sky-500 to-indigo-600 shadow-sky-500/30',
  'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30',
  'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30',
  'bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/30',
];

function pickGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}
