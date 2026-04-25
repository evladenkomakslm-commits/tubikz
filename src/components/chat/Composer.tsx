'use client';
import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Mic, Send, X, Loader2, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/Toast';
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
  const toast = useToast();

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

  return (
    <div className="border-t border-border bg-bg-panel px-3 sm:px-4 py-3">
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
            className="flex items-center gap-3"
          >
            <button
              onClick={() => stopRecording(true)}
              className="p-2 rounded-full text-text-muted hover:text-danger transition-colors"
              title="отмена"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center gap-3 bg-bg-elevated rounded-2xl px-4 py-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse-soft" />
              <span className="text-sm text-text">
                запись · {Math.floor(recordingMs / 1000)}s
              </span>
            </div>
            <button
              onClick={() => stopRecording(false)}
              className="p-2.5 rounded-full bg-accent text-white hover:bg-accent-hover transition-colors"
              title="отправить"
            >
              <Send className="w-5 h-5" />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="compose"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-end gap-2"
          >
            <button
              onClick={() => fileImageRef.current?.click()}
              disabled={uploading}
              className="p-2.5 rounded-full text-text-muted hover:text-accent hover:bg-bg-hover transition-colors"
              title="фото"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => fileVideoRef.current?.click()}
              disabled={uploading}
              className="p-2.5 rounded-full text-text-muted hover:text-accent hover:bg-bg-hover transition-colors"
              title="видео"
            >
              <Square className="w-5 h-5" />
            </button>
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
              className="flex-1 resize-none bg-bg-elevated border border-border rounded-2xl px-4 py-2.5 text-[14px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 max-h-40"
            />
            {text.trim() ? (
              <button
                onClick={submit}
                className="p-2.5 rounded-full bg-accent text-white hover:bg-accent-hover transition-colors"
                title="отправить"
              >
                <Send className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="p-2.5 rounded-full text-text-muted hover:text-accent hover:bg-bg-hover transition-colors"
                title="голосовое"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
