'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import { AdminProvider } from './AdminContext';
import Icon from '../ui/Icon';
import { Toaster } from '../ui/Toast';

export default function AdminShell({ admin, badges, children }) {
  const [open, setOpen] = useState(false);

  return (
    <AdminProvider admin={admin}>
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-zinc-200 lg:block">
        <Sidebar badges={badges} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl">
            <Sidebar badges={badges} onNavigate={() => setOpen(false)} />
          </aside>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 rounded-lg bg-white p-2 text-zinc-600"
            aria-label="Close menu"
          >
            <Icon name="x" />
          </button>
        </div>
      )}

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-zinc-200 bg-white px-4 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="-ml-1 rounded-lg p-2 text-zinc-600 hover:bg-zinc-100" aria-label="Open menu">
          <Icon name="menu" className="size-5" />
        </button>
        <span className="text-sm font-semibold">Spaceship</span>
      </header>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</div>
      </main>
      <Toaster />
    </div>
    </AdminProvider>
  );
}
