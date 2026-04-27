'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { MessageSquare, Users, User as UserIcon, LogOut, Bookmark } from 'lucide-react';
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
  const router = useRouter();

  async function openSaved() {
    const res = await fetch('/api/conversations/saved');
    const data = await res.json();
    if (data.id) router.push(`/chat/${data.id}`);
  }

  return (
    <aside
      className={cn(
        'shrink-0 bg-bg flex border-border',
        // Mobile: horizontal bottom nav, full width, fixed height with safe-area
        'w-full h-16 flex-row items-center justify-around px-2 border-t pb-[env(safe-area-inset-bottom)]',
        // Desktop: vertical sidebar
        'md:w-20 md:h-auto md:flex-col md:items-center md:justify-start md:py-4 md:gap-2 md:border-t-0 md:border-r md:px-0 md:pb-0',
      )}
    >
      {/* Brand mark — visible on desktop only */}
      <Link href="/chat" className="hidden md:block mb-2">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent to-fuchsia-500 flex items-center justify-center font-bold text-lg shadow-lg shadow-accent/30">
          ₮
        </div>
      </Link>

      <nav className="flex flex-row md:flex-col md:flex-1 items-center justify-around md:justify-start gap-1 md:gap-1 w-full md:px-2 md:mt-2">
        {items.map((it) => {
          const active = pathname?.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl text-text-muted transition-all',
                'text-[10px] md:text-[11px] min-w-[56px]',
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
        <button
          onClick={openSaved}
          className="flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl text-text-muted text-[10px] md:text-[11px] min-w-[56px] hover:bg-bg-hover hover:text-text transition-all"
          title="избранное"
        >
          <Bookmark className="w-5 h-5" />
          <span>сохр.</span>
        </button>
      </nav>

      {/* Logout — desktop only; on mobile lives in profile (TODO) */}
      <button
        onClick={() => signOut({ callbackUrl: '/' })}
        className="hidden md:block text-text-muted hover:text-danger p-2 rounded-xl transition-colors"
        title="выйти"
      >
        <LogOut className="w-5 h-5" />
      </button>

      {/* Avatar — desktop only */}
      <Link href="/profile" className="hidden md:block mt-1">
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
