'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { Checkbox, Input, Label } from '../ui/Field';
import { PERMISSIONS, ROLES } from '@/lib/permissions';
import { useAdmin } from '../layout/AdminContext';

/** Create a new admin, or edit an existing one's role, permissions and password. */
export default function AdminFormModal({ admin, onClose, onSaved }) {
  const { admin: me } = useAdmin();
  const editing = Boolean(admin);
  // Editing yourself: only your password. Another super admin changes your role.
  const self = editing && admin.id === me?.id;
  const [username, setUsername] = useState(admin?.username ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(admin?.role ?? 'readonly');
  const [permissions, setPermissions] = useState(new Set(admin?.permissions ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const togglePermission = (id) =>
    setPermissions((p) => {
      const next = new Set(p);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function save() {
    if (self && !password) return setError('Type a new password, or cancel.');
    setSaving(true);
    setError('');
    const body = self ? { password } : { role, permissions: [...permissions], ...(password ? { password } : {}) };
    const res = await fetch(editing ? `/api/admin/admins/${admin.id}` : '/api/admin/admins', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? body : { ...body, username, password }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSaving(false);
    if (!res?.ok) return setError(data?.error ?? 'Could not save.');
    onSaved(self ? 'Your password was changed. Other devices were signed out.' : editing ? `Saved ${admin.username}.` : `Created ${username}.`);
  }

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      title={self ? 'Change your password' : editing ? `Edit ${admin.username}` : 'Add admin'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {self ? 'Change password' : editing ? 'Save' : 'Create admin'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="error">{error}</Alert>
        {!editing && (
          <div>
            <Label htmlFor="admin-username" hint="3–32 characters: letters, numbers, dot, dash or underscore.">
              Username
            </Label>
            <Input id="admin-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoFocus />
          </div>
        )}
        <div>
          <Label
            htmlFor="admin-password"
            hint={
              self
                ? 'At least 8 characters. You stay signed in here; other devices are signed out.'
                : editing
                  ? 'Leave empty to keep the current password. Changing it signs them out.'
                  : 'At least 8 characters.'
            }
          >
            {editing ? 'New password' : 'Password'}
          </Label>
          <Input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>

        {self ? (
          <p className="rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600 ring-1 ring-zinc-200 ring-inset">
            You’re a <b>{ROLES[admin.role]?.label}</b>. You can’t change your own role or permissions; another super admin can.
          </p>
        ) : (
        <>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-zinc-700">Role</legend>
          <div className="space-y-2">
            {Object.entries(ROLES).map(([id, r]) => (
              <label
                key={id}
                className={`flex cursor-pointer gap-3 rounded-lg p-3 ring-1 ring-inset ${role === id ? 'bg-indigo-50 ring-indigo-300' : 'ring-zinc-200 hover:bg-zinc-50'}`}
              >
                <input type="radio" name="role" value={id} checked={role === id} onChange={() => setRole(id)} className="mt-0.5 accent-indigo-600" />
                <span>
                  <span className="block text-sm font-medium text-zinc-900">{r.label}</span>
                  <span className="block text-xs text-zinc-500">{r.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {role === 'custom' && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-zinc-700">Allowed to</legend>
            <div className="space-y-2 rounded-lg p-3 ring-1 ring-zinc-200 ring-inset">
              {PERMISSIONS.map((p) => (
                <label key={p.id} className="flex cursor-pointer gap-3">
                  <Checkbox checked={permissions.has(p.id)} onChange={() => togglePermission(p.id)} className="mt-0.5" />
                  <span>
                    <span className="block text-sm text-zinc-900">{p.label}</span>
                    <span className="block text-xs text-zinc-500">{p.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        </>
        )}
      </div>
    </Modal>
  );
}
