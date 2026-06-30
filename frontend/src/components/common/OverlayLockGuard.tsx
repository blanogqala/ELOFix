import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Safety net for Radix modal locks.
 *
 * Radix dialogs/menus set `document.body.style.pointerEvents = "none"`
 * (DismissableLayer) and `react-remove-scroll` locks the body via the
 * `data-scroll-locked` attribute (`overflow: hidden !important`). When an action
 * navigates to another route while such a layer is still open, the layer unmounts
 * mid-transition and its cleanup can fail to restore those styles — leaving the
 * whole app frozen and unscrollable.
 *
 * After each route change we clear those leftover locks, but only when no Radix
 * layer is actually open, so a legitimately open dialog is never disturbed.
 */
export function OverlayLockGuard() {
  const location = useLocation();

  useEffect(() => {
    // Defer past the route transition + Radix unmount cleanup.
    const id = window.setTimeout(() => {
      const hasOpenLayer = document.querySelector(
        [
          '[role="dialog"][data-state="open"]',
          '[role="alertdialog"][data-state="open"]',
          '[role="menu"][data-state="open"]',
          '[role="listbox"][data-state="open"]',
          '[data-radix-focus-guard]',
        ].join(',')
      );
      if (hasOpenLayer) return;

      const body = document.body;
      if (body.style.pointerEvents === 'none') {
        body.style.pointerEvents = '';
      }
      if (body.style.overflow === 'hidden') {
        body.style.overflow = '';
      }
      if (body.hasAttribute('data-scroll-locked')) {
        body.removeAttribute('data-scroll-locked');
      }
    }, 0);

    return () => window.clearTimeout(id);
  }, [location.pathname, location.search]);

  return null;
}
