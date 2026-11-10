'use client';

import { useState } from 'react';
import { toast } from '../ui/Toast';

/** Shared save logic for the settings forms. Success and errors show as toasts. */
export function useSaveSettings() {
  const [saving, setSaving] = useState(false);

  async function save(payload) {
    setSaving(true);
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSaving(false);
    if (res?.status === 401) window.location.assign('/admin/login');
    if (!res?.ok) {
      toast.error(data?.error ?? 'Could not save.');
      return null;
    }
    toast.success('Changes saved. They apply immediately.');
    return data;
  }

  return { save, saving };
}
