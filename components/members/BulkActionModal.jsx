'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input, Label } from '../ui/Field';

const PLACE = { discord: 'the Discord server', telegram: 'the Telegram channel' };

const copyFor = (action, platform) => {
  const place = PLACE[platform] ?? 'the community';
  return {
    kick: {
      title: 'Kick members',
      body: `They’ll be removed from ${place} and told on Telegram. They can rejoin by verifying their broker account again in the bot, as long as they meet the join requirements.`,
      confirm: 'Kick',
      variant: 'danger',
    },
    ban: {
      title: 'Ban members',
      body: `They’ll be removed from ${place} and can’t rejoin until you allow them again.`,
      confirm: 'Ban',
      variant: 'danger',
    },
    allow: {
      title: 'Allow to rejoin',
      body: 'Lifts the ban so they can verify again in the Telegram bot and rejoin.',
      confirm: 'Allow rejoin',
      variant: 'primary',
    },
  }[action];
};

export default function BulkActionModal({ platform = 'discord', action, count, onClose, onConfirm, defaultReason = '', progress = null, bodyOverride }) {
  const [reason, setReason] = useState(defaultReason);
  const [loading, setLoading] = useState(false);
  const base = copyFor(action, platform);
  const copy = base && bodyOverride ? { ...base, body: bodyOverride } : base;
  if (!copy) return null;

  async function confirm() {
    setLoading(true);
    await onConfirm(reason);
    setLoading(false);
    setReason('');
  }

  return (
    <Modal
      open
      onClose={loading ? undefined : onClose}
      title={`${copy.title} (${count})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={copy.variant} onClick={confirm} loading={loading}>
            {copy.confirm} {count}
          </Button>
        </>
      }
    >
      <p className="text-sm text-zinc-600">{copy.body}</p>
      {progress && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">
            {progress.done} of {progress.total} processed…
          </p>
        </div>
      )}
      {action !== 'allow' && (
        <div className="mt-4">
          <Label htmlFor="reason" hint="Saved, sent to kicked members on Telegram, and shown in Discord's audit log.">
            Reason (optional)
          </Label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Low trading activity" maxLength={255} />
        </div>
      )}
    </Modal>
  );
}
