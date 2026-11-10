'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { notify } from '../ui/Toast';
import PageHeader from '../ui/PageHeader';
import CheckRow from './CheckRow';
import ProgressBar from '../ui/ProgressBar';
import { LoadingBlock } from '../ui/Spinner';
import { formatDate } from '@/lib/format';

export default function SetupView() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/setup', { cache: 'no-store' }).catch(() => null);
    if (res?.status === 401) return window.location.assign('/admin/login');
    if (res?.ok) setStatus(await res.json());
    else notify({ tone: 'error', text: 'Could not run the checks.' });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(type) {
    setBusy(type);
    let res;
    let message;
    if (type === 'use_current_url') {
      // One click: save the address this page is open on as the public URL.
      const origin = window.location.origin;
      res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { public_url: origin } }),
      }).catch(() => null);
      message = `Public URL saved as ${origin}. Register the new redirect URL below on Discord if it isn’t already.`;
    } else {
      res = await fetch('/api/admin/setup/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      }).catch(() => null);
    }
    const data = await res?.json().catch(() => null);
    setBusy(null);
    notify(res?.ok ? { tone: 'success', text: message ?? data.message } : { tone: 'error', text: data?.error ?? 'Action failed.' });
    load();
  }

  const s = status?.summary;

  return (
    <>
      <PageHeader
        title="Setup & status"
        description="Checks every connection the bot needs, live. Fix anything marked red, then refresh."
        actions={
          <Button variant="soft" onClick={load} loading={loading}>
            {loading ? 'Checking…' : 'Refresh checks'}
          </Button>
        }
      />


      {s && (
        <div className="mb-6">
          <Alert tone={s.error ? 'error' : 'success'}>
            {s.error
              ? `${s.error} item${s.error === 1 ? '' : 's'} need${s.error === 1 ? 's' : ''} attention · ${s.warn} warning${s.warn === 1 ? '' : 's'} · ${s.ok} OK`
              : `Everything required is working${s.warn ? ` (${s.warn} warning${s.warn === 1 ? '' : 's'})` : ''}.`}
            <span className="ml-1 opacity-70">Checked {formatDate(status.checkedAt)} UTC.</span>
          </Alert>
        </div>
      )}

      {/* Top bar while checks run (first load and refresh). */}
      <ProgressBar active={loading} className="fixed top-0 right-0 left-0 z-50 h-1" />

      {!status && loading && (
        <Card>
          <LoadingBlock label="Running checks: database, Telegram, brokers, Discord… this takes a few seconds." />
        </Card>
      )}

      <div className={`space-y-4 transition-opacity ${loading && status ? 'pointer-events-none opacity-50' : ''}`}>
        {status?.groups.map((group) => (
          <Card key={group.id}>
            <CardHeader title={group.title} />
            <ul className="divide-y divide-zinc-100">
              {group.checks.map((check) => (
                <CheckRow key={check.id} check={check} onAction={runAction} busy={busy} />
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
