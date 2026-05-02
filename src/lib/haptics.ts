/**
 * Tiny haptic helper. Uses the standard Web Vibration API where available
 * (Android Chrome, Capacitor Android). iOS Safari has no public haptic API,
 * so on iPhone the call is a silent no-op — the visual animation is what
 * carries the feedback there.
 */
export type HapticIntensity = 'tap' | 'pop' | 'success';

const PATTERNS: Record<HapticIntensity, number | number[]> = {
  tap: 12,
  pop: 25,
  success: [10, 30, 10],
};

export function haptic(intensity: HapticIntensity = 'tap') {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (typeof nav.vibrate === 'function') {
    try {
      nav.vibrate(PATTERNS[intensity]);
    } catch {
      // Ignore — some browsers throw if called without prior user gesture.
    }
  }
}
