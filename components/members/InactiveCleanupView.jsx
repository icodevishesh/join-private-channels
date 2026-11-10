'use client';

import { useState } from 'react';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import { notify } from '../ui/Toast';
import PageHeader from '../ui/PageHeader';
import { Input, Toggle } from '../ui/Field';
import Icon from '../ui/Icon';
import InactiveMembersTable from './InactiveMembersTable';
import BulkActionModal from './BulkActionModal';
import { runBulkAction } from './runBulkAction';
import ProgressBar from '../ui/ProgressBar';
import Spinner from '../ui/Spinner';
import { formatDate } from '@/lib/format';
import { useAdmin } from '../layout/AdminContext';
import { BROKERS } from '@/lib/brokers';

const PRESETS = [7, 14, 30, 60, 90];
// XM returns at most a year of trades.
const MAX_DAYS = { elefin: 3650, xm: 365 };

function Stat({ label, value, hint, tone = 'zinc' }) {
  const color = { zinc: 'text-zinc-900', amber: 'text-amber-600', green: 'text-green-600' }[tone];
  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export default function InactiveCleanupView({ brokers = ['elefin'] }) {
  const { can } = useAdmin();
  const [broker, setBroker] = useState(brokers[0]);
  const [days, setDays] = useState('30');
  const [includeMissing, setIncludeMissing] = useState(false);
  const [includeLowBalance, setIncludeLowBalance] = useState(false);
  const label = BROKERS[broker].label;
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [action, setAction] = useState(null);
  const [progress, setProgress] = useState(null);

  async function find(e) {
    e.preventDefault();
    setSearching(true);
    const res = await fetch('/api/admin/members/inactive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broker, days: Number(days), includeMissing, includeLowBalance }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSearching(false);
    if (res?.status === 401) return window.location.assign('/admin/login');
    if (!res?.ok) return notify({ tone: 'error', text: data?.error ?? 'Search failed.' });

    setResult({ ...data, days: Number(days) });
    setSelected(new Set(data.members.map((m) => m.key)));
  }

  function switchBroker(id) {
    if (id === broker || searching || progress) return;
    setBroker(id);
    setResult(null);
    setSelected(new Set());
    if (Number(days) > MAX_DAYS[id]) setDays(String(MAX_DAYS[id]));
  }

  // Kick each selected person from everywhere they are: the Discord server and/or the Telegram channel.
  async function confirm(reason) {
    const people = result.members.filter((m) => selected.has(m.key));
    const discordIds = people.filter((m) => m.discord_user_id).map((m) => String(m.discord_user_id));
    const telegramIds = people.filter((m) => m.in_channel && m.telegram_id).map((m) => String(m.telegram_id));
    const total = discordIds.length + telegramIds.length;
    setProgress({ done: 0, total });

    const discord = await runBulkAction({ platform: 'discord', action: 'kick', ids: discordIds, reason, source: 'cleanup', onProgress: (n) => setProgress({ done: n, total }) });
    const telegram = await runBulkAction({
      platform: 'telegram',
      action: 'kick',
      ids: telegramIds,
      reason,
      source: 'cleanup',
      onProgress: (n) => setProgress({ done: discordIds.length + n, total }),
    });
    setProgress(null);
    setAction(null);

    const failed = [...discord.failed.map((f) => ({ ...f, where: 'Discord' })), ...telegram.failed.map((f) => ({ ...f, where: 'Telegram' }))];
    const stopped = discord.error || telegram.error;
    if (stopped) notify({ tone: 'error', text: `Stopped early: ${stopped}` });
    else if (failed.length) notify({ tone: 'error', text: `${failed.length} removal(s) failed: ${failed.map((f) => `${f.where} ${f.id} (${f.error})`).join('; ')}` });
    else notify({ tone: 'success', text: `${people.length} member(s) kicked.` });

    // Drop people who were removed everywhere they were.
    const failedIds = new Set(failed.map((f) => String(f.id)));
    const done = (m) => !stopped && !failedIds.has(String(m.discord_user_id)) && !failedIds.has(String(m.telegram_id));
    const removed = new Set(people.filter(done).map((m) => m.key));
    setResult((res) => ({ ...res, members: res.members.filter((m) => !removed.has(m.key)) }));
    setSelected(new Set());
  }

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Inactivity cleanup"
        description="Find people who stopped trading and remove them from the Discord server and Telegram channel in one go."
      />


      {brokers.length > 1 && (
        <div className="mb-3 inline-flex rounded-lg bg-zinc-100 p-1" role="tablist" aria-label="Broker">
          {brokers.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === broker}
              onClick={() => switchBroker(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                id === broker ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {BROKERS[id].label}
            </button>
          ))}
        </div>
      )}

      <Card>
        <form onSubmit={find} className="flex flex-col gap-3 px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
          <span className="text-sm font-medium whitespace-nowrap text-zinc-700">No trades in the last</span>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick periods */}
            <div className="inline-flex rounded-md bg-zinc-100 p-0.5" role="group" aria-label="Quick periods">
              {PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(String(d))}
                  aria-pressed={Number(days) === d}
                  className={`rounded px-2.5 py-1 text-[13px] font-medium tabular-nums transition-colors ${
                    Number(days) === d ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>

            {/* Exact number of days */}
            <div className="flex h-9 items-center rounded-md bg-white ring-1 ring-zinc-300 ring-inset focus-within:ring-2 focus-within:ring-indigo-600">
              <input
                id="days"
                type="number"
                min="1"
                max={MAX_DAYS[broker]}
                step="1"
                required
                value={days}
                onChange={(e) => setDays(e.target.value)}
                aria-label="Days without a trade"
                className="h-full w-14 bg-transparent pl-3 text-sm font-medium text-zinc-900 tabular-nums outline-hidden [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="pr-3 text-sm text-zinc-500">days</span>
            </div>
          </div>

          <span className="hidden h-6 w-px bg-zinc-200 lg:block" aria-hidden="true" />

          {broker === 'xm' ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700" title="XM’s balance indicator: below the threshold agreed with XM.">
              <Toggle checked={includeLowBalance} onChange={setIncludeLowBalance} label="Also include low balance" />
              Also include low balance
            </label>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700" title="Their Elefin account was closed or is no longer under your partner link.">
              <Toggle checked={includeMissing} onChange={setIncludeMissing} label="Include people no longer in Elefin" />
              Include people no longer in Elefin
            </label>
          )}

          <Button type="submit" loading={searching} className="lg:ml-auto">
            {!searching && <Icon name="search" className="size-4" />}
            {searching ? `Checking ${label}…` : 'Find inactive'}
          </Button>
        </form>

        <div className="rounded-b-lg border-t border-zinc-100 bg-zinc-50/60 px-4 py-2 sm:px-5">
          {searching ? (
            <>
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <Spinner size="sm" />
                {broker === 'xm'
                  ? 'Asking XM for the trades of every XM member. This can take up to a minute.'
                  : 'Downloading every Elefin client and checking activity. This can take up to a minute.'}
              </div>
              <ProgressBar className="mt-2 h-1 rounded-full bg-zinc-200" />
            </>
          ) : (
            <p className="text-xs text-zinc-500">
              {broker === 'xm'
                ? `Checks everyone who joined with an XM account against XM’s trade history (up to ${MAX_DAYS.xm} days). Nobody is removed until you confirm.`
                : 'Checks everyone who joined with Elefin against the live Elefin client list. Nobody is removed until you confirm.'}
            </p>
          )}
        </div>
      </Card>

      {!result && !searching && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-zinc-300 px-4 py-4 sm:px-5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500">
            <Icon name="userX" className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-800">No search yet</p>
            <p className="text-[13px] text-zinc-500">Pick a period and click “Find inactive”. You’ll review the list before anyone is kicked.</p>
          </div>
        </div>
      )}

      {result && (
        <Card className="mt-4">
          <CardHeader
            title="Results"
            description={`${label} members with no trades in the last ${result.days} days${result.broker === 'xm' && includeLowBalance ? ', or a low balance' : ''} (never-traded people included).`}
            actions={
              result.members.length > 0 &&
              can('cleanup.run') && (
                <Button size="sm" variant="danger" disabled={!selected.size} onClick={() => setAction('kick')}>
                  Kick {selected.size} selected
                </Button>
              )
            }
          />

          <div className="grid grid-cols-1 divide-y divide-zinc-100 border-b border-zinc-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Stat label="Inactive" value={result.members.length} tone={result.members.length ? 'amber' : 'green'} hint={`out of ${result.linkedMembers} checked`} />
            <Stat label="Selected to kick" value={selected.size} hint="Untick anyone you want to keep" />
            {result.broker === 'xm' ? (
              <Stat label="XM data" value={result.linkedMembers.toLocaleString('en-US')} hint={`accounts, checked ${formatDate(result.checkedAt)} UTC`} />
            ) : (
              <Stat
                label="Elefin data"
                value={result.clientsSynced.toLocaleString('en-US')}
                hint={`clients, downloaded ${formatDate(result.syncedAt)} UTC`}
              />
            )}
          </div>

          {result.members.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-2xl">🎉</p>
              <p className="mt-2 text-sm font-medium text-zinc-700">
                {result.linkedMembers === 0 ? 'Nobody to check yet' : 'Everyone is active'}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {result.linkedMembers === 0
                  ? `People appear here once they verify with ${label} and join the Discord server or Telegram channel through the bot.`
                  : `Everyone who joined with ${label} has traded in the last ${result.days} days.`}
              </p>
            </div>
          ) : (
            <InactiveMembersTable
              rows={result.members}
              broker={result.broker}
              selected={selected}
              onToggle={toggle}
              onToggleAll={(all) => setSelected(all ? new Set(result.members.map((m) => m.key)) : new Set())}
            />
          )}
        </Card>
      )}

      {action && (
        <BulkActionModal
          action={action}
          count={selected.size}
          defaultReason={`No trades in the last ${result.days} days`}
          bodyOverride={`They’ll be removed from the Discord server and/or the Telegram channel (wherever they are) and told on Telegram. They can rejoin by verifying their ${label} account again, as long as they meet the join requirements.`}
          progress={progress}
          onClose={() => !progress && setAction(null)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}
