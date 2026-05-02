'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  Check,
  Crown,
  Image as ImageIcon,
  LogOut,
  Loader2,
  Pencil,
  Search,
  Shield,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { GroupAvatar } from '@/components/ui/GroupAvatar';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

interface Member {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
  role: Role;
  joinedAt: string;
}

interface Friend {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
}

export function GroupInfoSheet({
  open,
  onClose,
  conversationId,
  title,
  description,
  avatarUrl,
  myRole,
  meId,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  title: string;
  description: string | null;
  avatarUrl: string | null;
  myRole: Role;
  meId: string;
  onChanged: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [actingOn, setActingOn] = useState<Member | null>(null);

  const reload = useCallbackRef(async () => {
    setLoading(true);
    const r = await fetch(`/api/conversations/${conversationId}/members`);
    const d = await r.json();
    setMembers(d.members ?? []);
    setLoading(false);
  });

  useEffect(() => {
    if (!open) return;
    setView('list');
    setActingOn(null);
    reload();
  }, [open, reload]);

  const canManage = myRole === 'OWNER' || myRole === 'ADMIN';
  const canDelete = myRole === 'OWNER';

  async function kick(m: Member) {
    if (!confirm(`удалить ${m.displayName ?? m.username}?`)) return;
    const r = await fetch(
      `/api/conversations/${conversationId}/members/${m.id}`,
      { method: 'DELETE' },
    );
    if (!r.ok) {
      toast.push({ message: 'не вышло', kind: 'error' });
      return;
    }
    toast.push({ message: 'удалён' });
    setActingOn(null);
    reload();
    onChanged();
  }

  async function changeRole(m: Member, role: Role) {
    const r = await fetch(
      `/api/conversations/${conversationId}/members/${m.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      },
    );
    if (!r.ok) {
      toast.push({ message: 'не вышло', kind: 'error' });
      return;
    }
    toast.push({
      message:
        role === 'OWNER'
          ? 'владение передано'
          : role === 'ADMIN'
            ? 'теперь админ'
            : 'обычный участник',
    });
    setActingOn(null);
    reload();
    onChanged();
  }

  async function deleteGroup() {
    if (
      !confirm(
        `точно удалить группу «${title}»? все сообщения исчезнут у всех участников.`,
      )
    )
      return;
    const r = await fetch(`/api/conversations/${conversationId}`, {
      method: 'DELETE',
    });
    if (!r.ok) {
      toast.push({ message: 'не вышло', kind: 'error' });
      return;
    }
    toast.push({ message: 'группа удалена' });
    onClose();
    router.push('/chat');
    onChanged();
  }

  async function leave() {
    if (
      !confirm(
        myRole === 'OWNER'
          ? 'выйти и передать владение следующему по старшинству?'
          : 'выйти из группы?',
      )
    )
      return;
    const r = await fetch(`/api/conversations/${conversationId}/leave`, {
      method: 'POST',
    });
    if (!r.ok) {
      toast.push({ message: 'не вышло', kind: 'error' });
      return;
    }
    toast.push({ message: 'вышел из группы' });
    onClose();
    router.push('/chat');
    onChanged();
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
            <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
              {view !== 'list' ? (
                <button
                  onClick={() => setView('list')}
                  className="p-1 -ml-1 rounded-full hover:bg-bg-hover"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <GroupAvatar src={avatarUrl} name={title} size={32} />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate text-[16px]">
                  {view === 'add'
                    ? 'добавить участников'
                    : view === 'edit'
                      ? 'настройки группы'
                      : title}
                </div>
                <div className="text-[12px] text-text-muted">
                  {view === 'add'
                    ? 'выбери из друзей'
                    : view === 'edit'
                      ? 'имя, описание, аватар'
                      : `${members.length} участн${
                          members.length === 1
                            ? 'ик'
                            : members.length < 5
                              ? 'ика'
                              : 'иков'
                        }`}
                </div>
              </div>
              {view === 'list' && canManage && (
                <button
                  onClick={() => setView('edit')}
                  className="p-1 rounded-full hover:bg-bg-hover text-text-muted hover:text-text"
                  aria-label="редактировать"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-bg-hover"
                aria-label="закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            {view === 'list' ? (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {description && (
                    <div className="px-4 py-3 border-b border-border/60">
                      <div className="text-[11px] uppercase tracking-wider text-text-subtle mb-1">
                        о группе
                      </div>
                      <div className="text-[14px] text-text whitespace-pre-wrap break-words">
                        {description}
                      </div>
                    </div>
                  )}
                  {canManage && (
                    <button
                      onClick={() => setView('add')}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-hover transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center">
                        <UserPlus className="w-4 h-4" />
                      </div>
                      <div className="font-medium text-[15px]">добавить участника</div>
                    </button>
                  )}
                  <div className="text-[11px] uppercase tracking-wider text-text-subtle px-4 py-2">
                    участники
                  </div>
                  {loading ? (
                    <div className="flex items-center justify-center py-6 text-text-muted">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : (
                    members.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (m.id === meId) return;
                          if (!canManage) return;
                          if (myRole === 'ADMIN' && m.role !== 'MEMBER') return;
                          setActingOn(m);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bg-hover transition-colors text-left disabled:opacity-50"
                      >
                        <Avatar
                          src={m.avatarUrl}
                          name={m.username}
                          size={40}
                          online={m.isOnline}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-[15px]">
                            {m.displayName ?? m.username}
                            {m.id === meId && (
                              <span className="text-text-subtle font-normal">
                                {' · вы'}
                              </span>
                            )}
                          </div>
                          <div className="text-[12px] text-text-muted truncate">
                            @{m.username}
                          </div>
                        </div>
                        {m.role === 'OWNER' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                            <Crown className="w-3 h-3" /> владелец
                          </span>
                        )}
                        {m.role === 'ADMIN' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-accent font-medium">
                            <Shield className="w-3 h-3" /> админ
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>

                <div className="border-t border-border p-3">
                  <button
                    onClick={leave}
                    className="w-full tk-btn-ghost text-danger hover:text-danger"
                  >
                    <LogOut className="w-4 h-4" />
                    выйти из группы
                  </button>
                </div>
              </>
            ) : view === 'add' ? (
              <AddMemberView
                conversationId={conversationId}
                existingIds={new Set(members.map((m) => m.id))}
                onDone={() => {
                  setView('list');
                  reload();
                  onChanged();
                }}
              />
            ) : (
              <EditGroupView
                conversationId={conversationId}
                title={title}
                description={description}
                avatarUrl={avatarUrl}
                canDelete={canDelete}
                onSaved={() => {
                  setView('list');
                  onChanged();
                }}
                onDelete={deleteGroup}
              />
            )}
          </motion.div>

          {/* Member-action sheet — kick / promote / demote, layered on top. */}
          {actingOn && (
            <MemberActionSheet
              member={actingOn}
              actorRole={myRole}
              onClose={() => setActingOn(null)}
              onKick={() => kick(actingOn)}
              onMakeAdmin={() => changeRole(actingOn, 'ADMIN')}
              onMakeMember={() => changeRole(actingOn, 'MEMBER')}
              onTransferOwner={() => changeRole(actingOn, 'OWNER')}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Tiny stable-ref helper for callbacks used in effect deps. */
function useCallbackRef<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ((...args: Parameters<T>) => ref.current(...args)) as T, []);
}

/* ───────── Member action sheet ───────── */

function MemberActionSheet({
  member,
  actorRole,
  onClose,
  onKick,
  onMakeAdmin,
  onMakeMember,
  onTransferOwner,
}: {
  member: Member;
  actorRole: Role;
  onClose: () => void;
  onKick: () => void;
  onMakeAdmin: () => void;
  onMakeMember: () => void;
  onTransferOwner: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:w-[360px] flex flex-col bg-bg-panel md:rounded-2xl rounded-t-2xl border-t md:border border-border shadow-2xl p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar src={member.avatarUrl} name={member.username} size={40} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate text-[15px]">
              {member.displayName ?? member.username}
            </div>
            <div className="text-[12px] text-text-muted">@{member.username}</div>
          </div>
        </div>
        <div className="h-px bg-border my-1" />

        {member.role === 'MEMBER' && (
          <ActionItem
            icon={<Shield className="w-4 h-4" />}
            label="назначить админом"
            onClick={onMakeAdmin}
          />
        )}
        {member.role === 'ADMIN' && actorRole === 'OWNER' && (
          <ActionItem
            icon={<Shield className="w-4 h-4" />}
            label="снять с админов"
            onClick={onMakeMember}
          />
        )}
        {actorRole === 'OWNER' && member.role !== 'OWNER' && (
          <ActionItem
            icon={<Crown className="w-4 h-4" />}
            label="передать владение"
            onClick={() => {
              if (
                confirm(
                  `передать владение группой ${member.displayName ?? member.username}?`,
                )
              ) {
                onTransferOwner();
              }
            }}
          />
        )}
        <ActionItem
          icon={<Trash2 className="w-4 h-4" />}
          label="удалить из группы"
          danger
          onClick={onKick}
        />
        <ActionItem
          icon={<X className="w-4 h-4" />}
          label="отмена"
          onClick={onClose}
        />
      </motion.div>
    </motion.div>
  );
}

function ActionItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors',
        danger ? 'text-danger hover:bg-danger/10' : 'text-text hover:bg-bg-hover',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ───────── Add-member picker ───────── */

function AddMemberView({
  conversationId,
  existingIds,
  onDone,
}: {
  conversationId: string;
  existingIds: Set<string>;
  onDone: () => void;
}) {
  const toast = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/friends')
      .then((r) => r.json())
      .then((d) => {
        setFriends(
          (d.friends ?? []).map((f: Friend & { friend?: Friend }) => f.friend ?? f),
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return friends
      .filter((f) => !existingIds.has(f.id))
      .filter((f) =>
        !q
          ? true
          : f.username.toLowerCase().includes(q) ||
            (f.displayName ?? '').toLowerCase().includes(q),
      );
  }, [friends, existingIds, search]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function add() {
    if (picked.size === 0) return;
    setBusy(true);
    const r = await fetch(`/api/conversations/${conversationId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: Array.from(picked) }),
    });
    setBusy(false);
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      toast.push({
        message:
          data?.error === 'too_many'
            ? 'превышен лимит'
            : data?.error === 'nothing_to_add'
              ? 'все уже в группе'
              : 'не вышло',
        kind: 'error',
      });
      return;
    }
    toast.push({ message: 'добавлены' });
    onDone();
  }

  return (
    <>
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
            некого добавить
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

      <div className="border-t border-border p-3">
        <button
          onClick={add}
          disabled={busy || picked.size === 0}
          className="w-full tk-btn-primary"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `добавить (${picked.size})`}
        </button>
      </div>
    </>
  );
}

