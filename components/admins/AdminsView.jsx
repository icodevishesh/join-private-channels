'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import Button from '../ui/Button';
import { notify } from '../ui/Toast';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import ProgressBar from '../ui/ProgressBar';
import { LoadingBlock } from '../ui/Spinner';
import AdminFormModal from './AdminFormModal';
import { useAdmin } from '../layout/AdminContext';
import { PERMISSIONS, ROLES } from '@/lib/permissions';
import { formatDate } from '@/lib/format';

const ROLE_TONE = { super: 'indigo', readonly: 'zinc', custom: 'amber' };
const permissionLabel = (id) => PERMISSIONS.find((p) => p.id === id)?.label ?? id;

export default function AdminsView() {
  const { admin: me } = useAdmin();
  const [admins, setAdmins] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // admin object, or 'new'
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/admins', { cache: 'no-store' }).catch(() => null);
    if (res?.status === 401) return window.location.assign('/admin/login');
    const data = await res?.json().catch(() => null);
    if (res?.ok) setAdmins(data.admins);
    else notify({ tone: 'error', text: data?.error ?? 'Could not load admins.' });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDelete() {
    setBusy(true);
    const res = await fetch(`/api/admin/admins/${deleting.id}`, { method: 'DELETE' }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    notify(res?.ok ? { tone: 'success', text: `Deleted ${deleting.username}.` } : { tone: 'error', text: data?.error ?? 'Could not delete.' });
    setDeleting(null);
    load();
  }

  return (
    <>
      <PageHeader
        title="Admins"
        description="Who can sign in to this panel, and what they can do."
        actions={<Button onClick={() => setEditing('new')}>Add admin</Button>}
      />


      <Card>
        <ProgressBar active={loading} />
        {!admins && loading ? (
          <LoadingBlock label="Loading admins…" />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {admins?.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-900">
                    {a.username}
                    <Badge tone={ROLE_TONE[a.role]}>{ROLES[a.role]?.label ?? a.role}</Badge>
                    {a.id === me?.id && <Badge tone="green">You</Badge>}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {a.role === 'custom'
                      ? a.permissions.length
                        ? `Can: ${a.permissions.map(permissionLabel).join(' · ')}`
                        : 'Can only read (no permissions ticked)'
                      : ROLES[a.role]?.description}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">Last sign-in: {a.lastLoginAt ? `${formatDate(a.lastLoginAt)} UTC` : 'never'}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>
                    {a.id === me?.id ? 'Change password' : 'Edit'}
                  </Button>
                  {a.id !== me?.id && (
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDeleting(a)}>
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <AdminFormModal
          admin={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            notify({ tone: 'success', text });
            load();
          }}
        />
      )}

      {deleting && (
        <Modal
          open
          onClose={busy ? undefined : () => setDeleting(null)}
          title={`Delete ${deleting.username}?`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmDelete} loading={busy}>
                Delete admin
              </Button>
            </>
          }
        >
          <p className="text-sm text-zinc-600">They’ll be signed out right away and won’t be able to sign in again.</p>
        </Modal>
      )}
    </>
  );
}
