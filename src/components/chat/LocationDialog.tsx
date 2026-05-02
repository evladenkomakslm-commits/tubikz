'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, MapPin, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

/**
 * Get the user's current GPS coordinate via navigator.geolocation, show
 * a small OpenStreetMap preview, then send.
 *
 * The location payload is encoded into the message's `content` as
 * `lat,lng[,label]` — no schema field needed.
 */
export function LocationDialog({
  open,
  onClose,
  onShare,
}: {
  open: boolean;
  onClose: () => void;
  onShare: (lat: number, lng: number) => Promise<boolean>;
}) {
  const toast = useToast();
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPos(null);
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('геолокация не поддерживается');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos(p);
        setLoading(false);
      },
      (e) => {
        setLoading(false);
        setError(
          e.code === e.PERMISSION_DENIED
            ? 'нет разрешения на геолокацию'
            : 'не удалось определить местоположение',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, [open]);

  async function send() {
    if (!pos) return;
    setBusy(true);
    const ok = await onShare(pos.coords.latitude, pos.coords.longitude);
    setBusy(false);
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
            className="w-full md:w-[480px] flex flex-col bg-bg-panel md:rounded-2xl rounded-t-2xl border-t md:border border-border shadow-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
          >
            <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <MapPin className="w-5 h-5 text-accent" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[16px]">
                  поделиться локацией
                </div>
                <div className="text-[12px] text-text-muted">
                  собеседник увидит точку на карте
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

            <div className="px-4 py-4 min-h-[260px] flex items-center justify-center">
              {loading ? (
                <div className="flex flex-col items-center gap-2 text-text-muted">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-sm">определяю положение…</span>
                </div>
              ) : error ? (
                <div className="text-center text-sm text-danger">{error}</div>
              ) : pos ? (
                <div className="w-full">
                  <div className="rounded-xl overflow-hidden border border-border">
                    <iframe
                      title="карта"
                      className="w-full h-[200px] border-0"
                      src={osmEmbed(pos.coords.latitude, pos.coords.longitude)}
                    />
                  </div>
                  <div className="mt-3 text-[12.5px] text-text-muted text-center tabular-nums">
                    {pos.coords.latitude.toFixed(5)}, {pos.coords.longitude.toFixed(5)}
                    {pos.coords.accuracy && (
                      <> · ±{Math.round(pos.coords.accuracy)} м</>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-border p-3">
              <button
                onClick={send}
                disabled={!pos || busy}
                className="w-full tk-btn-primary"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'отправить'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return createPortal(tree, document.body);
}

/** Embed-friendly OSM URL with a marker at (lat, lng). */
function osmEmbed(lat: number, lng: number): string {
  const dLat = 0.005;
  const dLng = 0.01;
  const bbox = `${lng - dLng}%2C${lat - dLat}%2C${lng + dLng}%2C${lat + dLat}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}
