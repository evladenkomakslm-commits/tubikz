'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, Loader2, Search, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { GroupAvatar } from '@/components/ui/GroupAvatar';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface Friend {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
}

const MAX_MEMBERS = 30;

export function NewGroupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<'pick' | 'name'>('pick');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Load friends whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setPicked(new Set());
    setSearch('');
    setTitle('');
    setLoading(true);
    fetch('/api/friends')
      .then((r) => r.json())
      .then((d) => {
        setFriends(
          (d.friends ?? []).map((f: { friend: Friend }) => f.friend ?? f) as Friend[],
        );
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Focus the title input when we step to "name".
  useEffect(() => {
    if (step === 'name') requestAnimationFrame(() => titleRef.current?.focus());
  }, [step]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.username.toLowerCase().includes(q) ||
        (f.displayName ?? '').toLowerCase().includes(q),
    );
  }, [friends, search]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size + 1 >= MAX_MEMBERS) {
        toast.push({ message: `максимум ${MAX_MEMBERS - 1} участников`, kind: 'error' });
        return prev;
      } else next.add(id);
      return next;
    });
  }

  async function create() {
    const t = title.trim();
    if (!t) {
      toast.push({ message: 'введи имя группы', kind: 'error' });
      return;
    }
    if (picked.size === 0) {
      toast.push({ message: 'добавь хотя бы одного', kind: 'error' });
      return;
    }
    setBusy(true);
    const res = await fetch('/api/conversations/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: t,
        memberIds: Array.from(picked),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.push({
        message: data?.error === 'no_valid_members' ? 'некого добавить' : 'не вышло',
        kind: 'error',
      });
      return;
    }
    const { id } = await res.json();
    onClose();
    router.push(`/chat/${id}`);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            key="sheet"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full md:w-[480px] max-h-[88dvh] md:max-h-[80dvh] flex flex-col bg-bg-panel md:rounded-2xl rounded-t-2xl border-t md:border border-border shadow-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
          >
            {/* Header */}
            <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
              {step === 'name' ? (
                <button
                  onClick={() => setStep('pick')}
                  className="p-1 -ml-1 rounded-full hover:bg-bg-hover"
                  aria-label="назад"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <Users className="w-5 h-5 text-accent" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[16px]">
                  {step === 'pick' ? 'новая группа' : 'имя группы'}
                </div>
                <div className="text-[12px] text-text-muted">
                  {step === 'pick'
                    ? `${picked.size} / ${MAX_MEMBERS - 1}`
                    : `${picked.size} участник${picked.size === 1 ? '' : picked.size < 5 ? 'а' : 'ов'}`}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-bg-hover"
                aria-label="закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            {step === 'pick' ? (
              <>
                {/* Search */}
                <div className="px-4 py-2 border-b border-border/60">
                  <div className="flex items-center gap-2 bg-bg-elevated rounded-full px-3 py-2">
                    <Search className="w-4 h-4 text-text-muted shrink-0" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="поиск друзей"
                      className="flex-1 bg-transparent outline-none text-base placeholder:text-text-subtle"
                    />
                  </div>
                </div>

                {/* List */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-8 text-text-muted">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center text-text-muted text-sm py-8 px-4">
                      {friends.length === 0
                        ? 'у тебя пока нет друзей. добавь во вкладке «друзья»'
                        : 'никого не нашли'}
                    </div>
                  ) : (
                    filtered.map((f) => {
                      const sel = picked.has(f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => toggle(f.id)}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left',
                            sel ? 'bg-accent-soft' : 'hover:bg-bg-hover',
                          )}
                        >
                          <Avatar src={f.avatarUrl} name={f.username} size={40} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate text-[15px]">
                              {f.displayName ?? f.username}
                            </div>
                            <div className="text-[12px] text-text-muted truncate">
                              @{f.username}
                            </div>
                          </div>
                          <div
                            className={cn(
                              'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0',
                              sel ? 'bg-accent border-accent' : 'border-border',
                            )}
                          >
                            {sel && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="border-t border-border p-3">
                  <button
                    onClick={() => setStep('name')}
                    disabled={picked.size === 0}
                    className="w-full tk-btn-primary"
                  >
                    дальше
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Name + create */}
                <div className="flex flex-col items-center gap-3 px-6 pt-6">
                  <GroupAvatar size={88} name={title || 'группа'} />
                  <input
                    ref={titleRef}
                    type="text"
                    maxLength={48}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="как назвать группу"
                    className="w-full tk-input text-center text-[16px]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') create();
                    }}
                  />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-text-muted mb-2">
                    участники ({picked.size})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(picked).map((id) => {
                      const f = friends.find((x) => x.id === id);
                      if (!f) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 bg-bg-elevated rounded-full pl-1 pr-2.5 py-1"
                        >
                          <Avatar src={f.avatarUrl} name={f.username} size={20} />
                          <span className="text-[13px]">{f.displayName ?? f.username}</span>
                          <button
                            onClick={() => toggle(id)}
                            className="text-text-muted hover:text-danger"
                            aria-label="убрать"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-border p-3">
                  <button
                    onClick={create}
                    disabled={busy || !title.trim()}
                    className="w-full tk-btn-primary"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'создать'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
