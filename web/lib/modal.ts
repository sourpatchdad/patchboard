import { useLayoutEffect, useRef } from 'react';

/** Keyboard containment and focus return for an overlay that blocks the page. */
export function useModal<T extends HTMLElement>(onClose: () => void, open = true) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Capture before React's autoFocus moves focus into the new overlay.
  const origin = useRef(document.activeElement);
  if (!ref.current) origin.current = document.activeElement;
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = origin.current;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')]
      .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert]') && el.getClientRects().length > 0);
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    if (!dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab') {
        const items = focusable();
        const first = items[0] ?? dialog;
        const last = items.at(-1) ?? dialog;
        if (e.shiftKey ? document.activeElement === first || document.activeElement === dialog : document.activeElement === last || document.activeElement === dialog) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    // Make background links unavailable to keyboard and assistive technology.
    const background: HTMLElement[] = [];
    for (let branch: HTMLElement = dialog; branch.parentElement; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          background.push(sibling);
        }
      }
    }
    dialog.addEventListener('keydown', key);
    return () => {
      dialog.removeEventListener('keydown', key);
      for (const el of background) el.inert = false;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
