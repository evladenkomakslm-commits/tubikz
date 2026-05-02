'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Loader2,
  LogOut,
  Save,
  ShieldCheck,
  Shield,
  ShieldOff,
  Monitor,
  Smartphone,
  Trash2,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Eye,
  Search,
  MessageCircle,
  UserX,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { cn, formatDay, formatTime } from '@/lib/utils';

interface Me {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isOnline: boolean;
}

export function ProfilePanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/users/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) return;
        setMe(d.user);
        setDisplayName(d.user.displayName ?? '');
        setBio(d.user.bio ?? '');
        setAvatarUrl(d.user.avatarUrl ?? null);
      });
  }, []);

  async function uploadAvatar(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', 'avatar');
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.push({ message: data.error ?? 'не удалось загрузить', kind: 'error' });
      return;
    }
    const data = await res.json();
    setAvatarUrl(data.url);
  }

  async function save() {
    setSaving(true);
    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, bio, avatarUrl }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.push({ message: 'не удалось сохранить', kind: 'error' });
      return;
    }
    toast.push({ message: 'сохранено', kind: 'success' });
  }

  if (!me) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      {/* Sticky mobile header */}
      <header className="sticky top-0 z-10 bg-bg-subtle/95 backdrop-blur border-b border-border/60 px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] md:px-6 md:py-4">
        <h1 className="text-[22px] md:text-2xl font-semibold tracking-tight">профиль</h1>
        <p className="text-text-muted text-xs md:text-sm mt-0.5">так тебя видят другие тюбики</p>
      </header>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 md:py-8">
      <div className="rounded-2xl bg-bg-panel border border-border p-5 md:p-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar src={avatarUrl} name={me.username} size={88} online={me.isOnline} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 bg-accent rounded-full p-2 shadow-lg shadow-accent/30 hover:bg-accent-hover transition-all"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = '';
              }}
            />
          </div>
          <div>
            <div className="text-lg font-medium">@{me.username}</div>
            <div className="text-text-muted text-sm">{me.email}</div>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          <div>
            <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
              имя для отображения
            </label>
            <input
              type="text"
              value={displayName}
              maxLength={40}
              onChange={(e) => setDisplayName(e.target.value)}
              className="tk-input"
              placeholder="как тебя звать"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
              о себе
            </label>
            <textarea
              value={bio}
              maxLength={200}
              onChange={(e) => setBio(e.target.value)}
              className="tk-input min-h-[96px] resize-none"
              placeholder="несколько слов"
            />
            <div className="text-right text-xs text-text-subtle mt-1">{bio.length}/200</div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="tk-btn-primary"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              сохранить
            </button>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="tk-btn-ghost text-danger hover:text-danger"
            >
              <LogOut className="w-4 h-4" />
              выйти
            </button>
          </div>
        </div>
      </div>

      {/* Security card — 2FA */}
      <TwoFactorCard />
      <SessionsCard />
      <NotificationsCard />
      <PrivacyCard />
      </div>
    </div>
  );
}

/* ─────────── 2FA card ─────────── */

