'use client';

import { useEffect } from 'react';

/**
 * When the page is opened with #some_key (e.g. from "Fix now" on the Setup page),
 * scrolls to that field or section, focuses its input and flashes it.
 */
export default function HashHighlighter() {
  useEffect(() => {
    const key = decodeURIComponent(window.location.hash.slice(1));
    if (!key) return;
    const target = document.getElementById(`field-${key}`) ?? document.getElementById(`section-${key}`);
    if (!target) return;

    // Run after the browser's own jump to the #anchor, so the field ends up centred.
    const start = setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.querySelector('input:not([type="checkbox"]), [role="switch"]')?.focus({ preventScroll: true });
      target.classList.add('highlight-flash');
    }, 100);
    const end = setTimeout(() => target.classList.remove('highlight-flash'), 3100);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, []);

  return null;
}
