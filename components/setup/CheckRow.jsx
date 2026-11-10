'use client';

import { useState } from 'react';
import Button from '../ui/Button';
import { settingsPageFor } from '../settings/settingsMeta';
import { useAdmin } from '../layout/AdminContext';

const DOT = {
  ok: { icon: '✓', className: 'bg-green-100 text-green-700', label: 'OK' },
  warn: { icon: '!', className: 'bg-amber-100 text-amber-800', label: 'Warning' },
  error: { icon: '✕', className: 'bg-red-100 text-red-700', label: 'Needs attention' },
  off: { icon: '–', className: 'bg-zinc-100 text-zinc-500', label: 'Off' },
};

const linkClass =
  'inline-flex h-8 shrink-0 items-center rounded-lg bg-white px-3 text-sm font-medium whitespace-nowrap text-zinc-700 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50';
const primaryLinkClass =
  'inline-flex h-8 shrink-0 items-center rounded-lg bg-indigo-600 px-3 text-sm font-medium whitespace-nowrap text-white hover:bg-indigo-700';

export default function CheckRow({ check, onAction, busy }) {
  const { can } = useAdmin();
  const [copied, setCopied] = useState(false);
  const dot = DOT[check.status] ?? DOT.warn;
  const needsFix = check.status !== 'ok';

  // "Use this address" saves the HTTPS address the admin is browsing on (e.g. the ngrok URL).
  // Only offered when it differs from the saved one.
  // Copy buttons are always fine; anything that changes setup needs the Discord permission.
  let action = check.action && (check.action.type === 'copy' || can('discord.edit')) ? check.action : null;
  if (action?.type === 'use_current_url') {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    action = origin.startsWith('https://') && origin !== check.value ? { ...action, label: `Use ${new URL(origin).host}` } : null;
  }

  async function copy(value) {
    await navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-6">
      <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${dot.className}`} title={dot.label} aria-label={dot.label}>
        {dot.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900">{check.label}</p>
        <p className="mt-0.5 text-sm break-words text-zinc-600">{check.detail}</p>
        {check.value && needsFix && (
          <code className="mt-1.5 block rounded bg-zinc-100 px-2 py-1 font-mono text-xs break-all text-zinc-800">{check.value}</code>
        )}
        {check.extra && <p className="mt-0.5 text-xs text-zinc-500">{check.extra}</p>}
      </div>
      {(action || check.link || (check.fix && needsFix)) && (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {check.fix && needsFix && (
            // Full page load so the settings page can scroll to and highlight the field.
            <a href={`${settingsPageFor(check.fix)}#${check.fix}`} className={primaryLinkClass}>
              {check.fixLabel ?? (check.status === 'error' ? 'Fix now' : 'Set now')} →
            </a>
          )}
          {action?.type === 'copy' && (
            <Button size="sm" variant="secondary" onClick={() => copy(action.value)}>
              {copied ? 'Copied ✓' : action.label}
            </Button>
          )}
          {action && action.type !== 'copy' && (
            <Button size="sm" onClick={() => onAction(action.type)} loading={busy === action.type}>
              {action.label}
            </Button>
          )}
          {check.link && (
            <a href={check.link.href} target="_blank" rel="noreferrer" className={linkClass}>
              {check.link.label} ↗
            </a>
          )}
        </div>
      )}
    </li>
  );
}