/* ───────── Edit group view ───────── */

function EditGroupView({
  conversationId,
  title,
  description,
  avatarUrl,
  canDelete,
  onSaved,
  onDelete,
}: {
  conversationId: string;
  title: string;
  description: string | null;
  avatarUrl: string | null;
  canDelete: boolean;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(title);
  const [desc, setDesc] = useState(description ?? '');
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    setAvatar(data.url);
  }

  async function save() {
    if (!name.trim()) {
      toast.push({ message: 'имя не может быть пустым', kind: 'error' });
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: name.trim(),
        description: desc.trim() || null,
        avatarUrl: avatar,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.push({ message: 'не удалось сохранить', kind: 'error' });
      return;
    }
    toast.push({ message: 'сохранено' });
    onSaved();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
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

      <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4">
        <div className="relative">
          <GroupAvatar src={avatar} name={name || 'группа'} size={96} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 bg-accent rounded-full p-2 shadow-lg shadow-accent/30 hover:bg-accent-hover transition-all"
            aria-label="изменить аватар"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5 text-white" />
            )}
          </button>
        </div>
        {avatar && (
          <button
            onClick={() => setAvatar(null)}
            className="text-[12px] text-text-muted hover:text-danger inline-flex items-center gap-1"
          >
            <ImageIcon className="w-3 h-3" /> убрать аватар
          </button>
        )}
      </div>

      <div className="px-4 space-y-4 pb-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            имя группы
          </label>
          <input
            type="text"
            value={name}
            maxLength={48}
            onChange={(e) => setName(e.target.value)}
            className="tk-input"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            описание
          </label>
          <textarea
            value={desc}
            maxLength={200}
            onChange={(e) => setDesc(e.target.value)}
            className="tk-input min-h-[88px] resize-none"
            placeholder="о чём этот чат"
          />
          <div className="text-right text-xs text-text-subtle mt-1">
            {desc.length}/200
          </div>
        </div>
      </div>

      <div className="border-t border-border p-3 flex flex-col gap-2">
        <button onClick={save} disabled={busy} className="w-full tk-btn-primary">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'сохранить'}
        </button>
        {canDelete && (
          <button
            onClick={onDelete}
            className="w-full tk-btn-ghost text-danger hover:text-danger"
          >
            <Trash2 className="w-4 h-4" /> удалить группу
          </button>
        )}
      </div>
    </div>
  );
}
