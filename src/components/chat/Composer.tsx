'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Mic,
  Send,
  X,
  Loader2,
  Paperclip,
  Video as VideoIcon,
  File as FileIcon,
  Reply as ReplyIcon,
  Pencil,
  BarChart3,
  MapPin,
  UserRound,
  Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/Toast';
import { useDebugStore } from '@/lib/debug-store';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { loadDraft, saveDraft, clearDraft } from '@/lib/drafts';
import { compressImage } from '@/lib/image-compress';
import { PollDialog } from './PollDialog';
import { LocationDialog } from './LocationDialog';
import { ContactPicker } from './ContactPicker';
import { ScheduleDialog } from './ScheduleDialog';
import type { ChatMessage } from '@/types';

type SendInput = {
  type: ChatMessage['type'];
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  durationMs?: number;
  replyToId?: string;
  /** ISO timestamp; if set, server delivers later. */
  scheduledAt?: string;
};

export interface ReplyTarget {
  id: string;
  senderName: string;
  preview: string;
}

export interface EditTarget {
  id: string;
  initialContent: string;
}

export function Composer({
  conversationId,
  onSend,
  onTyping,
  replyTo,
  onCancelReply,
  editing,
  onCancelEdit,
  onSubmitEdit,
}: {
  conversationId: string;
  onSend: (input: SendInput) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  editing?: EditTarget | null;
  onCancelEdit?: () => void;
  onSubmitEdit?: (id: string, content: string) => Promise<void>;
}) {
  // Initial seed from localStorage so the half-typed message survives
  // navigation away and back. We can't read localStorage on the server,
  // so it stays empty during SSR and gets hydrated on mount via effect.
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const draftSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileImageRef = useRef<HTMLInputElement>(null);
  const fileVideoRef = useRef<HTMLInputElement>(null);
  const fileAnyRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const attachRef = useRef<HTMLDivElement>(null);

  // Hydrate the draft when the conversation changes. Cleared by send.
  useEffect(() => {
    const v = loadDraft(conversationId);
    setText(v);
    // Resize textarea to fit prefilled content.
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.style.height = 'auto';
        taRef.current.style.height = `${Math.min(taRef.current.scrollHeight, 160)}px`;
      }
    });
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [conversationId]);

  // When entering edit mode, prime the textarea with the existing content
  // and focus it. When exiting, blank it.
  useEffect(() => {
    if (editing) {
      setText(editing.initialContent);
      requestAnimationFrame(() => {
        taRef.current?.focus();
        if (taRef.current) {
          taRef.current.style.height = 'auto';
          taRef.current.style.height = `${Math.min(taRef.current.scrollHeight, 160)}px`;
        }
      });
    }
  }, [editing]);

  // Same when starting a reply — focus the textarea so the user can just type.
  useEffect(() => {
    if (replyTo) taRef.current?.focus();
  }, [replyTo]);

  // Close attach popover on outside click.
  useEffect(() => {
    if (!attachOpen) return;
    const onClick = (e: MouseEvent) => {
      if (attachRef.current && !attachRef.current.contains(e.target as Node)) {
        setAttachOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [attachOpen]);
  const toast = useToast();
  const debugToggle = useDebugStore((s) => s.toggle);
  const { data: session } = useSession();

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  function handleTyping(value: string) {
    setText(value);
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = `${Math.min(taRef.current.scrollHeight, 160)}px`;
    }
    if (!editing) {
      onTyping(value.length > 0);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => onTyping(false), 2000);
      // Persist draft after a short pause so we don't write on every keystroke.
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = setTimeout(() => {
        saveDraft(conversationId, value);
      }, 350);
    }
  }

  async function submit() {
    const v = text.trim();
    if (!v) return;

    // Edit mode short-circuits everything else.
    if (editing && onSubmitEdit) {
      const id = editing.id;
      const content = v;
      setText('');
      if (taRef.current) taRef.current.style.height = 'auto';
      onCancelEdit?.();
      await onSubmitEdit(id, content);
      return;
    }

    // Slash-команды — не отправляются, обрабатываются локально.
    if (v.startsWith('/')) {
      const cmd = v.slice(1).split(/\s+/)[0].toLowerCase();
      if (cmd === 'debug') {
        debugToggle();
        toast.push({ message: 'debug-панель переключена' });
        setText('');
        if (taRef.current) taRef.current.style.height = 'auto';
        return;
      }
      if (cmd === 'whoami') {
        toast.push({
          message: `id: ${session?.user?.id ?? '—'} · @${session?.user?.username ?? '—'}`,
        });
        setText('');
        if (taRef.current) taRef.current.style.height = 'auto';
        return;
      }
      if (cmd === 'help') {
        toast.push({
          message: '/debug · /whoami · /help — команды не отправляются',
        });
        setText('');
        if (taRef.current) taRef.current.style.height = 'auto';
        return;
      }
      // Неизвестная команда — отправим как обычный текст.
    }

    await dispatchText(v);
  }

  /** Common send-text path used by both Enter and the Schedule dialog. */
  async function dispatchText(text: string, scheduledAt?: string) {
    const replyToId = replyTo?.id;
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
    onTyping(false);
    clearDraft(conversationId);
    onCancelReply?.();
    await onSend({ type: 'TEXT', content: text, replyToId, scheduledAt });
  }

  async function uploadAndSend(file: File, type: 'IMAGE' | 'VIDEO' | 'FILE') {
    setUploading(true);
    // Squeeze JPEGs / non-alpha PNGs down to ≤1920px before they hit the
    // wire. This is the single biggest factor in mobile data usage.
    const finalFile = type === 'IMAGE' ? await compressImage(file) : file;
    const fd = new FormData();
    fd.append('file', finalFile);
    fd.append(
      'kind',
      type === 'IMAGE' ? 'image' : type === 'VIDEO' ? 'video' : 'file',
    );
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      setUploading(false);
      const data = await res.json().catch(() => ({}));
      toast.push({ message: data.error ?? 'не удалось загрузить', kind: 'error' });
      return;
    }
    const data = await res.json();
    setUploading(false);
    const replyToId = replyTo?.id;
    onCancelReply?.();
    await onSend({
      type,
      mediaUrl: data.url,
      mediaMimeType: data.mimeType,
      // Preserve original filename + size for FILE type — needed for the
      // bubble UI (filename + KB shown).
      content: type === 'FILE' ? `${finalFile.name}|${finalFile.size}` : undefined,
      replyToId,
    });
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.push({ message: 'браузер не поддерживает запись', kind: 'error' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const duration = Date.now() - startedAtRef.current;
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', 'voice');
        setUploading(true);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        setUploading(false);
        if (!res.ok) {
          toast.push({ message: 'не удалось загрузить голосовое', kind: 'error' });
          return;
        }
        const data = await res.json();
        const replyToId = replyTo?.id;
        onCancelReply?.();
        await onSend({
          type: 'VOICE',
          mediaUrl: data.url,
          mediaMimeType: 'audio/webm',
          durationMs: duration,
          replyToId,
        });
      };
      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setRecording(true);
      setRecordingMs(0);
      tickRef.current = setInterval(() => {
        setRecordingMs(Date.now() - startedAtRef.current);
      }, 200);
    } catch {
      toast.push({ message: 'нет доступа к микрофону', kind: 'error' });
    }
  }

  function stopRecording(cancel = false) {
    const rec = recorderRef.current;
    if (!rec) return;
    if (cancel) {
      rec.ondataavailable = null;
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
      };
    }
    rec.stop();
    setRecording(false);
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  const hasText = text.trim().length > 0;
  const showActionChip = !!editing || !!replyTo;

  return (
    <div className="border-t border-border/60 bg-bg-panel/95 backdrop-blur px-2 sm:px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
      <input
        ref={fileImageRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadAndSend(f, 'IMAGE');
          e.target.value = '';
        }}
      />
      <input
        ref={fileVideoRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadAndSend(f, 'VIDEO');
          e.target.value = '';
        }}
      />
      <input
        ref={fileAnyRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadAndSend(f, 'FILE');
          e.target.value = '';
        }}
      />

      {/* Reply / edit chip — sits just above the input row. */}
      <AnimatePresence>
        {showActionChip && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 mb-1 bg-bg-elevated rounded-xl border-l-2 border-accent">
              {editing ? (
                <Pencil className="w-4 h-4 text-accent shrink-0" />
              ) : (
                <ReplyIcon className="w-4 h-4 text-accent shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-accent">
                  {editing ? 'редактирование' : `ответ ${replyTo!.senderName}`}
                </div>
                <div className="text-[13px] text-text-muted truncate">
                  {editing ? editing.initialContent : replyTo!.preview}
                </div>
              </div>
              <button
                onClick={() => {
                  if (editing) {
                    setText('');
                    if (taRef.current) taRef.current.style.height = 'auto';
                    onCancelEdit?.();
                  } else {
                    onCancelReply?.();
                  }
                }}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
                aria-label="отменить"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {recording ? (
          <motion.div
            key="rec"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-center gap-2"
          >
            <button
              onClick={() => stopRecording(true)}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-text-muted hover:text-danger active:bg-bg-hover transition-colors"
              title="отмена"
              aria-label="отменить запись"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center gap-3 bg-bg-elevated rounded-full px-4 h-10">
              <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse-soft" />
              <span className="text-sm text-text tabular-nums">
                {Math.floor(recordingMs / 1000)}s
              </span>
            </div>
            <button
              onClick={() => stopRecording(false)}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/30 active:scale-95 transition-transform"
              title="отправить"
              aria-label="отправить голосовое"
            >
              <Send className="w-5 h-5" />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="compose"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-end gap-1.5"
          >
            {/* Hide attach when editing — can't change attachment of an existing message. */}
            {!editing && (
              <div ref={attachRef} className="relative shrink-0">
                <button
                  onClick={() => setAttachOpen((v) => !v)}
                  disabled={uploading}
                  className={cn(
                    'w-10 h-10 flex items-center justify-center rounded-full transition-all',
                    attachOpen
                      ? 'bg-accent-soft text-accent rotate-45'
                      : 'text-text-muted hover:bg-bg-hover active:bg-bg-hover/80',
                  )}
                  title="прикрепить"
                  aria-label="прикрепить файл"
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Paperclip className="w-5 h-5" />
                  )}
                </button>
                <AnimatePresence>
                  {attachOpen && !uploading && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full left-0 mb-2 bg-bg-panel border border-border rounded-2xl shadow-2xl p-1.5 flex flex-col gap-0.5 min-w-[160px]"
                    >
                      <button
                        onClick={() => {
                          setAttachOpen(false);
                          fileImageRef.current?.click();
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg-hover text-left text-sm"
                      >
                        <ImageIcon className="w-4 h-4 text-accent" />
                        фото
                      </button>
                      <button
                        onClick={() => {
                          setAttachOpen(false);
                          fileVideoRef.current?.click();
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg-hover text-left text-sm"
                      >
                        <VideoIcon className="w-4 h-4 text-success" />
                        видео
                      </button>
                      <button
                        onClick={() => {
                          setAttachOpen(false);
                          fileAnyRef.current?.click();
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg-hover text-left text-sm"
                      >
                        <FileIcon className="w-4 h-4 text-text-muted" />
                        файл
                      </button>
                      <button
                        onClick={() => {
                          setAttachOpen(false);
                          setPollOpen(true);
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg-hover text-left text-sm"
                      >
                        <BarChart3 className="w-4 h-4 text-fuchsia-400" />
                        опрос
                      </button>
                      <button
                        onClick={() => {
                          setAttachOpen(false);
                          setLocationOpen(true);
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg-hover text-left text-sm"
                      >
                        <MapPin className="w-4 h-4 text-rose-400" />
                        локация
                      </button>
                      <button
                        onClick={() => {
                          setAttachOpen(false);
                          setContactOpen(true);
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg-hover text-left text-sm"
                      >
                        <UserRound className="w-4 h-4 text-sky-400" />
                        контакт
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="flex-1 flex items-end bg-bg-elevated rounded-3xl border border-border/60 focus-within:border-accent/60 transition-colors">
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => handleTyping(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                  if (e.key === 'Escape') {
                    if (editing) onCancelEdit?.();
                    else if (replyTo) onCancelReply?.();
                  }
                }}
                rows={1}
                placeholder={editing ? 'отредактируй сообщение' : 'напиши сообщение'}
                // 16px is the threshold below which iOS Safari force-zooms
                // the page on focus. Anything smaller (e.g. 15px) leaves the
                // chat header stuck off-screen after blur.
                className="flex-1 resize-none bg-transparent px-4 py-2.5 text-base outline-none placeholder:text-text-subtle max-h-40"
              />
            </div>

            {/* Schedule button — only visible while there is text and we're
                not editing an existing message. */}
            {hasText && !editing && (
              <button
                onClick={() => setScheduleOpen(true)}
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-text-muted hover:text-accent hover:bg-bg-hover transition-colors"
                title="отложить отправку"
                aria-label="отложить отправку"
              >
                <Clock className="w-5 h-5" />
              </button>
            )}

            <AnimatePresence mode="wait" initial={false}>
              {hasText || editing ? (
                <motion.button
                  key="send"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={submit}
                  className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/30 active:scale-95 transition-transform"
                  title={editing ? 'сохранить' : 'отправить'}
                  aria-label={editing ? 'сохранить' : 'отправить'}
                >
                  <Send className="w-5 h-5 -ml-0.5" />
                </motion.button>
              ) : (
                <motion.button
                  key="mic"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={startRecording}
                  className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-text-muted hover:text-accent hover:bg-bg-hover active:bg-bg-hover/80 transition-colors"
                  title="голосовое"
                  aria-label="записать голосовое"
                >
                  <Mic className="w-5 h-5" />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <PollDialog
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        onCreate={async (input) => {
          const res = await fetch(
            `/api/conversations/${conversationId}/messages/poll`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(input),
            },
          );
          if (!res.ok) {
            toast.push({ message: 'не удалось создать опрос', kind: 'error' });
            return false;
          }
          return true;
        }}
      />

      <LocationDialog
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        onShare={async (lat, lng) => {
          await onSend({
            type: 'LOCATION',
            content: `${lat.toFixed(6)},${lng.toFixed(6)}`,
            replyToId: replyTo?.id,
          });
          onCancelReply?.();
          return true;
        }}
      />

      <ContactPicker
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        onShare={async (f) => {
          // pipe-separated: id|username|displayName|avatarUrl
          const content = [
            f.id,
            f.username,
            f.displayName ?? '',
            f.avatarUrl ?? '',
          ].join('|');
          await onSend({
            type: 'CONTACT',
            content,
            replyToId: replyTo?.id,
          });
          onCancelReply?.();
          return true;
        }}
      />

      <ScheduleDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onConfirm={(date) => {
          const v = text.trim();
          if (!v) return;
          // Schedule path uses the same dispatch flow but with scheduledAt set.
          dispatchText(v, date.toISOString());
          toast.push({
            message: `отложено на ${date.toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}`,
          });
        }}
      />
    </div>
  );
}
