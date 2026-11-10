'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Alert from '../ui/Alert';
import { useAdmin } from '../layout/AdminContext';

const linkClass =
  'inline-flex h-9 items-center rounded-lg bg-indigo-600 px-3.5 text-sm font-medium whitespace-nowrap text-white hover:bg-indigo-700';

/** Step-by-step connect card: add the bot to a channel, then pick it with one click. */
export default function DetectedChannels({ chats, currentId, addUrl, botUsername }) {
  const { can } = useAdmin();
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  async function useChannel(chatId) {
    setBusy(chatId);
    setError('');
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { telegram_channel_id: chatId, telegram_channel_enabled: '1' } }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError((await res?.json().catch(() => null))?.error ?? 'Could not save.');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader title="Connect your channel" description="Three steps, no IDs to copy." />
      <ol className="space-y-4 px-4 py-4 text-sm text-zinc-700 sm:px-6">
        <li>
          <p className="font-medium text-zinc-900">1. Create a private channel in Telegram</p>
          <p className="mt-0.5 text-zinc-500">Or use an existing one. It must be private (no public @username), otherwise anyone can join without the bot.</p>
        </li>
        <li>
          <p className="font-medium text-zinc-900">2. Add {botUsername ? `@${botUsername}` : 'the bot'} as an admin</p>
          <p className="mt-0.5 mb-2 text-zinc-500">
            The button opens Telegram with the right permissions already ticked: <b>Invite users via link</b> and <b>Ban users</b>.
          </p>
          {addUrl ? (
            <a href={addUrl} target="_blank" rel="noreferrer" className={linkClass}>
              Add bot to your channel ↗
            </a>
          ) : (
            <p className="text-amber-700">The Telegram bot isn’t reachable right now, so the button can’t be shown.</p>
          )}
        </li>
        <li>
          <p className="font-medium text-zinc-900">3. Pick it below</p>
          <p className="mt-0.5 text-zinc-500">Channels show up here as soon as the bot is made an admin. Refresh this page if yours isn’t listed yet.</p>
        </li>
      </ol>

      {error && (
        <div className="px-4 pb-4 sm:px-6">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <ul className="divide-y divide-zinc-100 border-t border-zinc-200">
        {chats.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-500 sm:px-6">No channels yet. Do step 2, then refresh.</li>}
        {chats.map((c) => {
          const current = String(c.chat_id) === String(currentId);
          return (
            <li key={c.chat_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                  {c.title || 'Untitled'}
                  <Badge tone="zinc">{c.type}</Badge>
                  {c.username && <Badge tone="amber">public @{c.username}</Badge>}
                  {current && <Badge tone="green">In use</Badge>}
                </p>
                <p className="font-mono text-xs text-zinc-500">{c.chat_id}</p>
              </div>
              {!current && can('telegram.edit') && (
                <Button size="sm" variant="secondary" loading={busy === c.chat_id} onClick={() => useChannel(c.chat_id)}>
                  Use this channel
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
