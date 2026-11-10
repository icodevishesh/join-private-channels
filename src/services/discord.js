import { randomBytes } from 'node:crypto';
import { getSetting, setMemberStatus, createOAuthState, resetVerificationForDiscordUser } from '../db/repo.js';
import { notifyTelegramUser } from './telegramNotify.js';
import { kickedNotice } from '../bot/messages.js';
import { getDiscordConfig } from './discordSettings.js';
import { getDiscordRedirectUri } from './publicUrl.js';

const API = 'https://discord.com/api/v10';

export class DiscordError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export async function isDiscordConfigured() {
  const d = await getDiscordConfig();
  return Boolean(d.botToken && d.guildId && d.clientSecret);
}

let appCache = null;

/** The bot's Discord application (id, name, flags, redirect_uris). Cached for 60s per bot token. */
export async function getApplication({ fresh = false } = {}) {
  const { botToken } = await getDiscordConfig();
  if (!fresh && appCache?.token === botToken && Date.now() - appCache.at < 60_000) return appCache.app;
  const { data } = await discordFetch('/applications/@me');
  appCache = { app: data, token: botToken, at: Date.now() };
  return data;
}

/** The saved Client ID if set, otherwise the application ID (they're the same thing). */
export async function getClientId() {
  return (await getDiscordConfig()).clientId || (await getApplication()).id;
}

export async function getServerUrl() {
  return `https://discord.com/channels/${(await getDiscordConfig()).guildId}`;
}

/** Discord REST call. Uses the bot token unless `token` (a full Authorization value) is given. */
export async function discordFetch(path, { method = 'GET', token, body, reason, form } = {}) {
  const headers = { Authorization: token ?? `Bot ${(await getDiscordConfig()).botToken}` };
  if (reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(reason);
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  else if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form ? new URLSearchParams(form) : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new DiscordError(`Discord ${method} ${path} failed (HTTP ${res.status}): ${data?.message ?? data?.error_description ?? 'unknown'}`, res.status);
  }
  return { status: res.status, data };
}

// ---------- "Login with Discord" (OAuth2) ----------

/** Creates a one-time Discord login URL tied to this Telegram user. */
export async function createConnectUrl(telegramId) {
  if (!(await isDiscordConfigured())) {
    throw new DiscordError('Discord bot token, server ID and client secret must be set in the admin panel (Settings → Discord)');
  }
  const ttl = Number(await getSetting('discord_connect_link_ttl_minutes', '60'));
  const state = randomBytes(24).toString('base64url');
  await createOAuthState(state, telegramId, ttl);

  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', await getClientId());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', await getDiscordRedirectUri());
  url.searchParams.set('scope', 'identify guilds.join');
  url.searchParams.set('state', state);
  return url.toString();
}

/** Exchanges the OAuth2 code for the user's access token and Discord profile. */
export async function exchangeCodeForUser(code) {
  const { clientSecret } = await getDiscordConfig();
  const { data: token } = await discordFetch('/oauth2/token', {
    method: 'POST',
    token: `Basic ${Buffer.from(`${await getClientId()}:${clientSecret}`).toString('base64')}`,
    form: { grant_type: 'authorization_code', code, redirect_uri: await getDiscordRedirectUri() },
  });
  const { data: user } = await discordFetch('/users/@me', { token: `Bearer ${token.access_token}` });
  return { accessToken: token.access_token, user };
}

/**
 * Adds the user to the server with their OAuth2 token. Needs "Create Instant Invite"
 * (and "Manage Roles" when a member role is set).
 * @returns {'added' | 'already_member'}
 */
export async function addUserToGuild(discordUserId, accessToken, reason) {
  const { guildId, memberRoleId } = await getDiscordConfig();
  const roles = memberRoleId ? [memberRoleId] : undefined;
  const { status } = await discordFetch(`/guilds/${guildId}/members/${discordUserId}`, {
    method: 'PUT',
    body: { access_token: accessToken, ...(roles ? { roles } : {}) },
    reason,
  });
  if (status === 204 && roles) {
    // Already in the server: Discord ignores `roles` in that case, so add it separately.
    await discordFetch(`/guilds/${guildId}/members/${discordUserId}/roles/${roles[0]}`, { method: 'PUT', reason });
  }
  return status === 201 ? 'added' : 'already_member';
}

// ---------- moderation ----------

/**
 * Kicks a member from the server. Needs "Kick Members".
 * They can rejoin by verifying their Elefin email again in the Telegram bot.
 */
export async function kickMember(discordUserId, reason = null) {
  const { guildId } = await getDiscordConfig();
  try {
    await discordFetch(`/guilds/${guildId}/members/${discordUserId}`, { method: 'DELETE', reason });
  } catch (err) {
    // 404 = no longer in the server; still record the kick.
    if (err.status !== 404) throw err;
  }
  await setMemberStatus(discordUserId, 'kicked', reason);
  // Notify only once, even if they're kicked from the Telegram channel too.
  const { telegramId, wasVerified } = await resetVerificationForDiscordUser(discordUserId);
  if (telegramId && wasVerified) await notifyTelegramUser(telegramId, kickedNotice(reason));
}

/** Bans a member (they can't rejoin until unbanned). Needs "Ban Members". */
export async function banMember(discordUserId, reason = null, deleteMessageSeconds = 0) {
  const { guildId } = await getDiscordConfig();
  await discordFetch(`/guilds/${guildId}/bans/${discordUserId}`, {
    method: 'PUT',
    body: { delete_message_seconds: deleteMessageSeconds },
    reason,
  });
  await setMemberStatus(discordUserId, 'banned', reason);
}

/** Lets a banned (or kicked) member join again via the bot (lifts the Discord ban if any). */
export async function allowRejoin(discordUserId) {
  const { guildId } = await getDiscordConfig();
  try {
    await discordFetch(`/guilds/${guildId}/bans/${discordUserId}`, { method: 'DELETE', reason: 'Allowed to rejoin from admin panel' });
  } catch (err) {
    if (err.status !== 404) throw err; // 404 = wasn't banned
  }
  await setMemberStatus(discordUserId, 'left', null);
}
