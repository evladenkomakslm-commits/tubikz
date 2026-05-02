/**
 * Tiny in-process notification sound. We synthesise the chime via
 * WebAudio so we don't have to ship an audio asset — easier to keep the
 * bundle slim and avoid CORS/PWA caching headaches.
 *
 * Two sounds:
 *   incoming() — soft two-note ping for messages from others.
 *   outgoing() — single softer click on send (optional).
 *
 * Both are no-ops on first call until a user gesture has unlocked the
 * AudioContext (Safari/iOS requirement). The first call after a tap is
 * usually enough to keep audio alive for the rest of the session.
 */

let ctx: AudioContext | null = null;
let muted = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (muted) return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

function tone(freq: number, durMs: number, when = 0, volume = 0.06) {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = freq;
  osc.type = 'sine';
  const start = c.currentTime + when / 1000;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durMs / 1000);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(start);
  osc.stop(start + durMs / 1000 + 0.05);
}

export function playIncoming() {
  // Two-note ascending chime, ~180 ms total.
  tone(660, 90, 0, 0.05);
  tone(880, 130, 90, 0.05);
}

export function playOutgoing() {
  tone(440, 60, 0, 0.03);
}

export function setSoundsMuted(v: boolean) {
  muted = v;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('tk:sounds-muted', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
}

export function loadSoundPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    muted = window.localStorage.getItem('tk:sounds-muted') === '1';
  } catch {
    /* ignore */
  }
  return muted;
}
