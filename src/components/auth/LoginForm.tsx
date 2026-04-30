'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { loginSchema } from '@/lib/validators';
import { AUTH_ERR } from '@/lib/auth-errors';
import { Loader2, ShieldCheck } from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const parsed = loginSchema.safeParse({
      email,
      password,
      totpCode: totpCode || undefined,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({
        email: flat.email?.[0] ?? '',
        password: flat.password?.[0] ?? '',
        totpCode: flat.totpCode?.[0] ?? '',
      });
      return;
    }
    setSubmitting(true);
    const res = await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      totpCode: parsed.data.totpCode ?? '',
      redirect: false,
    });
    setSubmitting(false);

    if (res?.error) {
      // NextAuth flattens our thrown errors into res.error
      if (res.error.includes(AUTH_ERR.NEEDS_2FA)) {
        setNeeds2fa(true);
        setErrors({});
        // focus the totp input next paint
        setTimeout(() => {
          (document.querySelector('input[name="totp"]') as HTMLInputElement | null)?.focus();
        }, 50);
        return;
      }
      if (res.error.includes(AUTH_ERR.WRONG_2FA)) {
        setNeeds2fa(true);
        setErrors({ totpCode: 'неверный код' });
        return;
      }
      setErrors({ form: 'неверный email или пароль' });
      return;
    }
    router.push('/chat');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!needs2fa && (
        <>
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
          <Field label="пароль" error={errors.password}>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="tk-input"
              placeholder="••••••••"
            />
          </Field>
        </>
      )}

      {needs2fa && (
        <div className="space-y-3 animate-slide-up">
          <div className="flex items-start gap-3 bg-accent-soft border border-accent/30 rounded-xl px-4 py-3">
            <ShieldCheck className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-text">двухфакторная аутентификация</div>
              <div className="text-text-muted text-xs mt-0.5">
                открой Google Authenticator (или 1Password) и введи 6 цифр
              </div>
            </div>
          </div>
          <Field label="код из приложения" error={errors.totpCode}>
            <input
              name="totp"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="tk-input text-center font-mono text-2xl tracking-[0.4em]"
              placeholder="000000"
              maxLength={6}
            />
          </Field>
        </div>
      )}

      {errors.form && (
        <div className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
          {errors.form}
        </div>
      )}
      <button type="submit" disabled={submitting} className="tk-btn-primary w-full">
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {needs2fa ? 'подтвердить' : 'войти'}
      </button>

      {needs2fa && (
        <button
          type="button"
          onClick={() => {
            setNeeds2fa(false);
            setTotpCode('');
            setErrors({});
          }}
          className="text-sm text-text-muted hover:text-text mx-auto block"
        >
          ← назад
        </button>
      )}
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
