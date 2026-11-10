'use client';

import Badge from '../ui/Badge';
import { Checkbox } from '../ui/Field';
import { LoadingBlock } from '../ui/Spinner';
import ProfileLink from './ProfileLink';
import TelegramUser from './TelegramUser';
import { formatDate, formatNumber } from '@/lib/format';
import { accountLabel, brokerLabel } from '@/lib/brokers';

const STATUS = {
  member: { label: 'Member', tone: 'green' },
  left: { label: 'Left', tone: 'zinc' },
  kicked: { label: 'Kicked', tone: 'amber' },
  banned: { label: 'Banned', tone: 'red' },
};
const NOT_JOINED = { label: 'Not joined', tone: 'zinc' };

function StatusPill({ status }) {
  const s = STATUS[status] ?? NOT_JOINED;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const th = 'px-3 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-zinc-500 uppercase';

function SortHeader({ label, sortKey, sort, dir, onSort }) {
  const active = sort === sortKey;
  return (
    <th scope="col" className={th}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 uppercase hover:text-zinc-900">
        {label}
        <span className={active ? 'text-zinc-900' : 'text-zinc-300'}>{active && dir === 'asc' ? '↑' : '↓'}</span>
      </button>
    </th>
  );
}

function TelegramCell({ p }) {
  return (
    <TelegramUser
      u={p}
      details={[
        ['Verification', p.verified ? 'Verified' : 'Needs to verify again'],
        ['Verified at', p.verified_at ? `${formatDate(p.verified_at)} UTC` : null],
        ['Channel', STATUS[p.channel_status]?.label ?? 'Not joined'],
        ['Channel joined', p.channel_joined_at ? formatDate(p.channel_joined_at, false) : null],
        ['Channel note', p.channel_reason],
      ]}
    />
  );
}

function DiscordCell({ p }) {
  if (!p.discord_user_id) return <StatusPill status={null} />;
  return (
    <div className="flex items-center gap-2">
      <ProfileLink
        name={p.discord_name || p.discord_username}
        href={`https://discord.com/users/${p.discord_user_id}`}
        hrefLabel="Open in Discord"
        details={[
          ['Discord ID', p.discord_user_id],
          ['Username', p.discord_username ? `@${p.discord_username}` : null],
          ['Status', STATUS[p.discord_status]?.label],
          ['Joined', p.discord_joined_at ? formatDate(p.discord_joined_at, false) : null],
          ['Note', p.discord_reason],
        ]}
      />
      {p.discord_status !== 'member' && <StatusPill status={p.discord_status} />}
    </div>
  );
}

export default function PeopleTable({ rows, places, loading, selected, onToggle, onToggleAll, sort, dir, onSort }) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.person_id));
  const sortProps = { sort, dir, onSort };
  const columns = 5 + (places.discord ? 1 : 0) + (places.channel ? 1 : 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200">
        <thead className="bg-zinc-50">
          <tr>
            <th scope="col" className="w-10 py-2.5 pr-2 pl-4 sm:pl-5">
              <Checkbox checked={allSelected} onChange={() => onToggleAll(!allSelected)} aria-label="Select all on this page" />
            </th>
            <SortHeader label="Telegram user" sortKey="telegram" {...sortProps} />
            {places.discord && <SortHeader label="Discord user" sortKey="discord" {...sortProps} />}
            {places.channel && <th scope="col" className={th}>Telegram channel</th>}
            <SortHeader label="Broker account" sortKey="email" {...sortProps} />
            <SortHeader label="Activity*" sortKey="lots" {...sortProps} />
            <SortHeader label="Verified" sortKey="verified_at" {...sortProps} />
          </tr>
        </thead>
        <tbody className={`divide-y divide-zinc-100 bg-white transition-opacity ${loading && rows.length ? 'opacity-50' : ''}`}>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns} className="px-6 py-12 text-center text-sm text-zinc-500">
                {loading ? <LoadingBlock label="Loading members…" className="py-4" /> : 'No members match these filters.'}
              </td>
            </tr>
          )}
          {rows.map((p) => (
            <tr key={p.person_id} className={selected.has(p.person_id) ? 'bg-indigo-50/50' : 'hover:bg-zinc-50'}>
              <td className="py-2.5 pr-2 pl-4 sm:pl-5">
                <Checkbox checked={selected.has(p.person_id)} onChange={() => onToggle(p.person_id)} aria-label={`Select ${p.telegram_name || p.telegram_id}`} />
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <TelegramCell p={p} />
              </td>
              {places.discord && (
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <DiscordCell p={p} />
                </td>
              )}
              {places.channel && (
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <StatusPill status={p.channel_status} />
                </td>
              )}
              <td className="px-3 py-2.5 text-sm whitespace-nowrap text-zinc-700">
                <p className="flex items-center gap-1.5">
                  {p.broker && <Badge tone={p.broker === 'xm' ? 'amber' : 'indigo'}>{brokerLabel(p.broker)}</Badge>}
                  {accountLabel(p)}
                </p>
                {p.elefin_client_id && <p className="text-xs text-zinc-500">Client #{p.elefin_client_id}</p>}
              </td>
              <td className="px-3 py-2.5 text-xs whitespace-nowrap text-zinc-600">
                {p.broker === 'xm' ? (
                  <p className="text-zinc-500">From XM in Inactivity cleanup</p>
                ) : (
                  <>
                    <p>
                      {formatNumber(p.lots)} lots · {formatNumber(p.trades, 0)} trades
                    </p>
                    <p className="text-zinc-500">Last trade {formatDate(p.last_trade_at, false)}</p>
                  </>
                )}
              </td>
              <td className="py-3 pr-4 pl-3 text-sm whitespace-nowrap text-zinc-600 sm:pr-6">
                {p.verified ? formatDate(p.verified_at, false) : <Badge tone="amber">Re-verify needed</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
