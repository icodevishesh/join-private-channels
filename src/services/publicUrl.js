import { config } from '../config.js';
import { getSetting } from '../db/repo.js';

/*
 * The public address of this server (e.g. https://bot.example.com), stored in the
 * `settings` table as `public_url`. PUBLIC_URL in .env is only a fallback and is
 * copied into the database on first run.
 */

const CACHE_MS = 5_000;
// Shared via globalThis so the admin panel (bundled separately) can invalidate it after saving.
const cache = (globalThis.__tgdcPublicUrl ??= { value: null, at: 0 });

export const normalizeUrl = (url) => String(url ?? '').trim().replace(/\/+$/, '');

export function invalidatePublicUrl() {
  cache.value = null;
}

export async function getPublicUrl() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = normalizeUrl((await getSetting('public_url')) || config.web.publicUrl);
  cache.value = value;
  cache.at = Date.now();
  return value;
}

/** Where Discord sends users back after "Authorize". Must also be registered in the Developer Portal. */
export async function getDiscordRedirectUri() {
  return `${await getPublicUrl()}/discord/callback`;
}
