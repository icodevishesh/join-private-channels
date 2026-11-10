import { requireAdminApi } from '@/lib/auth';
import { filtersFromSearchParams } from '@/lib/memberFilters';
import { exportPeople } from '@/src/db/adminRepo.js';

export const dynamic = 'force-dynamic';

// One row per person, with their Discord and Telegram channel status side by side.
const COLUMNS = [
  ['telegram_id', 'Telegram ID'],
  ['telegram_username', 'Telegram username'],
  ['telegram_name', 'Telegram name'],
  ['full_name', 'Name (questionnaire)'],
  ['phone', 'Phone'],
  ['phone_verified_at', 'Phone verified at (UTC)'],
  ['verified', 'Verified'],
  ['verified_at', 'Verified at (UTC)'],
  ['broker', 'Broker'],
  ['email', 'Elefin email'],
  ['elefin_client_id', 'Elefin client ID'],
  ['xm_login_id', 'XM MT5 account'],
  ['discord_user_id', 'Discord ID'],
  ['discord_username', 'Discord username'],
  ['discord_name', 'Discord name'],
  ['discord_status', 'Discord status'],
  ['discord_joined_at', 'Discord joined (UTC)'],
  ['channel_status', 'Telegram channel status'],
  ['channel_joined_at', 'Channel joined (UTC)'],
  ['deposits', 'Deposits (latest, Elefin)'],
  ['balance', 'Balance (latest)'],
  ['lots', 'Lots (latest)'],
  ['trades', 'Trades (latest)'],
  ['last_trade_at', 'Last trade (latest)'],
  ['discord_reason', 'Discord kick/ban reason'],
  ['channel_reason', 'Channel kick/ban reason'],
];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  // Stop spreadsheet apps from treating user-controlled text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const rows = await exportPeople(filtersFromSearchParams(new URL(request.url).searchParams));
  const lines = [COLUMNS.map(([, label]) => label).join(',')];
  for (const row of rows) {
    const out = { ...row, discord_status: row.discord_status ?? 'not joined', channel_status: row.channel_status ?? 'not joined' };
    lines.push(COLUMNS.map(([key]) => csvCell(out[key])).join(','));
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lines.join('\r\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="members-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
