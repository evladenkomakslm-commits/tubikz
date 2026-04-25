import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDay(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'вчера';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function avatarColor(seed: string) {
  const palette = [
    'bg-rose-500/30 text-rose-200',
    'bg-amber-500/30 text-amber-200',
    'bg-emerald-500/30 text-emerald-200',
    'bg-sky-500/30 text-sky-200',
    'bg-violet-500/30 text-violet-200',
    'bg-fuchsia-500/30 text-fuchsia-200',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}
