'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { Checkbox, Label } from '../ui/Field';

/** Resolve or ignore an incident with an optional note, optionally for all similar open ones. */
export default function IncidentReviewModal({ incident, action, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [similar, setSimilar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const verb = action === 'resolved' ? 'Resolve' : 'Ignore';

  async function save() {
    setSaving(true);
    setError('');
    const res = await fetch('/api/admin/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: incident.id, status: action, note, applyToSimilar: similar }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSaving(false);
    if (!res?.ok) return setError(data?.error ?? 'Could not save.');
    onDone(data.updated);
  }

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      title={`${verb} incident`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {verb}
            {similar && incident.similar_open ? ` ${incident.similar_open + 1}` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="error">{error}</Alert>
        <p className="text-sm text-zinc-600">
          {action === 'resolved' ? 'Mark this as fixed.' : 'Hide this from the open list without fixing it.'} It moves to{' '}
          <b>{action === 'resolved' ? 'Resolved' : 'Ignored'}</b>, and you can reopen it later.
        </p>
        <div>
          <Label htmlFor="incident-note" hint="Optional. Saved with the incident so other admins see what was done.">
            Note
          </Label>
          <textarea
            id="incident-note"
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={action === 'resolved' ? 'e.g. Reset the Discord bot token' : 'e.g. User blocked the bot, nothing to do'}
            className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-300 ring-inset placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-600 focus:outline-hidden focus:ring-inset"
          />
        </div>
        {incident.similar_open > 0 && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg p-3 ring-1 ring-zinc-200 ring-inset">
            <Checkbox checked={similar} onChange={(e) => setSimilar(e.target.checked)} className="mt-0.5" />
            <span className="text-sm text-zinc-700">
              Also {verb.toLowerCase()} {incident.similar_open} similar open incident{incident.similar_open === 1 ? '' : 's'}
              <span className="block text-xs text-zinc-500">Same type{incident.telegram_id ? ' and same user' : ''}.</span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
