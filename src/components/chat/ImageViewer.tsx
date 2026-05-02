'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';

export interface GalleryImage {
  id: string;
  url: string;
  /** "@username · 12:34" — header subtitle on the viewer. */
  caption?: string;
}

/**
 * Fullscreen image viewer with keyboard / swipe nav.
 *
 *  - left / right arrow keys + on-screen chevrons (desktop)
 *  - swipe gestures (mobile) — anything past 80px counts
 *  - Esc / tap-on-backdrop / X to close
 *  - download button per image
 */
export function ImageViewer({
  images,
  startIndex = 0,
  onClose,
}: {
  images: GalleryImage[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const dragXRef = useRef(0);

  useEffect(() => setIndex(startIndex), [startIndex, images.length]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight')
        setIndex((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  if (!images.length) return null;
  const cur = images[index];
  const canPrev = index > 0;
  const canNext = index < images.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        key="img-viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[70] bg-black/95 flex flex-col"
        onClick={onClose}
      >
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-sm text-white/80 truncate">
            {cur.caption ?? `${index + 1} / ${images.length}`}
          </div>
          <div className="flex items-center gap-1">
            <a
              href={cur.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              aria-label="скачать"
            >
              <Download className="w-5 h-5" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              aria-label="закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Image area */}
        <div
          className="flex-1 flex items-center justify-center relative overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Prev / next chevrons (desktop) */}
          {canPrev && (
            <button
              onClick={() => setIndex((i) => i - 1)}
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="предыдущее"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {canNext && (
            <button
              onClick={() => setIndex((i) => i + 1)}
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="следующее"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          <motion.div
            key={cur.id}
            // Horizontal swipe on mobile.
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDrag={(_, info) => {
              dragXRef.current = info.offset.x;
            }}
            onDragEnd={(_, info) => {
              const dx = dragXRef.current;
              dragXRef.current = 0;
              if (Math.abs(info.velocity.x) < 200 && Math.abs(dx) < 80) return;
              if (dx > 0 && canPrev) setIndex(index - 1);
              else if (dx < 0 && canNext) setIndex(index + 1);
            }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className="max-w-[100vw] max-h-[100%] px-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cur.url}
              alt=""
              draggable={false}
              className="max-h-[80dvh] max-w-full object-contain rounded-lg select-none"
            />
          </motion.div>
        </div>

        {/* Thumbnail strip (only when there's more than one) */}
        {images.length > 1 && (
          <div
            className="px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-1.5 overflow-x-auto justify-center">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setIndex(i)}
                  className={
                    'shrink-0 rounded-md overflow-hidden border-2 transition-all ' +
                    (i === index
                      ? 'border-accent scale-100'
                      : 'border-transparent opacity-50 hover:opacity-100')
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt=""
                    className="h-12 w-12 object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
