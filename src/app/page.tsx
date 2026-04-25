import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WelcomeHero } from '@/components/welcome/WelcomeHero';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect('/chat');

  return (
    <main className="min-h-screen mesh-bg flex flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <span className="text-accent">₮</span>
          <span>ubikz</span>
        </div>
        <nav className="flex gap-2">
          <Link href="/login" className="tk-btn-ghost text-sm">
            войти
          </Link>
          <Link href="/register" className="tk-btn-primary text-sm">
            создать аккаунт
          </Link>
        </nav>
      </header>

      <WelcomeHero />

      <footer className="text-center text-text-subtle text-xs py-6">
        ₮ubikz · {new Date().getFullYear()}
      </footer>
    </main>
  );
}
