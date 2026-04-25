'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { MessageSquare, Users, User as UserIcon, LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

const items = [
  { href: '/chat', label: 'чаты', icon: MessageSquare },
  { href: '/friends', label: 'друзья', icon: Users },
  { href: '/profile', label: 'профиль', icon: UserIcon },
];

export function Sidebar({
  user,
}: {
  user: { id: string; username: string; avatarUrl: string | null };
}) {
  const pathname = usePathname();
  return (
    <aside className="w-16 sm:w-20 shrink-0 bg-bg border-r border-border flex flex-col items-center py-4 gap-2">
      <Link href="/chat" className="mb-2">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent to-fuchsia-500 flex items-center justify-center font-bold text-lg shadow-lg shadow-accent/30">
          ₮
        </div>
      </Link>
      <nav className="flex-1 flex flex-col gap-1 mt-2 w-full px-2">
        {items.map((it) => {
          const active = pathname?.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 rounded-xl text-text-muted text-[10px] sm:text-[11px] transition-all',
                active
                  ? 'bg-accent-soft text-accent'
                  : 'hover:bg-bg-hover hover:text-text',
              )}
              title={it.label}
            >
              <Icon className="w-5 h-5" />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <button
        onClick={() => signOut({ callbackUrl: '/' })}
        className="text-text-muted hover:text-danger p-2 rounded-xl transition-colors"
        title="выйти"
      >
        <LogOut className="w-5 h-5" />
      </button>
      <Link href="/profile" className="mt-1">
        <Avatar
          src={user.avatarUrl}
          name={user.username}
          size={36}
          className="ring-2 ring-border hover:ring-accent transition-all"
        />
      </Link>
    </aside>
  );
}
