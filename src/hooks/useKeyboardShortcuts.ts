'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Global keyboard shortcuts:
 *   Cmd/Ctrl+K → /friends (search)
 *   Cmd/Ctrl+/ → focus message composer (if mounted)
 *   Esc       → click whatever element exposes [data-esc-close] (modals)
 *
 * Inputs and contenteditable areas are exempt from non-Cmd shortcuts so
 * typing isn't hijacked.
 */
export function useKeyboardShortcuts() {
  const router = useRouter();
  useEffect(() => {
    function isEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return target.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+K — quick jump to friends search.
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/friends');
        return;
      }

      // Cmd+/ — focus the chat composer textarea.
      if (meta && e.key === '/') {
        e.preventDefault();
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[placeholder*="сообщение"], textarea[placeholder*="отредактируй"]',
        );
        ta?.focus();
        return;
      }

      // Esc — let modals self-close via data-esc-close. Skip when typing.
      if (e.key === 'Escape' && !isEditable(e.target)) {
        const closer = document.querySelector<HTMLElement>('[data-esc-close]');
        if (closer) {
          e.preventDefault();
          closer.click();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
}
