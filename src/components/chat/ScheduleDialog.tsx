'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, X } from 'lucide-react';

const QUICK_OPTIONS = [
  { label: 'через 1 час', mins: 60 },
  { label: 'через 3 часа', mins: 180 },
  { label: 'завтра в 9:00', kind: 'tomorrow-9' as const },
  { label: 'через неделю', mins: 60 * 24 * 7 },
];

export function ScheduleDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}) {
  const [custom, setCustom] = useState('');

  // Default custom to "today, 1 hour from now" rounded to 10min when opened.
  useEffect(() => {
    if (!open) return;
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10);
    // toISOString returns UTC; trim seconds and Z, then chop to local-ish.
    const tz = d.getTimezoneOffset() * 60_000;
    setCustom(new Date(d.getTime() - tz).toISOString().slice(0, 16));
  }, [open]);

  function pickQuick(opt: (typeof QUICK_OPTIONS)[number]) {
    const d = new Date();
    if ('kind' in opt) {
      // tomorrow at 09:00 local
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else {
      d.setMinutes(d.getMinutes() + opt.mins);
      d.setSeconds(0, 0);
    }
    onConfirm(d);
    onClose();
  }

  function pickCustom() {
    if (!custom) return;
    const d = new Date(custom);
    if (Number.isNaN(d.getTime())) return;
    if (d.getTime() < Date.now() + 30_000) return;
    onConfirm(d);
    onClose();
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
            className="w-full md:w-[400px] flex flex-col bg-bg-panel md:rounded-2xl rounded-t-2xl border-t md:border border-border shadow-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
          >
            <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Clock className="w-5 h-5 text-accent" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[16px]">отложить отправку</div>
                <div className="text-[12px] text-text-muted">
                  будет отправлено автоматически
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

            <div className="p-3 space-y-1">
              {QUICK_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => pickQuick(opt)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-bg-hover transition-colors flex items-center gap-3"
                >
                  <Calendar className="w-4 h-4 text-text-muted" />
                  <span className="text-[14px]">{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="border-t border-border p-3 space-y-2">
              <label className="block text-xs uppercase tracking-wider text-text-muted">
                выбрать дату и время
              </label>
              <input
                type="datetime-local"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="tk-input"
              />
              <button
                onClick={pickCustom}
                className="w-full tk-btn-primary"
              >
                запланировать
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return createPortal(tree, document.body);
}
