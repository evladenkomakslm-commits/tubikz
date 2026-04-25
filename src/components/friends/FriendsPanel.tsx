'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, Check, X, MessageSquare, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';

interface Friend {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
}

interface IncomingRequest {
  id: string;
  fromUser: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

interface SearchUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
}

export function FriendsPanel() {
  const router = useRouter();
  const toast = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  async function load() {
    const res = await fetch('/api/friends');
    const data = await res.json();
    setFriends(data.friends ?? []);
    setIncoming(data.incoming ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.users ?? []);
      setSearching(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  async function sendRequest(toUserId: string) {
    const res = await fetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId }),
    });
    const data = await res.json();
    if (data.status === 'sent') toast.push({ message: 'заявка отправлена' });
    else if (data.status === 'accepted') {
      toast.push({ message: 'теперь вы друзья', kind: 'success' });
      load();
    } else if (data.status === 'already_friends') {
      toast.push({ message: 'уже в друзьях' });
    }
  }

  async function respond(requestId: string, action: 'accept' | 'decline') {
    await fetch('/api/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action }),
    });
    load();
  }

  async function openChat(peerId: string) {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerId }),
    });
    const data = await res.json();
    if (data.id) router.push(`/chat/${data.id}`);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 animate-slide-up">
      <h1 className="text-2xl font-semibold tracking-tight">друзья</h1>
      <p className="text-text-muted mt-1 text-sm">найди тюбиков по username</p>

      <div className="mt-6 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="поиск по username"
          className="tk-input pl-11"
        />
        {searching && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-text-muted" />
        )}
      </div>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-2xl bg-bg-panel border border-border overflow-hidden"
          >
            {results.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-bg-hover transition-colors"
              >
                <Avatar src={u.avatarUrl} name={u.username} size={40} online={u.isOnline} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{u.displayName ?? u.username}</div>
                  <div className="text-text-muted text-xs truncate">@{u.username}</div>
                </div>
                <button
                  onClick={() => sendRequest(u.id)}
                  className="tk-btn-ghost px-3 py-2 text-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  добавить
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {incoming.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wider text-text-muted mb-2">
            входящие
          </h2>
          <div className="rounded-2xl bg-bg-panel border border-border overflow-hidden">
            {incoming.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-bg-hover transition-colors"
              >
                <Avatar
                  src={r.fromUser.avatarUrl}
                  name={r.fromUser.username}
                  size={40}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {r.fromUser.displayName ?? r.fromUser.username}
                  </div>
                  <div className="text-text-muted text-xs truncate">
                    @{r.fromUser.username}
                  </div>
                </div>
                <button
                  onClick={() => respond(r.id, 'accept')}
                  className="p-2 rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors"
                  title="принять"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => respond(r.id, 'decline')}
                  className="p-2 rounded-lg bg-bg-elevated text-text-muted hover:text-danger transition-colors"
                  title="отклонить"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-wider text-text-muted mb-2">
          мои тюбики · {friends.length}
        </h2>
        {friends.length === 0 ? (
          <div className="rounded-2xl bg-bg-panel border border-border p-8 text-center text-text-muted text-sm">
            пока никого. найди кого-нибудь по username выше
          </div>
        ) : (
          <div className="rounded-2xl bg-bg-panel border border-border overflow-hidden">
            {friends.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-bg-hover transition-colors"
              >
                <Avatar
                  src={f.avatarUrl}
                  name={f.username}
                  size={40}
                  online={f.isOnline}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {f.displayName ?? f.username}
                  </div>
                  <div className="text-text-muted text-xs truncate">@{f.username}</div>
                </div>
                <button
                  onClick={() => openChat(f.id)}
                  className="tk-btn-ghost px-3 py-2 text-xs"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  написать
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
