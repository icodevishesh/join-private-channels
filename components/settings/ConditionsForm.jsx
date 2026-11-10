'use client';

import { useState } from 'react';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import { Input, Toggle } from '../ui/Field';
import { useSaveSettings } from './useSaveSettings';
import { useAdmin } from '../layout/AdminContext';

// Plain-language text for each requirement type.
const COPY = {
  min_deposit: {
    title: 'Min deposit',
    help: 'Total amount the client has ever deposited into their Elefin account.',
    before: 'Deposited at least',
    unit: 'USD',
  },
  min_balance: {
    title: 'Min balance',
    help: 'Current balance across all of the client’s trading accounts.',
    before: 'Balance of at least',
    unit: 'USD',
  },
  min_lots: {
    title: 'Min lots',
    help: 'Total lots the client has traded.',
    before: 'Traded at least',
    unit: 'lots',
  },
  min_trades: {
    title: 'Min trades',
    help: 'Total trades the client has placed.',
    before: 'Placed at least',
    unit: 'trades',
  },
  last_trade_within_days: {
    title: 'Last trade within',
    help: 'The client’s most recent trade must be this recent.',
    before: 'Traded within the last',
    unit: 'days',
  },
};

/** `stacked` puts each value under its requirement (for narrow, side-by-side cards). */
export default function ConditionsForm({ initial, stacked = false }) {
  const { can } = useAdmin();
  const canEdit = can('brokers.edit');
  const [conditions, setConditions] = useState(initial.map((c) => ({ ...c, is_active: Boolean(c.is_active), threshold: String(Number(c.threshold)) })));
  const { save, saving } = useSaveSettings();
  const activeCount = conditions.filter((c) => c.is_active).length;

  const update = (id, patch) => setConditions((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  async function onSubmit(e) {
    e.preventDefault();
    await save({ conditions: conditions.map(({ id, threshold, is_active }) => ({ id, threshold, is_active })) });
  }

  return (
    <Card id="section-conditions">
      <CardHeader
        title="Elefin join requirements"
        description={
          activeCount
            ? `Elefin clients must meet all ${activeCount} active requirement${activeCount === 1 ? '' : 's'} to join.`
            : 'No requirements are on, so every Elefin client under your partner link can join.'
        }
      />
      <form onSubmit={onSubmit}>
        <fieldset disabled={!canEdit}>
        <ul className="divide-y divide-zinc-100">
          {conditions.map((c) => {
            const copy = COPY[c.condition_key] ?? { title: c.condition_key, help: c.label, before: 'Value', unit: '' };
            return (
              <li key={c.id} className={stacked ? 'flex flex-col gap-2.5 px-4 py-3.5 sm:px-5' : 'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6'}>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="pt-0.5">
                    <Toggle checked={c.is_active} onChange={(v) => update(c.id, { is_active: v })} label={`Turn ${copy.title} ${c.is_active ? 'off' : 'on'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${c.is_active ? 'text-zinc-900' : 'text-zinc-500'}`}>{copy.title}</p>
                    <p className="text-sm text-zinc-500">{copy.help}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-2 ${stacked ? 'pl-12' : 'pl-14 sm:pl-0'} ${c.is_active ? '' : 'opacity-50'}`}>
                  <span className="text-sm whitespace-nowrap text-zinc-600">{copy.before}</span>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={c.threshold}
                    onChange={(e) => update(c.id, { threshold: e.target.value })}
                    aria-label={`${copy.title} value`}
                    disabled={!c.is_active}
                    className="w-28 text-right"
                  />
                  <span className="w-12 text-sm text-zinc-600">{copy.unit}</span>
                </div>
              </li>
            );
          })}
        </ul>
        </fieldset>
        <div className="flex items-center justify-end border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 sm:px-5">
          {canEdit ? (
            <Button type="submit" loading={saving}>
              Save requirements
            </Button>
          ) : (
            <p className="text-sm text-zinc-500">Read-only for your account.</p>
          )}
        </div>
      </form>
    </Card>
  );
}
