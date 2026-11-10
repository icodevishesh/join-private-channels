'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon';

const OPTIONS = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
];

function apply(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** Theme dropdown (Light / Dark / System), remembered in this browser. Opens upwards. */
export default function ThemeSwitch() {
  const [theme, setTheme] = useState('system');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = OPTIONS.find((o) => o.id === theme) ?? OPTIONS[2];

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (OPTIONS.some((o) => o.id === saved)) setTheme(saved);
    } catch {}
  }, []);

  // Follow the operating system while "System" is selected.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(next) {
    setTheme(next);
    setOpen(false);
    try {
      localStorage.setItem('theme', next);
    } catch {}
    apply(next);
  }

  return (
    <div ref={rootRef} className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      >
        <Icon name={current.icon} className="size-4" />
        <span className="flex-1 text-left">Theme: {current.label}</span>
        <Icon name="chevronUpDown" className="size-4 text-zinc-400" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Theme"
          className="absolute right-0 bottom-full left-0 z-40 mb-1 overflow-hidden rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
        >
          {OPTIONS.map((o) => {
            const selected = o.id === theme;
            return (
              <li key={o.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => choose(o.id)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    selected ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  <Icon name={o.icon} className="size-4" />
                  <span className="flex-1 text-left">{o.label}</span>
                  {selected && <Icon name="check" className="size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
