'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Icon from './Icon';

/*
 * Toast notifications. Call `toast.success(text)` / `toast.error(text)` / `toast.info(text)`
 * from any client component; <Toaster /> (mounted once in AdminShell) shows them.
 */
let toasts = [];
let nextId = 1;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

// How long each tone stays up. Errors stay longer, since they often need reading.
const DURATION = { success: 4000, info: 5000, error: 9000 };

function push(tone, text) {
  if (!text) return;
  const id = nextId++;
  toasts = [...toasts, { id, tone, text }].slice(-4);
  emit();
  setTimeout(() => dismiss(id), DURATION[tone] ?? 5000);
}

function dismiss(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (text) => push('success', text),
  error: (text) => push('error', text),
  info: (text) => push('info', text),
};

/**
 * Drop-in for the old `[notice, setNotice]` pattern: `notify({ tone, text })` shows a toast.
 * `notify(null)` is a no-op, so existing "clear the notice" calls keep working.
 */
export const notify = (n) => n && push(n.tone ?? 'info', n.text);

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY = [];

const STYLE = {
  success: { icon: 'check', color: 'text-green-600' },
  error: { icon: 'alert', color: 'text-red-600' },
  info: { icon: 'bell', color: 'text-indigo-600' },
};

function ToastItem({ t }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const s = STYLE[t.tone] ?? STYLE.info;
  return (
    <div
      role={t.tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-3 shadow-lg transition-all duration-200 ${
        shown ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      <Icon name={s.icon} className={`mt-0.5 size-4 shrink-0 ${s.color}`} />
      <p className="min-w-0 flex-1 text-sm break-words text-zinc-800">{t.text}</p>
      <button type="button" onClick={() => dismiss(t.id)} className="-mr-1 shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Dismiss">
        <Icon name="x" className="size-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  return (
    <div aria-live="polite" className="pointer-events-none fixed top-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {list.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
