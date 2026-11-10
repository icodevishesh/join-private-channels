import { query } from './pool.js';

// ---------- settings ----------
export async function getSetting(key, fallback = null) {
  const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', [key]);
  const v = rows[0]?.value;
  return v === undefined || v === null || v === '' ? fallback : v;
}

/** Several settings in one query, as { key: value } (missing keys are omitted). */
export async function getSettings(keys) {
  const rows = await query('SELECT `key`, `value` FROM settings WHERE `key` IN (?)', [keys]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ---------- conditions ----------
export async function getActiveConditions() {
  return query('SELECT * FROM conditions WHERE is_active = 1 ORDER BY sort_order, id');
}

// ---------- users ----------
export async function upsertUser(from) {
  await query(
    `INSERT INTO tg_users (telegram_id, username, first_name, last_name)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE username = VALUES(username), first_name = VALUES(first_name), last_name = VALUES(last_name)`,
    [from.id, from.username ?? null, from.first_name ?? null, from.last_name ?? null],
  );
}

export async function getUser(telegramId) {
  const rows = await query('SELECT * FROM tg_users WHERE telegram_id = ?', [telegramId]);
  return rows[0] ?? null;
}

export async function setUserState(telegramId, state) {
  await query('UPDATE tg_users SET state = ? WHERE telegram_id = ?', [state, telegramId]);
}

export async function setLastCheckedEmail(telegramId, email) {
  await query('UPDATE tg_users SET last_checked_email = ? WHERE telegram_id = ?', [email, telegramId]);
}

export async function findUserByVerifiedEmail(email) {
  const rows = await query('SELECT * FROM tg_users WHERE verified_email = ?', [email]);
  return rows[0] ?? null;
}

export async function findUserByXmLogin(loginId) {
  const rows = await query('SELECT * FROM tg_users WHERE xm_login_id = ?', [loginId]);
  return rows[0] ?? null;
}

/** `account` is { broker: 'elefin', email, clientId } or { broker: 'xm', loginId }. */
export async function markUserVerified(telegramId, account) {
  const elefin = account.broker === 'elefin';
  await query(
    `UPDATE tg_users SET broker = ?, verified_email = ?, elefin_client_id = ?, xm_login_id = ?,
       verified_at = UTC_TIMESTAMP(), state = NULL
     WHERE telegram_id = ?`,
    [account.broker, elefin ? account.email : null, elefin ? account.clientId : null, elefin ? null : account.loginId, telegramId],
  );
}

/** Is this Telegram user verified (with any broker)? */
export const isVerified = (user) => Boolean(user?.verified_at && user?.broker);

/** The broker-account part of a member row, from a verified tg_users row. */
export const memberLink = (user) => ({
  telegram_id: user.telegram_id,
  broker: user.broker,
  email: user.verified_email,
  elefin_client_id: user.elefin_client_id,
  xm_login_id: user.xm_login_id,
});

// ---------- start questionnaire (name + verified phone) ----------
/** Does this user still need to answer the start questionnaire? */
export const needsProfile = (user) => !user?.full_name || !user?.phone_verified_at;

export async function saveFullName(telegramId, name) {
  await query('UPDATE tg_users SET full_name = ? WHERE telegram_id = ?', [name, telegramId]);
}

export async function savePhoneRequest(telegramId, phone, requestId) {
  await query(
    'UPDATE tg_users SET pending_phone = ?, phone_request_id = ?, phone_code_sent_at = UTC_TIMESTAMP() WHERE telegram_id = ?',
    [phone, requestId, telegramId],
  );
}

export async function clearPhoneRequest(telegramId) {
  await query('UPDATE tg_users SET pending_phone = NULL, phone_request_id = NULL, phone_code_sent_at = NULL WHERE telegram_id = ?', [telegramId]);
}

/** The pending number becomes their verified phone. */
export async function markPhoneVerified(telegramId) {
  await query(
    `UPDATE tg_users SET phone = pending_phone, phone_verified_at = UTC_TIMESTAMP(),
       pending_phone = NULL, phone_request_id = NULL, phone_code_sent_at = NULL, state = NULL
     WHERE telegram_id = ? AND pending_phone IS NOT NULL`,
    [telegramId],
  );
}

// ---------- verification logs ----------
/** `email` is the account checked: the Elefin email, or the XM MT5 account ID. */
export async function logVerification({ telegramId, broker = 'elefin', email, clientId = null, result, details = null }) {
  await query(
    'INSERT INTO verification_logs (telegram_id, broker, email, elefin_client_id, result, details) VALUES (?, ?, ?, ?, ?, ?)',
    [telegramId, broker, email, clientId, result, details ? JSON.stringify(details) : null],
  );
}

export async function countRecentVerifications(telegramId) {
  const rows = await query(
    'SELECT COUNT(*) AS n FROM verification_logs WHERE telegram_id = ? AND created_at > (UTC_TIMESTAMP() - INTERVAL 1 HOUR)',
    [telegramId],
  );
  return Number(rows[0].n);
}

// ---------- discord connect (OAuth2) ----------
export async function createOAuthState(state, telegramId, ttlMinutes) {
  await query(
    'INSERT INTO discord_oauth_states (state, telegram_id, expires_at) VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE)',
    [state, telegramId, ttlMinutes],
  );
}

/** Returns the state row if it exists, is unused and hasn't expired. */
export async function getValidOAuthState(state) {
  const rows = await query(
    'SELECT * FROM discord_oauth_states WHERE state = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()',
    [state],
  );
  return rows[0] ?? null;
}

export async function markOAuthStateUsed(state, discordUserId) {
  await query(
    'UPDATE discord_oauth_states SET used_at = UTC_TIMESTAMP(), discord_user_id = ? WHERE state = ?',
    [discordUserId, state],
  );
}

export async function findUserByDiscordId(discordUserId) {
  const rows = await query('SELECT * FROM tg_users WHERE discord_user_id = ?', [discordUserId]);
  return rows[0] ?? null;
}

export async function linkDiscordToUser(telegramId, discordUserId) {
  await query('UPDATE tg_users SET discord_user_id = ? WHERE telegram_id = ?', [discordUserId, telegramId]);
}

// ---------- discord members ----------
// Member rows remember the broker account the person joined with. A new link replaces
// the whole account (so someone who switched broker isn't checked against the old one);
// no link keeps what's there.
const brokerAccount = (link) => [link?.broker ?? null, link?.email ?? null, link?.elefin_client_id ?? null, link?.xm_login_id ?? null];
const BROKER_ACCOUNT_UPDATE = `
       email = IF(VALUES(broker) IS NULL, email, VALUES(email)),
       elefin_client_id = IF(VALUES(broker) IS NULL, elefin_client_id, VALUES(elefin_client_id)),
       xm_login_id = IF(VALUES(broker) IS NULL, xm_login_id, VALUES(xm_login_id)),
       broker = COALESCE(VALUES(broker), broker)`;
export async function getMember(discordUserId) {
  const rows = await query('SELECT * FROM discord_members WHERE discord_user_id = ?', [discordUserId]);
  return rows[0] ?? null;
}

/**
 * Records a member who joined. `link` ({ telegram_id, email, elefin_client_id }) is
 * given when we know who they are; existing links are never cleared.
 */
export async function recordMemberJoin({ discordUserId, username, displayName, joinedAt, link = null }) {
  await query(
    `INSERT INTO discord_members
       (discord_user_id, username, display_name, telegram_id, broker, email, elefin_client_id, xm_login_id, status, joined_at, left_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'member', ?, NULL)
     ON DUPLICATE KEY UPDATE
       username = VALUES(username),
       display_name = VALUES(display_name),
       telegram_id = COALESCE(VALUES(telegram_id), telegram_id),
       ${BROKER_ACCOUNT_UPDATE},
       joined_at = IF(status = 'member' AND joined_at IS NOT NULL, joined_at, VALUES(joined_at)),
       status = 'member',
       left_at = NULL`,
    [
      discordUserId, username, displayName,
      link?.telegram_id ?? null, ...brokerAccount(link),
      joinedAt,
    ],
  );
}

/** Startup sync for someone already in the server. Keeps existing links and join date. */
export async function syncMember({ discordUserId, username, displayName, joinedAt }) {
  await query(
    `INSERT INTO discord_members (discord_user_id, username, display_name, status, joined_at)
     VALUES (?, ?, ?, 'member', ?)
     ON DUPLICATE KEY UPDATE
       username = VALUES(username),
       display_name = VALUES(display_name),
       status = 'member',
       joined_at = COALESCE(joined_at, VALUES(joined_at)),
       left_at = NULL`,
    [discordUserId, username, displayName, joinedAt],
  );
}

export async function getActiveMemberIds() {
  const rows = await query("SELECT discord_user_id FROM discord_members WHERE status = 'member'");
  return rows.map((r) => r.discord_user_id);
}

/**
 * After a kick: the user must verify their broker account again (requirements are
 * re-checked) before they get new join links. Join links they haven't used yet stop
 * working. Returns true if they were verified (so callers notify them only once).
 */
export async function resetVerification(telegramId) {
  const res = await query(
    `UPDATE tg_users SET broker = NULL, verified_email = NULL, elefin_client_id = NULL, xm_login_id = NULL, verified_at = NULL,
       state = NULL, channel_invite_link = NULL, channel_invite_expires_at = NULL
     WHERE telegram_id = ? AND verified_at IS NOT NULL`,
    [telegramId],
  );
  await query('UPDATE discord_oauth_states SET expires_at = UTC_TIMESTAMP() WHERE telegram_id = ? AND used_at IS NULL', [telegramId]);
  return res.affectedRows > 0;
}

/** Same as resetVerification, looked up by Discord account. Returns { telegramId, wasVerified }. */
export async function resetVerificationForDiscordUser(discordUserId) {
  const user = await findUserByDiscordId(discordUserId);
  if (!user) return { telegramId: null, wasVerified: false };
  return { telegramId: user.telegram_id, wasVerified: await resetVerification(user.telegram_id) };
}

/** Marks a member as left, unless they were already kicked or banned. */
export async function markMemberLeft(discordUserId) {
  await query(
    "UPDATE discord_members SET status = 'left', left_at = UTC_TIMESTAMP() WHERE discord_user_id = ? AND status = 'member'",
    [discordUserId],
  );
}

export async function setMemberStatus(discordUserId, status, reason = null) {
  await query(
    `UPDATE discord_members
     SET status = ?, action_reason = ?, action_at = UTC_TIMESTAMP(), left_at = COALESCE(left_at, UTC_TIMESTAMP())
     WHERE discord_user_id = ?`,
    [status, reason, discordUserId],
  );
}

// ---------- telegram channel ----------
export async function getChannelMember(telegramId) {
  const rows = await query('SELECT * FROM channel_members WHERE telegram_id = ?', [telegramId]);
  return rows[0] ?? null;
}

/** Records someone joining the channel. `link` (see memberLink) is kept if not given. */
export async function recordChannelJoin({ telegramId, channelId, link = null }) {
  await query(
    `INSERT INTO channel_members (telegram_id, channel_id, broker, email, elefin_client_id, xm_login_id, status, joined_at, left_at)
     VALUES (?, ?, ?, ?, ?, ?, 'member', UTC_TIMESTAMP(), NULL)
     ON DUPLICATE KEY UPDATE
       channel_id = VALUES(channel_id),
       ${BROKER_ACCOUNT_UPDATE},
       joined_at = IF(status = 'member' AND joined_at IS NOT NULL, joined_at, VALUES(joined_at)),
       status = 'member',
       left_at = NULL`,
    [telegramId, String(channelId), ...brokerAccount(link)],
  );
}

/** Marks a channel member as left, unless they were kicked or banned. */
export async function markChannelMemberLeft(telegramId) {
  await query("UPDATE channel_members SET status = 'left', left_at = UTC_TIMESTAMP() WHERE telegram_id = ? AND status = 'member'", [telegramId]);
}

export async function setChannelMemberStatus(telegramId, status, reason = null, { onlyIfMember = false } = {}) {
  await query(
    `UPDATE channel_members
     SET status = ?, action_reason = ?, action_at = UTC_TIMESTAMP(), left_at = COALESCE(left_at, UTC_TIMESTAMP())
     WHERE telegram_id = ? ${onlyIfMember ? "AND status = 'member'" : ''}`,
    [status, reason, telegramId],
  );
}

/** Bans someone from the channel even if they never joined, so a later join request is declined. */
export async function upsertChannelBan(telegramId, channelId, reason = null) {
  await query(
    `INSERT INTO channel_members (telegram_id, channel_id, status, action_reason, action_at, left_at)
     VALUES (?, ?, 'banned', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE status = 'banned', action_reason = VALUES(action_reason), action_at = UTC_TIMESTAMP(),
       left_at = COALESCE(left_at, UTC_TIMESTAMP())`,
    [telegramId, String(channelId), reason],
  );
}

/** Banned in the Discord server or the Telegram channel counts as banned everywhere. */
export async function isPersonBanned(telegramId) {
  const rows = await query(
    `SELECT 1 FROM tg_users u
     LEFT JOIN discord_members d ON d.discord_user_id = u.discord_user_id
     LEFT JOIN channel_members ch ON ch.telegram_id = u.telegram_id
     WHERE u.telegram_id = ? AND (d.status = 'banned' OR ch.status = 'banned')`,
    [telegramId],
  );
  return rows.length > 0;
}

export async function saveChannelInvite(telegramId, link, expiresAt) {
  await query('UPDATE tg_users SET channel_invite_link = ?, channel_invite_expires_at = ? WHERE telegram_id = ?', [link, expiresAt, telegramId]);
}

// ---------- chats the bot was added to ----------
export async function upsertBotChat({ chatId, title, type, username, botStatus }) {
  await query(
    `INSERT INTO bot_chats (chat_id, title, type, username, bot_status) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), type = VALUES(type), username = VALUES(username), bot_status = VALUES(bot_status)`,
    [String(chatId), title ?? null, type ?? null, username ?? null, botStatus ?? null],
  );
}

export async function listBotChats() {
  return query("SELECT * FROM bot_chats WHERE bot_status IN ('administrator', 'creator') ORDER BY updated_at DESC");
}
