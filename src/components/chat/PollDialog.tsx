'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Loader2, Plus, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const MAX_OPTIONS = 10;

export function PollDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    question: string;
    options: string[];
    multipleChoice: boolean;
    anonymous: boolean;
  }) => Promise<boolean>;
}) {
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const qRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuestion('');
    setOptions(['', '']);
    setMulti(false);
    setAnon(false);
    requestAnimationFrame(() => qRef.current?.focus());
  }, [open]);

  function setOption(i: number, value: string) {
    setOptions((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  }

  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    const q = question.trim();
    const trimmed = options.map((o) => o.trim()).filter(Boolean);
    const unique = [...new Set(trimmed)];
    if (!q) {
      toast.push({ message: 'введи вопрос', kind: 'error' });
      return;
    }
    if (unique.length < 2) {
      toast.push({ message: 'нужно минимум 2 разных варианта', kind: 'error' });
      return;
    }
    setBusy(true);
    const ok = await onCreate({
      question: q,
      options: unique,
      multipleChoice: multi,
      anonymous: anon,
    });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="poll-bg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full md:w-[480px] max-h-[88dvh] flex flex-col bg-bg-panel md:rounded-2xl rounded-t-2xl border-t md:border border-border shadow-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
          >
            <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <BarChart3 className="w-5 h-5 text-accent" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[16px]">новый опрос</div>
                <div className="text-[12px] text-text-muted">
                  до {MAX_OPTIONS} вариантов
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

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
                  вопрос
                </label>
                <input
                  ref={qRef}
                  type="text"
                  value={question}
                  maxLength={200}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="что хотите спросить?"
                  className="tk-input"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
                  варианты
                </label>
                <div className="space-y-2">
                  {options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={o}
                        maxLength={80}
                        onChange={(e) => setOption(i, e.target.value)}
                        placeholder={`вариант ${i + 1}`}
                        className="tk-input flex-1"
                      />
                      {options.length > 2 && (
                        <button
                          onClick={() => removeOption(i)}
                          className="p-2 rounded-full text-text-muted hover:text-danger hover:bg-bg-hover transition-colors"
                          aria-label="убрать"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {options.length < MAX_OPTIONS && (
                  <button
                    onClick={addOption}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover"
                  >
                    <Plus className="w-4 h-4" />
                    добавить вариант
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <ToggleRow
                  label="несколько вариантов"
                  hint="каждый может выбрать больше одного"
                  on={multi}
                  onChange={setMulti}
                />
                <ToggleRow
                  label="анонимный"
                  hint="видно только сколько проголосовало"
                  on={anon}
                  onChange={setAnon}
                />
              </div>
            </div>

            <div className="border-t border-border p-3">
              <button
                onClick={submit}
                disabled={busy}
                className="w-full tk-btn-primary"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'создать'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover transition-colors text-left"
    >
      <div>
        <div className="text-[14px] font-medium">{label}</div>
        <div className="text-[12px] text-text-muted">{hint}</div>
      </div>
      <div
        className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
          on ? 'bg-accent' : 'bg-bg-subtle'
        }`}
      >
        <div
          className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
            on ? 'translate-x-4' : ''
          }`}
        />
      </div>
    </button>
  );
}
