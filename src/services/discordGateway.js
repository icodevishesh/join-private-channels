import { Client, Events, GatewayIntentBits } from 'discord.js';
import * as repo from '../db/repo.js';
import { runtime } from '../runtime.js';
import { recordIncident } from './incidents.js';
import { getDiscordConfig } from './discordSettings.js';

/*
 * Keeps `discord_members` in sync with the server: everyone who joins, leaves or
 * gets banned. Members added through "Connect with Discord" are already linked to
 * their Telegram account by the OAuth callback; this never removes that link.
 */

let queue = Promise.resolve();
let client = null;

const serial = (fn) => {
  queue = queue.then(fn).catch((err) => console.error('[discord-gw]', err));
  return queue;
};

const memberInfo = (member) => ({
  discordUserId: member.id,
  username: member.user.username,
  displayName: member.displayName ?? member.user.globalName ?? member.user.username,
  joinedAt: member.joinedAt ?? new Date(),
});

/** On startup: record everyone already in the server and mark people who left while we were offline. */
async function syncGuild(guild) {
  const members = await guild.members.fetch();
  for (const member of members.values()) {
    if (!member.user.bot) await repo.syncMember(memberInfo(member));
  }
  const present = new Set(members.keys());
  for (const id of await repo.getActiveMemberIds()) {
    if (!present.has(id)) await repo.markMemberLeft(id);
  }
  console.log(`[discord-gw] synced ${members.size} members of "${guild.name}"`);
}

export async function startDiscordGateway() {
  const { botToken, guildId } = await getDiscordConfig();
  if (!botToken || !guildId) {
    console.warn('[discord-gw] Discord bot token / server ID not set — member tracking disabled.');
    Object.assign(runtime.gateway, { state: 'disabled', error: 'Discord bot token or server ID not set (Settings → Discord)' });
    return null;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers, // privileged: enable "Server Members Intent" in the developer portal
      GatewayIntentBits.GuildModeration,
    ],
  });

  const isOurGuild = (guild) => guild?.id === guildId;

  client.once(Events.ClientReady, async (c) => {
    console.log(`[discord-gw] logged in as ${c.user.tag}`);
    Object.assign(runtime.gateway, { state: 'running', tag: c.user.tag, error: null });
    const guild = await c.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      console.error('[discord-gw] the bot is not in the configured server — add it to the server.');
      return recordIncident({ type: 'discord_connection_error', reason: 'The Discord bot is not in the configured server' });
    }
    serial(() => syncGuild(guild));
  });

  client.on(Events.GuildMemberAdd, (member) => {
    if (isOurGuild(member.guild) && !member.user.bot) serial(() => repo.recordMemberJoin(memberInfo(member)));
  });

  client.on(Events.GuildMemberRemove, (member) => {
    if (isOurGuild(member.guild)) serial(() => repo.markMemberLeft(member.id));
  });

  client.on(Events.GuildBanAdd, (ban) => {
    if (isOurGuild(ban.guild)) serial(() => repo.setMemberStatus(ban.user.id, 'banned', ban.reason ?? null));
  });

  client.on(Events.Error, (err) => console.error('[discord-gw]', err));
  client.on(Events.ShardDisconnect, () => Object.assign(runtime.gateway, { state: 'disconnected' }));
  client.on(Events.ShardResume, () => Object.assign(runtime.gateway, { state: 'running', error: null }));

  try {
    await client.login(botToken);
  } catch (err) {
    console.error(
      '[discord-gw] login failed:',
      err.message,
      /disallowed intents/i.test(err.message) ? '→ enable "Server Members Intent" in the Discord developer portal (Bot tab).' : '',
    );
    Object.assign(runtime.gateway, { state: 'error', error: err.message });
    await recordIncident({ type: 'discord_connection_error', reason: `Discord login failed: ${err.message}` });
    client = null;
  }
  return client;
}

export async function stopDiscordGateway() {
  await client?.destroy();
  client = null;
}
