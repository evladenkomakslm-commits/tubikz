import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth/RegisterForm';
import Link from 'next/link';

export default function RegisterPage() {
  return (
    <div className="rounded-3xl bg-bg-panel/70 border border-border backdrop-blur p-8 shadow-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">стать тюбиком</h1>
      <p className="text-text-muted mt-1 text-sm">создай аккаунт за минуту</p>
      <div className="mt-6">
        <Suspense fallback={null}>
          <RegisterForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-sm text-text-muted">
        уже есть аккаунт?{' '}
        <Link href="/login" className="text-accent hover:underline">
          войти
        </Link>
      </p>
    </div>
  );
}
