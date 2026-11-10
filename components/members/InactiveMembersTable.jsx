'use client';

import Badge from '../ui/Badge';
import { Checkbox } from '../ui/Field';
import TelegramUser from './TelegramUser';
import { formatDate, formatNumber } from '@/lib/format';

const th = 'px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-zinc-500 uppercase';

function LastTrade({ member, xm }) {
  if (member.missing) return <Badge tone="red">Not in Elefin</Badge>;
  // XM only tells us about trades inside the period we asked for.
  if (!member.last_trade_at) return <Badge tone="amber">{xm ? 'No trades in period' : 'Never traded'}</Badge>;
  const days = Math.floor((Date.now() - new Date(member.last_trade_at).getTime()) / 86_400_000);
  return (
    <span className="text-sm text-zinc-700">
      {formatDate(member.last_trade_at, false)} <span className="text-xs text-zinc-500">({days}d ago)</span>
    </span>
  );
}

export default function InactiveMembersTable({ rows, broker = 'elefin', selected, onToggle, onToggleAll }) {
  const key = (r) => r.key;
  const xm = broker === 'xm';
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(key(r)));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200">
        <thead className="bg-zinc-50">
          <tr>
            <th scope="col" className="w-10 py-2.5 pr-2 pl-4 sm:pl-5">
              <Checkbox checked={allSelected} onChange={() => onToggleAll(!allSelected)} aria-label="Select all" />
            </th>
            <th scope="col" className={th}>Person</th>
            <th scope="col" className={th}>In</th>
            <th scope="col" className={th}>{xm ? 'XM account' : 'Elefin'}</th>
            <th scope="col" className={th}>Last trade</th>
            <th scope="col" className={`${th} pr-4`}>Totals</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((m) => (
            <tr key={key(m)} className={selected.has(key(m)) ? 'bg-indigo-50/50' : 'hover:bg-zinc-50'}>
              <td className="py-2.5 pr-2 pl-4 sm:pl-5">
                <Checkbox checked={selected.has(key(m))} onChange={() => onToggle(key(m))} aria-label={`Select ${m.telegram_name || m.email || m.xm_login_id}`} />
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {m.telegram_id ? (
                  <TelegramUser u={m} details={[['Discord', m.discord_username ? `@${m.discord_username}` : null]]} />
                ) : (
                  <p className="text-sm font-medium text-zinc-900">{m.discord_username || m.email || `MT5 #${m.xm_login_id}`}</p>
                )}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <div className="flex gap-1">
                  {m.discord_user_id && <Badge tone="indigo">Discord</Badge>}
                  {m.in_channel && <Badge tone="zinc">Telegram</Badge>}
                </div>
              </td>
              <td className="px-3 py-2.5 text-sm whitespace-nowrap text-zinc-700">
                {xm ? (
                  <p className="font-mono">MT5 #{m.xm_login_id}</p>
                ) : (
                  <>
                    <p>{m.email}</p>
                    <p className="text-xs text-zinc-500">Client #{m.elefin_client_id}</p>
                  </>
                )}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <LastTrade member={m} xm={xm} />
              </td>
              <td className="py-2.5 pr-4 pl-3 sm:pr-5 text-xs whitespace-nowrap text-zinc-600">
                {m.missing ? (
                  '—'
                ) : xm ? (
                  <>
                    <p>
                      {formatNumber(m.lots)} lots · {formatNumber(m.trades, 0)} trades
                    </p>
                    {m.balance_ok !== null && (
                      <p className={m.balance_ok ? 'text-zinc-500' : 'text-red-600'}>Balance {m.balance_ok ? 'above' : 'below'} threshold</p>
                    )}
                  </>
                ) : (
                  <>
                    <p>
                      {formatNumber(m.lots)} lots · {formatNumber(m.trades, 0)} trades
                    </p>
                    <p className="text-zinc-500">
                      Bal {formatNumber(m.balance)} · Dep {formatNumber(m.deposits)}
                    </p>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
