import { LoginForm } from '@/components/auth/LoginForm';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="rounded-3xl bg-bg-panel/70 border border-border backdrop-blur p-8 shadow-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">с возвращением</h1>
      <p className="text-text-muted mt-1 text-sm">войди, тюбик уже ждёт</p>
      <div className="mt-6">
        <LoginForm />
      </div>
      <p className="mt-6 text-center text-sm text-text-muted">
        нет аккаунта?{' '}
        <Link href="/register" className="text-accent hover:underline">
          создать
        </Link>
      </p>
    </div>
  );
}
