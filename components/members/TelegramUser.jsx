'use client';

import ProfileLink from './ProfileLink';
import { formatDate } from '@/lib/format';

/**
 * A Telegram user: their questionnaire name (or Telegram name) opening a profile card,
 * with their phone underneath. Used on Members, Incidents and Inactivity cleanup.
 * `u` has telegram_id, telegram_username, telegram_name, full_name, phone, phone_verified_at.
 */
export default function TelegramUser({ u, details = [] }) {
  const name = u.full_name || u.telegram_name || (u.telegram_username ? `@${u.telegram_username}` : `User ${u.telegram_id}`);
  return (
    <div className="min-w-0">
      <ProfileLink
        name={name}
        href={u.telegram_username ? `https://t.me/${u.telegram_username}` : `tg://user?id=${u.telegram_id}`}
        hrefLabel="Open in Telegram"
        details={[
          ['Name', u.full_name || '—'],
          ['Phone', u.phone ? `${u.phone}${u.phone_verified_at ? ' ✓' : ''}` : '—'],
          ['Phone verified', u.phone_verified_at ? `${formatDate(u.phone_verified_at)} UTC` : null],
          ['Telegram name', u.telegram_name || null],
          ['Username', u.telegram_username ? `@${u.telegram_username}` : '—'],
          ['Telegram ID', u.telegram_id],
          ...details,
        ]}
      />
      <p className="truncate text-xs text-zinc-500 tabular-nums">
        {u.phone ?? (u.telegram_username ? `@${u.telegram_username}` : u.telegram_id)}
      </p>
    </div>
  );
}
