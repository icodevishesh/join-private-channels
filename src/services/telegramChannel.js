import { Api } from 'grammy';
import { config } from '../config.js';
import * as repo from '../db/repo.js';
import { notifyTelegramUser } from './telegramNotify.js';
import { kickedNotice } from '../bot/messages.js';

/*
 * Private Telegram channel access.
 *
 * Each verified user gets their own invite link that creates a *join request*.
 * The bot approves a request only if the person asking is a verified user, so a
 * forwarded link is useless to anyone else.
 */

// Works from the bot process and from the admin panel (bundled separately).
const api = (globalThis.__tgdcTelegramApi ??= new Api(config.telegramToken));

export async function getChannelConfig() {
  const [enabled, channelId] = await Promise.all([repo.getSetting('telegram_channel_enabled', '0'), repo.getSetting('telegram_channel_id', '')]);
  return { enabled: enabled === '1', channelId: channelId.trim() };
}

export const isOurChannel = (chatId, channelId) => Boolean(channelId) && String(chatId) === String(channelId);

/** Personal join-request link for this user, reused until it expires. */
export async function getChannelInviteLink(user) {
  const { channelId } = await getChannelConfig();
  if (!channelId) throw new Error('No Telegram channel is set');

  const expiresAt = user.channel_invite_expires_at ? new Date(user.channel_invite_expires_at) : null;
  if (user.channel_invite_link && expiresAt && expiresAt.getTime() - Date.now() > 60_000) return user.channel_invite_link;

  const minutes = Number(await repo.getSetting('discord_connect_link_ttl_minutes', '60'));
  const expire = new Date(Date.now() + minutes * 60_000);
  const link = await api.createChatInviteLink(channelId, {
    name: `TG ${user.telegram_id}`.slice(0, 32),
    expire_date: Math.floor(expire.getTime() / 1000),
    creates_join_request: true,
  });
  await repo.saveChannelInvite(user.telegram_id, link.invite_link, expire);
  return link.invite_link;
}

/** A link that opens the channel for someone who is already a member. */
export async function getChannelOpenUrl() {
  const { channelId } = await getChannelConfig();
  const chat = await api.getChat(channelId).catch(() => null);
  if (chat?.username) return `https://t.me/${chat.username}`;
  return `https://t.me/c/${String(channelId).replace(/^-100/, '')}/999999999`;
}

export async function revokeInviteLink(channelId, link) {
  if (link) await api.revokeChatInviteLink(channelId, link).catch(() => {});
}

// ---------- moderation ----------

async function resetAndNotify(telegramId, reason) {
  if (await repo.resetVerification(telegramId)) await notifyTelegramUser(telegramId, kickedNotice(reason));
}

/** Kick = ban + immediate unban: removed now, can rejoin after verifying again. Needs "Ban users". */
export async function kickChannelMember(telegramId, reason = null) {
  const { channelId } = await getChannelConfig();
  await api.banChatMember(channelId, telegramId);
  await api.unbanChatMember(channelId, telegramId, { only_if_banned: true });
  await repo.setChannelMemberStatus(telegramId, 'kicked', reason);
  await resetAndNotify(telegramId, reason);
}

/** Permanent removal until "Allow rejoin". */
export async function banChannelMember(telegramId, reason = null) {
  const { channelId } = await getChannelConfig();
  await api.banChatMember(channelId, telegramId);
  await repo.upsertChannelBan(telegramId, channelId, reason);
}

/** Lifts a ban so they can verify again and rejoin. */
export async function allowChannelRejoin(telegramId) {
  const { channelId } = await getChannelConfig();
  await api.unbanChatMember(channelId, telegramId, { only_if_banned: true });
  await repo.setChannelMemberStatus(telegramId, 'left', null);
}

// ---------- setup ----------

let meCache = null;
/** The Telegram bot's own account (cached). */
export async function getBotInfo() {
  meCache ??= await api.getMe();
  return meCache;
}

/** Telegram link that opens "add bot as admin to a channel" with the rights we need pre-ticked. */
export async function getAddToChannelUrl() {
  const me = await getBotInfo();
  return `https://t.me/${me.username}?startchannel&admin=invite_users+restrict_members`;
}

// ---------- setup checks ----------

/** Everything the Setup page needs to know about the channel and the bot's rights in it. */
export async function inspectChannel(channelId) {
  const me = await getBotInfo();
  const chat = await api.getChat(channelId);
  const member = await api.getChatMember(channelId, me.id);
  return { me, chat, member };
}
