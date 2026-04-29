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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/Toast';
import { useDebugStore } from '@/lib/debug-store';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';

type SendInput = {
  type: ChatMessage['type'];
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  durationMs?: number;
};

export function Composer({
  onSend,
  onTyping,
}: {
  onSend: (input: SendInput) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileImageRef = useRef<HTMLInputElement>(null);
  const fileVideoRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const attachRef = useRef<HTMLDivElement>(null);

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
    onTyping(value.length > 0);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => onTyping(false), 2000);
  }

  async function submit() {
    const v = text.trim();
    if (!v) return;

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

    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
    onTyping(false);
    await onSend({ type: 'TEXT', content: v });
  }

  async function uploadAndSend(file: File, type: 'IMAGE' | 'VIDEO') {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', type === 'IMAGE' ? 'image' : 'video');
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      setUploading(false);
      const data = await res.json().catch(() => ({}));
      toast.push({ message: data.error ?? 'не удалось загрузить', kind: 'error' });
      return;
    }
    const data = await res.json();
    setUploading(false);
    await onSend({
      type,
      mediaUrl: data.url,
      mediaMimeType: data.mimeType,
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
        await onSend({
          type: 'VOICE',
          mediaUrl: data.url,
          mediaMimeType: 'audio/webm',
          durationMs: duration,
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
            {/* Attach button + popover */}
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
                }}
                rows={1}
                placeholder="напиши сообщение"
                className="flex-1 resize-none bg-transparent px-4 py-2.5 text-[15px] outline-none placeholder:text-text-subtle max-h-40"
              />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {hasText ? (
                <motion.button
                  key="send"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={submit}
                  className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/30 active:scale-95 transition-transform"
                  title="отправить"
                  aria-label="отправить"
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
    </div>
  );
}
