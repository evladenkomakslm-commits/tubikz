import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen mesh-bg flex flex-col">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2 text-xl font-semibold">
          <span className="text-accent">₮</span>
          <span>ubikz</span>
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md animate-slide-up">{children}</div>
      </div>
    </main>
  );
}
