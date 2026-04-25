'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { registerSchema } from '@/lib/validators';
import { Loader2 } from 'lucide-react';

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const parsed = registerSchema.safeParse({ email, username, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({
        email: flat.email?.[0] ?? '',
        username: flat.username?.[0] ?? '',
        password: flat.password?.[0] ?? '',
      });
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSubmitting(false);
      if (data.error === 'taken') {
        setErrors({ [data.field]: `${data.field} уже занят` });
      } else if (data.issues) {
        const flat = data.issues as Record<string, string[]>;
        setErrors({
          email: flat.email?.[0] ?? '',
          username: flat.username?.[0] ?? '',
          password: flat.password?.[0] ?? '',
        });
      } else {
        setErrors({ form: 'не удалось зарегистрироваться' });
      }
      return;
    }
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    router.push('/chat');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="email" error={errors.email}>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="tk-input"
          placeholder="you@tubikz.app"
        />
      </Field>
      <Field label="username" error={errors.username}>
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          className="tk-input"
          placeholder="tubik_001"
        />
      </Field>
      <Field label="пароль" error={errors.password}>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="tk-input"
          placeholder="минимум 8, с буквой и цифрой"
        />
      </Field>
      {errors.form && (
        <div className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
          {errors.form}
        </div>
      )}
      <button type="submit" disabled={submitting} className="tk-btn-primary w-full">
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        создать аккаунт
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
        {label}
      </label>
      {children}
      {error && <div className="text-danger text-xs mt-1.5">{error}</div>}
    </div>
  );
}