function TwoFactorCard() {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [qr, setQr] = useState<{ uri: string; qrDataUrl: string; secret: string } | null>(null);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    const r = await fetch('/api/auth/2fa/status');
    const d = await r.json();
    setEnabled(!!d.enabled);
  }
  useEffect(() => {
    load();
  }, []);

  async function startSetup() {
    setBusy(true);
    setErr('');
    const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error === 'already_enabled' ? '2FA уже включена' : 'не получилось');
      return;
    }
    const d = await res.json();
    setQr({ uri: d.uri, qrDataUrl: d.qrDataUrl, secret: d.secret });
    setSetupOpen(true);
    setToken('');
  }

  async function confirmEnable() {
    if (!/^\d{6}$/.test(token)) {
      setErr('введи 6 цифр');
      return;
    }
    setBusy(true);
    setErr('');
    const res = await fetch('/api/auth/2fa/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error === 'wrong_code' ? 'неверный код' : 'не получилось');
      return;
    }
    toast.push({ message: '2FA включена', kind: 'success' });
    setSetupOpen(false);
    setQr(null);
    load();
  }

  async function disable() {
    if (!/^\d{6}$/.test(token)) {
      setErr('код 6 цифр');
      return;
    }
    if (!password) {
      setErr('введи пароль');
      return;
    }
    setBusy(true);
    setErr('');
    const res = await fetch('/api/auth/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(
        d.error === 'wrong_code'
          ? 'неверный код'
          : d.error === 'wrong_password'
            ? 'неверный пароль'
            : 'не получилось',
      );
      return;
    }
    toast.push({ message: '2FA отключена' });
    setDisableOpen(false);
    setPassword('');
    setToken('');
    load();
  }

  if (enabled === null) {
    return (
      <div className="rounded-2xl bg-bg-panel border border-border p-5 mt-4">
        <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-bg-panel border border-border p-5 md:p-6 mt-4">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            enabled ? 'bg-success/15 text-success' : 'bg-bg-elevated text-text-muted',
          )}
        >
          {enabled ? <ShieldCheck className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium">двухфакторная аутентификация</div>
          <p className="text-text-muted text-xs mt-0.5">
            {enabled
              ? 'при входе будет запрашиваться 6-значный код'
              : 'дополнительный код из приложения-аутентификатора'}
          </p>
        </div>
        {!enabled && !setupOpen && (
          <button
            onClick={startSetup}
            disabled={busy}
            className="tk-btn-primary text-sm py-2 px-3"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            включить
          </button>
        )}
        {enabled && !disableOpen && (
          <button
            onClick={() => setDisableOpen(true)}
            className="tk-btn-ghost text-sm py-2 px-3 text-danger hover:text-danger"
          >
            <ShieldOff className="w-4 h-4" />
            отключить
          </button>
        )}
      </div>

      {/* Setup flow */}
      {setupOpen && qr && (
        <div className="mt-5 pt-5 border-t border-border space-y-4">
          <div>
            <p className="text-sm text-text mb-2">
              <strong>1.</strong> отсканируй QR в Google Authenticator / 1Password / Bitwarden
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr.qrDataUrl}
              alt="QR-код для настройки 2FA"
              className="rounded-xl bg-bg-elevated p-2 mx-auto"
              style={{ width: 200, height: 200 }}
            />
            <details className="mt-2 text-xs text-text-muted">
              <summary className="cursor-pointer">не получается отсканировать?</summary>
              <div className="mt-2 break-all font-mono bg-bg-elevated rounded-lg p-2 select-all">
                {qr.secret}
              </div>
            </details>
          </div>
          <div>
            <p className="text-sm text-text mb-2">
              <strong>2.</strong> введи 6-значный код из приложения
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="tk-input text-center font-mono text-2xl tracking-[0.4em]"
              placeholder="000000"
            />
            {err && <div className="text-danger text-xs mt-2">{err}</div>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={confirmEnable}
              disabled={busy || token.length !== 6}
              className="tk-btn-primary flex-1"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              подтвердить
            </button>
            <button
              onClick={() => {
                setSetupOpen(false);
                setQr(null);
                setToken('');
                setErr('');
              }}
              className="tk-btn-ghost"
            >
              отмена
            </button>
          </div>
        </div>
      )}

      {/* Disable flow */}
      {disableOpen && (
        <div className="mt-5 pt-5 border-t border-border space-y-3">
          <p className="text-sm text-text-muted">
            нужен пароль и текущий код из приложения
          </p>
          <input
            type="password"
            placeholder="пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="tk-input"
            autoComplete="current-password"
          />
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="tk-input text-center font-mono text-xl tracking-[0.3em]"
            placeholder="000000"
          />
          {err && <div className="text-danger text-xs">{err}</div>}
          <div className="flex gap-2">
            <button
              onClick={disable}
              disabled={busy}
              className="tk-btn-ghost flex-1 text-danger hover:text-danger"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
              отключить
            </button>
            <button
              onClick={() => {
                setDisableOpen(false);
                setPassword('');
                setToken('');
                setErr('');
              }}
              className="tk-btn-ghost"
            >
              отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Active sessions card ─────────── */

interface SessionRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

function SessionsCard() {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch('/api/auth/sessions');
    if (!r.ok) return;
    const d = await r.json();
    setSessions(d.sessions ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function revoke(id: string) {
    if (!confirm('завершить эту сессию?')) return;
    setBusy(true);
    await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
    setBusy(false);
    toast.push({ message: 'сессия завершена' });
    load();
  }

  async function revokeOthers() {
    if (!confirm('выйти со всех других устройств?')) return;
    setBusy(true);
    const r = await fetch('/api/auth/sessions/others', { method: 'POST' });
    setBusy(false);
    if (r.ok) {
      const d = await r.json();
      toast.push({ message: `завершено ${d.removed ?? 0} сессий`, kind: 'success' });
      load();
    }
  }

  if (sessions === null) {
    return (
      <div className="rounded-2xl bg-bg-panel border border-border p-5 mt-4">
        <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-bg-panel border border-border p-5 md:p-6 mt-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="font-medium">активные сессии</div>
          <p className="text-text-muted text-xs mt-0.5">
            устройства, где сейчас открыт твой аккаунт
          </p>
        </div>
        {sessions.length > 1 && (
          <button
            onClick={revokeOthers}
            disabled={busy}
            className="tk-btn-ghost text-xs py-1.5 px-2.5 text-danger hover:text-danger"
          >
            завершить остальные
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="text-text-muted text-sm">нет активных сессий</div>
      ) : (
        <div className="divide-y divide-border">
          {sessions.map((s) => {
            const ua = parseUA(s.userAgent ?? '');
            const isMobile = /Mobile|Android|iPhone|iPad/.test(s.userAgent ?? '');
            return (
              <div key={s.id} className="py-3 flex items-center gap-3">
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                    s.isCurrent ? 'bg-success/15 text-success' : 'bg-bg-elevated text-text-muted',
                  )}
                >
                  {isMobile ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {ua.label}
                    {s.isCurrent && (
                      <span className="text-[10px] uppercase bg-success/15 text-success rounded px-1.5 py-0.5">
                        этот
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-muted truncate">
                    {s.ipAddress ?? '—'} · был активен {formatDay(s.lastActiveAt)} в {formatTime(s.lastActiveAt)}
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => revoke(s.id)}
                    disabled={busy}
                    className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-bg-hover transition-colors"
                    title="завершить"
                    aria-label="завершить сессию"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function parseUA(ua: string): { label: string } {
  if (!ua) return { label: 'неизвестное устройство' };
  // Order matters — more specific patterns first.
  if (/Tubikz/.test(ua)) return { label: 'Tubikz Android' };
  if (/iPhone/.test(ua)) return { label: 'iPhone (Safari)' };
  if (/iPad/.test(ua)) return { label: 'iPad (Safari)' };
  if (/Android/.test(ua)) {
    const browser = /Chrome/.test(ua) ? 'Chrome' : 'Browser';
    return { label: `Android (${browser})` };
  }
  if (/Macintosh/.test(ua)) {
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome/.test(ua)
        ? 'Chrome'
        : /Safari/.test(ua)
          ? 'Safari'
          : /Firefox/.test(ua)
            ? 'Firefox'
            : 'Browser';
    return { label: `Mac (${browser})` };
  }
  if (/Windows/.test(ua)) {
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome/.test(ua)
        ? 'Chrome'
        : /Firefox/.test(ua)
          ? 'Firefox'
          : 'Browser';
    return { label: `Windows (${browser})` };
  }
  if (/Linux/.test(ua)) return { label: 'Linux' };
  return { label: ua.slice(0, 40) };
}

/* ─────────── Notifications card (push + sounds) ─────────── */
function NotificationsCard() {
  const [pushOn, setPushOn] = useState<'unknown' | 'on' | 'off' | 'denied'>('unknown');
  const [soundsOn, setSoundsOn] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Lazy import — browser-only.
      const { pushSupported } = await import('@/lib/push-client');
      const { loadSoundPref } = await import('@/lib/sounds');
      if (cancelled) return;
      setSoundsOn(!loadSoundPref());
      if (!pushSupported()) {
        setPushOn('off');
        return;
      }
      if (Notification.permission === 'denied') {
        setPushOn('denied');
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setPushOn(sub ? 'on' : 'off');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePush() {
    setBusy(true);
    const { subscribeToPush, unsubscribeFromPush } = await import('@/lib/push-client');
    if (pushOn === 'on') {
      await unsubscribeFromPush();
      setPushOn('off');
    } else {
      const ok = await subscribeToPush();
      setPushOn(ok ? 'on' : Notification.permission === 'denied' ? 'denied' : 'off');
    }
    setBusy(false);
  }

  async function toggleSounds() {
    const { setSoundsMuted } = await import('@/lib/sounds');
    const next = !soundsOn;
    setSoundsOn(next);
    setSoundsMuted(!next);
  }

  return (
    <div className="bg-bg-panel border border-border rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
        уведомления
      </h2>

      {/* Push */}
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-3 min-w-0">
          {pushOn === 'on' ? (
            <Bell className="w-5 h-5 text-accent" />
          ) : (
            <BellOff className="w-5 h-5 text-text-muted" />
          )}
          <div className="min-w-0">
            <div className="text-[15px] font-medium">push-уведомления</div>
            <div className="text-[12px] text-text-muted">
              {pushOn === 'on'
                ? 'включены — будут приходить даже когда вкладка закрыта'
                : pushOn === 'denied'
                  ? 'заблокированы в настройках браузера'
                  : 'выключены'}
            </div>
          </div>
        </div>
        <button
          onClick={togglePush}
          disabled={busy || pushOn === 'denied'}
          className={
            pushOn === 'on'
              ? 'tk-btn-ghost text-sm'
              : 'tk-btn-primary text-sm'
          }
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : pushOn === 'on' ? 'отключить' : 'включить'}
        </button>
      </div>

      <div className="h-px bg-border my-1" />

      {/* Sounds */}
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-3 min-w-0">
          {soundsOn ? (
            <Volume2 className="w-5 h-5 text-accent" />
          ) : (
            <VolumeX className="w-5 h-5 text-text-muted" />
          )}
          <div className="min-w-0">
            <div className="text-[15px] font-medium">звуки в чате</div>
            <div className="text-[12px] text-text-muted">
              лёгкий ping на новые сообщения
            </div>
          </div>
        </div>
        <button onClick={toggleSounds} className="tk-btn-ghost text-sm">
          {soundsOn ? 'выключить' : 'включить'}
        </button>
      </div>
    </div>
  );
}

/* ─────────── Privacy card ─────────── */

type Audience = 'EVERYONE' | 'FRIENDS' | 'NOBODY';
const AUDIENCE_LABELS: Record<Audience, string> = {
  EVERYONE: 'все',
  FRIENDS: 'друзья',
  NOBODY: 'никто',
};

interface BlockedSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

function PrivacyCard() {
  const toast = useToast();
  const [privacy, setPrivacy] = useState<{
    lastSeenAudience: Audience;
    searchAudience: Audience;
    messageAudience: Audience;
  } | null>(null);
  const [blocks, setBlocks] = useState<BlockedSummary[]>([]);

  useEffect(() => {
    fetch('/api/users/me/privacy')
      .then((r) => r.json())
      .then((d) => setPrivacy(d.privacy ?? null));
    fetch('/api/blocks')
      .then((r) => r.json())
      .then((d) => setBlocks(d.blocks ?? []));
  }, []);

  async function update(patch: Partial<NonNullable<typeof privacy>>) {
    const res = await fetch('/api/users/me/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.push({ message: 'не удалось сохранить', kind: 'error' });
      return;
    }
    const data = await res.json();
    setPrivacy(data.privacy);
  }

  async function unblock(id: string) {
    const r = await fetch(`/api/blocks/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      toast.push({ message: 'не вышло', kind: 'error' });
      return;
    }
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    toast.push({ message: 'разблокировано' });
  }

  if (!privacy) return null;

  return (
    <div className="bg-bg-panel border border-border rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
        приватность
      </h2>

      <PrivacyRow
        icon={<Eye className="w-5 h-5 text-accent" />}
        label="кто видит «был в сети»"
        value={privacy.lastSeenAudience}
        onChange={(v) => update({ lastSeenAudience: v })}
      />
      <div className="h-px bg-border my-1" />
      <PrivacyRow
        icon={<Search className="w-5 h-5 text-accent" />}
        label="кто может найти меня"
        hint="по поиску имени"
        value={privacy.searchAudience}
        onChange={(v) => update({ searchAudience: v })}
      />
      <div className="h-px bg-border my-1" />
      <PrivacyRow
        icon={<MessageCircle className="w-5 h-5 text-accent" />}
        label="кто может писать"
        value={privacy.messageAudience}
        onChange={(v) => update({ messageAudience: v })}
      />

      {/* Block list */}
      {blocks.length > 0 && (
        <>
          <div className="h-px bg-border my-3" />
          <div className="text-[12px] uppercase tracking-wider text-text-subtle mb-2 flex items-center gap-2">
            <UserX className="w-3.5 h-3.5" />
            заблокированные · {blocks.length}
          </div>
          <div className="space-y-1">
            {blocks.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-bg-hover"
              >
                <Avatar src={b.avatarUrl} name={b.username} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium truncate">
                    {b.displayName ?? b.username}
                  </div>
                  <div className="text-[12px] text-text-muted truncate">
                    @{b.username}
                  </div>
                </div>
                <button
                  onClick={() => unblock(b.id)}
                  className="text-[13px] text-accent hover:text-accent-hover"
                >
                  разблокировать
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PrivacyRow({
  icon,
  label,
  hint,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: Audience;
  onChange: (v: Audience) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        {icon}
        <div className="min-w-0">
          <div className="text-[15px] font-medium">{label}</div>
          {hint && <div className="text-[12px] text-text-muted">{hint}</div>}
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Audience)}
        className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent transition-colors"
      >
        <option value="EVERYONE">{AUDIENCE_LABELS.EVERYONE}</option>
        <option value="FRIENDS">{AUDIENCE_LABELS.FRIENDS}</option>
        <option value="NOBODY">{AUDIENCE_LABELS.NOBODY}</option>
      </select>
    </div>
  );
}
