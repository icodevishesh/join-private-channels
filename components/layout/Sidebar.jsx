'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAdmin } from './AdminContext';
import ThemeSwitch from './ThemeSwitch';
import { ROLES } from '@/lib/permissions';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/members', label: 'Members', icon: 'users' },
  { href: '/admin/incidents', label: 'Incidents', icon: 'alert' },
  { href: '/admin/cleanup', label: 'Inactivity cleanup', icon: 'userX' },
  { href: '/admin/brokers', label: 'Brokers', icon: 'landmark' },
  { href: '/admin/settings', label: 'Settings', icon: 'settings' },
  { href: '/admin/discord', label: 'Discord Server', icon: 'plug' },
  { href: '/admin/telegram', label: 'Telegram Channel', icon: 'send' },
  { href: '/admin/setup', label: 'Setup & status', icon: 'shieldCheck' },
  { href: '/admin/admins', label: 'Admins', icon: 'key', permission: 'admins.manage' },
];

export default function Sidebar({ onNavigate, badges = {} }) {
  const pathname = usePathname();
  const { admin, can } = useAdmin();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const logoutForm = useRef(null);
  const isActive = (href) => (href === '/admin' ? pathname === href : pathname.startsWith(href));

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-14 items-center gap-2.5 border-b border-zinc-200 px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-indigo-600 text-white">
          <Icon name="bot" className="size-4.5" />
        </span>
        <span className="text-sm font-semibold text-zinc-900">Spaceship</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
        {NAV.filter((item) => !item.permission || can(item.permission)).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
              isActive(item.href) ? 'bg-indigo-50 text-indigo-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
          >
            <Icon name={item.icon} className="size-4" />
            <span className="flex-1">{item.label}</span>
            {badges[item.href] > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 tabular-nums">{badges[item.href]}</span>
            )}
          </Link>
        ))}
      </nav>

      <div className="border-t border-zinc-200 p-2.5">
        <ThemeSwitch />
        <p className="px-3 pb-2 text-xs text-zinc-400">
          Powered by{' '}
          <a href="https://partnex.in" target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">
            Partnex
          </a>
        </p>
        {admin && (
          <p className="truncate px-3 pb-2 text-xs text-zinc-500">
            Signed in as <span className="font-medium text-zinc-700">{admin.username}</span> · {ROLES[admin.role]?.label}
          </p>
        )}
        <form ref={logoutForm} action="/api/admin/auth/logout" method="post">
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Icon name="logout" className="size-4.5" />
            Sign out
          </button>
        </form>
      </div>

      <Modal
        open={confirmLogout}
        onClose={signingOut ? undefined : () => setConfirmLogout(false)}
        title="Sign out?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLogout(false)} disabled={signingOut}>
              Cancel
            </Button>
            <Button
              loading={signingOut}
              onClick={() => {
                setSigningOut(true);
                logoutForm.current?.submit();
              }}
            >
              Sign out
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600">You’ll need your username and password to sign in again.</p>
      </Modal>
    </div>
  );
}
