'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Search, UserPlus, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface Friend {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
}

/**
 * Pick one of your friends and share them as a contact card. The
 * resulting message stores the contact info inline as
 * `userId|username|displayName|avatarUrl` in `content`.
 */
export function ContactPicker({
  open,
  onClose,
  onShare,
}: {
  open: boolean;
  onClose: () => void;
  onShare: (friend: Friend) => Promise<boolean>;
}) {
  const toast = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setLoading(true);
    fetch('/api/friends')
      .then((r) => r.json())
      .then((d) => {
        setFriends(
          (d.friends ?? []).map(
            (f: Friend & { friend?: Friend }) => f.friend ?? f,
          ),
        );
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.username.toLowerCase().includes(q) ||
        (f.displayName ?? '').toLowerCase().includes(q),
    );
  }, [friends, search]);

  async function pick(f: Friend) {
    setBusyId(f.id);
    const ok = await onShare(f);
    setBusyId(null);
    if (ok) onClose();
    else toast.push({ message: 'не удалось отправить', kind: 'error' });
  }

  if (typeof document === 'undefined') return null;
  const tree = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full md:w-[480px] max-h-[88dvh] md:max-h-[80dvh] flex flex-col bg-bg-panel md:rounded-2xl rounded-t-2xl border-t md:border border-border shadow-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
          >
            <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <UserPlus className="w-5 h-5 text-accent" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[16px]">поделиться контактом</div>
                <div className="text-[12px] text-text-muted">из ваших друзей</div>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-bg-hover"
                aria-label="закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

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

            <div className="flex-1 min-h-0 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-text-muted text-sm py-8 px-4">
                  {friends.length === 0
                    ? 'у тебя пока нет друзей'
                    : 'никого не нашли'}
                </div>
              ) : (
                filtered.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => pick(f)}
                    disabled={!!busyId}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left hover:bg-bg-hover',
                      busyId === f.id && 'opacity-60',
                    )}
                  >
                    <Avatar
                      src={f.avatarUrl}
                      name={f.username}
                      size={40}
                      online={f.isOnline}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-[15px]">
                        {f.displayName ?? f.username}
                      </div>
                      <div className="text-[12px] text-text-muted truncate">
                        @{f.username}
                      </div>
                    </div>
                    {busyId === f.id && (
                      <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return createPortal(tree, document.body);
}
