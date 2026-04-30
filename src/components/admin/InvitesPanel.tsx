'use client';
import { useEffect, useState } from 'react';
import { Plus, Copy, Check, Trash2, Loader2, Ticket, Share2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

interface InviteRow {
  id: string;
  code: string;
  note: string | null;
  createdAt: string;
  usedAt: string | null;
  expiresAt: string | null;
  usedBy: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
}

export function InvitesPanel() {
  const [codes, setCodes] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const toast = useToast();

  async function load() {
    const res = await fetch('/api/admin/invites');
    if (!res.ok) {
      toast.push({ message: 'не удалось загрузить', kind: 'error' });
      setLoading(false);
      return;
    }
    const data = await res.json();
    setCodes(data.codes ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setGenerating(true);
    const res = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, note: note || undefined }),
    });
    setGenerating(false);
    if (!res.ok) {
      toast.push({ message: 'не удалось сгенерировать', kind: 'error' });
      return;
    }
    setNote('');
    setCount(1);
    toast.push({ message: `сгенерировано ${count} код(а)`, kind: 'success' });
    load();
  }

  async function remove(id: string) {
    if (!confirm('удалить этот код?')) return;
    const res = await fetch(`/api/admin/invites/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.push({
        message: data.error === 'already_used' ? 'код уже использован' : 'не получилось',
        kind: 'error',
      });
      return;
    }
    load();
  }

  function copy(code: string, id: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function copyShareLink(code: string, id: string) {
    const url = `${location.origin}/register?invite=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(id);
    toast.push({ message: 'ссылка скопирована' });
    setTimeout(() => setCopiedId(null), 1500);
  }

  const unusedCount = codes.filter((c) => !c.usedBy).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      <header className="sticky top-0 z-10 bg-bg-subtle/95 backdrop-blur border-b border-border/60 px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] md:px-6 md:py-4">
        <h1 className="text-[22px] md:text-2xl font-semibold tracking-tight">приглашения</h1>
        <p className="text-text-muted text-xs md:text-sm mt-0.5">
          сгенерируй код и отправь другу — без него не зарегистрируется
        </p>
      </header>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6">
        {/* Generator */}
        <section className="rounded-2xl bg-bg-panel border border-border p-4 md:p-5">
          <h2 className="font-medium mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-accent" />
            новый код
          </h2>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className="flex-1">
              <input
                type="text"
                placeholder="кому (необязательно)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="tk-input"
                maxLength={60}
              />
            </div>
            <div className="w-full sm:w-24">
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(20, +e.target.value || 1)))}
                className="tk-input text-center"
              />
            </div>
            <button
              onClick={generate}
              disabled={generating}
              className="tk-btn-primary"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />}
              создать
            </button>
          </div>
        </section>

        {/* Stats */}
        <div className="flex gap-3 text-sm">
          <div className="flex-1 rounded-xl bg-bg-panel border border-border px-4 py-3">
            <div className="text-text-muted text-xs">всего</div>
            <div className="text-xl font-semibold">{codes.length}</div>
          </div>
          <div className="flex-1 rounded-xl bg-bg-panel border border-border px-4 py-3">
            <div className="text-text-muted text-xs">не использовано</div>
            <div className="text-xl font-semibold text-accent">{unusedCount}</div>
          </div>
          <div className="flex-1 rounded-xl bg-bg-panel border border-border px-4 py-3">
            <div className="text-text-muted text-xs">использовано</div>
            <div className="text-xl font-semibold">{codes.length - unusedCount}</div>
          </div>
        </div>

        {/* Codes list */}
        <section>
          <h2 className="text-xs uppercase tracking-wider text-text-muted mb-2">
            все коды
          </h2>
          {codes.length === 0 ? (
            <div className="rounded-2xl bg-bg-panel border border-border p-8 text-center text-text-muted text-sm">
              ещё ни одного кода. сгенерируй первый сверху.
            </div>
          ) : (
            <div className="rounded-2xl bg-bg-panel border border-border overflow-hidden">
              {codes.map((c) => {
                const used = !!c.usedBy;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0',
                      used && 'opacity-60',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm font-semibold tracking-wider">
                        {c.code}
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5 truncate">
                        {c.note ? `${c.note} · ` : ''}
                        {used && c.usedBy ? (
                          <span className="text-success">
                            активирован @{c.usedBy.username}
                          </span>
                        ) : (
                          <span>создан {new Date(c.createdAt).toLocaleDateString('ru')}</span>
                        )}
                      </div>
                    </div>

                    {used && c.usedBy && (
                      <Avatar
                        src={c.usedBy.avatarUrl}
                        name={c.usedBy.username}
                        size={28}
                      />
                    )}

                    {!used && (
                      <>
                        <button
                          onClick={() => copy(c.code, c.id)}
                          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
                          title="скопировать код"
                          aria-label="скопировать код"
                        >
                          {copiedId === c.id ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => copyShareLink(c.code, c.id)}
                          className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-bg-hover transition-colors"
                          title="скопировать ссылку"
                          aria-label="скопировать ссылку"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => remove(c.id)}
                          className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-bg-hover transition-colors"
                          title="удалить"
                          aria-label="удалить код"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
