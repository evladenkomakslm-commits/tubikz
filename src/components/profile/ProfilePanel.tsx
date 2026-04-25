'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Save } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';

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
    <div className="max-w-2xl mx-auto px-6 py-10 animate-slide-up">
      <h1 className="text-2xl font-semibold tracking-tight">профиль</h1>
      <p className="text-text-muted mt-1 text-sm">так тебя видят другие тюбики</p>

      <div className="mt-8 rounded-2xl bg-bg-panel border border-border p-6">
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
          <button
            onClick={save}
            disabled={saving}
            className="tk-btn-primary"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
