import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Reset window scroll on route changes. React Router does not scroll to top
 * automatically when navigating between pages in an SPA.
 *
 * Skips when the URL has a hash so landing-page anchors and legal section
 * links can scroll to their target instead.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [pathname, hash]);

  return null;
}
