'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A name that opens a small profile card (details + "Open in Discord/Telegram").
 * The card is fixed-positioned so it isn't clipped by the scrolling table.
 */
export default function ProfileLink({ name, details, href, hrefLabel }) {
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!pos) return;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && (cardRef.current?.contains(e.target) || buttonRef.current?.contains(e.target))) return;
      setPos(null);
    };
    const closeNow = () => setPos(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', closeNow, true);
    window.addEventListener('resize', closeNow);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', closeNow, true);
      window.removeEventListener('resize', closeNow);
    };
  }, [pos]);

  function toggle() {
    if (pos) return setPos(null);
    const r = buttonRef.current.getBoundingClientRect();
    const width = 288;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={`-mx-2 max-w-52 truncate rounded-md px-2 py-1 text-left text-sm font-medium transition-colors ${
          pos ? 'bg-indigo-100 text-indigo-700' : 'text-zinc-900 hover:bg-indigo-50 hover:text-indigo-700'
        }`}
        aria-expanded={Boolean(pos)}
      >
        {name}
      </button>
      {pos && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label={`${name} details`}
          className="fixed z-50 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <p className="mb-3 truncate text-sm font-semibold text-zinc-900">{name}</p>
          <dl className="space-y-1.5 text-xs">
            {details
              .filter(([, value]) => value !== null && value !== undefined && value !== '')
              .map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-zinc-500">{label}</dt>
                  <dd className="truncate text-right font-medium text-zinc-800">{value}</dd>
                </div>
              ))}
          </dl>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex h-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {hrefLabel} ↗
            </a>
          )}
        </div>
      )}
    </>
  );
}
