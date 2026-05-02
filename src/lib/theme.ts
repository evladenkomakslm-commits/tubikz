/**
 * Accent-color theming. Stored in localStorage and applied to the
 * document root as `--accent-rgb` / `--accent-hover-rgb` triplets so
 * Tailwind's `accent` colour classes (including opacity utilities like
 * `bg-accent/20`) all follow.
 */

export type AccentName = 'purple' | 'pink' | 'emerald' | 'sky' | 'amber';

export const ACCENTS: Record<AccentName, { rgb: string; hover: string; hex: string }> = {
  purple: { rgb: '124 92 255', hover: '139 109 255', hex: '#7c5cff' },
  pink:   { rgb: '255 92 161', hover: '255 119 178', hex: '#ff5ca1' },
  emerald: { rgb: '62 207 142', hover: '92 220 162', hex: '#3ecf8e' },
  sky:    { rgb: '92 177 255', hover: '120 192 255', hex: '#5cb1ff' },
  amber:  { rgb: '255 164 92',  hover: '255 184 124', hex: '#ffa45c' },
};

const KEY = 'tk:accent';

export function applyAccent(name: AccentName) {
  if (typeof document === 'undefined') return;
  const cfg = ACCENTS[name] ?? ACCENTS.purple;
  document.documentElement.style.setProperty('--accent-rgb', cfg.rgb);
  document.documentElement.style.setProperty('--accent-hover-rgb', cfg.hover);
  try {
    window.localStorage.setItem(KEY, name);
  } catch {
    /* ignore */
  }
}

export function loadAccent(): AccentName {
  if (typeof window === 'undefined') return 'purple';
  try {
    const v = window.localStorage.getItem(KEY) as AccentName | null;
    if (v && v in ACCENTS) return v;
  } catch {
    /* ignore */
  }
  return 'purple';
}

/** Apply the saved accent on first render. Idempotent. */
export function bootstrapAccent() {
  applyAccent(loadAccent());
}
