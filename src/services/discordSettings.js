import { config } from '../config.js';
import { getSettings } from '../db/repo.js';

/*
 * Discord credentials live in the `settings` table (edited in the admin panel).
 * The matching .env variables are only a fallback and are copied into the
 * database on first run (see migrate.js).
 */

export const DISCORD_SETTINGS = {
  botToken: { key: 'discord_bot_token', env: 'DISCORD_BOT_TOKEN' },
  guildId: { key: 'discord_guild_id', env: 'DISCORD_GUILD_ID' },
  clientId: { key: 'discord_client_id', env: 'DISCORD_CLIENT_ID' },
  clientSecret: { key: 'discord_client_secret', env: 'DISCORD_CLIENT_SECRET' },
  memberRoleId: { key: 'discord_member_role_id', env: 'DISCORD_MEMBER_ROLE_ID' },
};

const CACHE_MS = 5_000;
// Shared via globalThis so the admin panel (bundled separately) can invalidate it after saving.
const cache = (globalThis.__tgdcDiscordConfig ??= { value: null, at: 0 });

export function invalidateDiscordConfig() {
  cache.value = null;
}

/** @returns {Promise<{ botToken, guildId, clientId, clientSecret, memberRoleId }>} */
export async function getDiscordConfig() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const stored = await getSettings(Object.values(DISCORD_SETTINGS).map((s) => s.key));
  const value = Object.fromEntries(
    Object.entries(DISCORD_SETTINGS).map(([name, { key }]) => [name, (stored[key] || config.discord[name] || '').trim()]),
  );
  cache.value = value;
  cache.at = Date.now();
  return value;
}
