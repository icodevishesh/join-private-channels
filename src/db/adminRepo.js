import { query } from './pool.js';

/*
 * The Members page lists *people who came through the bot*: Telegram users who
 * verified, or who joined the Discord server / Telegram channel through the bot
 * (kicked people lose their verification but still show up). Anyone who joined
 * Discord or the channel some other way is not listed.
 *
 * One row per person, with their Discord and Telegram channel status. Activity comes
 * from the latest Elefin sync, otherwise from their last passed verification.
 */
const PEOPLE_FROM = `
  FROM tg_users u
  LEFT JOIN discord_members d ON d.discord_user_id = u.discord_user_id AND d.telegram_id = u.telegram_id
  LEFT JOIN channel_members ch ON ch.telegram_id = u.telegram_id AND ch.broker IS NOT NULL`;

const PEOPLE_BASE_WHERE = '(u.verified_at IS NOT NULL OR d.discord_user_id IS NOT NULL OR ch.telegram_id IS NOT NULL)';

const PEOPLE_SELECT = `
  SELECT CAST(u.telegram_id AS CHAR) AS person_id,
         u.telegram_id, u.username AS telegram_username, TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS telegram_name,
         u.full_name, u.phone, u.phone_verified_at,
         u.verified_at IS NOT NULL AS verified, u.verified_at,
         COALESCE(u.broker, d.broker, ch.broker) AS broker,
         IF(u.broker IS NOT NULL, u.verified_email, COALESCE(d.email, ch.email)) AS email,
         IF(u.broker IS NOT NULL, u.elefin_client_id, COALESCE(d.elefin_client_id, ch.elefin_client_id)) AS elefin_client_id,
         IF(u.broker IS NOT NULL, u.xm_login_id, COALESCE(d.xm_login_id, ch.xm_login_id)) AS xm_login_id,
         d.discord_user_id, d.username AS discord_username, d.display_name AS discord_name,
         d.status AS discord_status, d.joined_at AS discord_joined_at, d.action_reason AS discord_reason,
         ch.status AS channel_status, ch.joined_at AS channel_joined_at, ch.action_reason AS channel_reason,
         COALESCE(c.lots, CAST(JSON_EXTRACT(v.details, '$.trading.lots') AS DECIMAL(18,2))) AS lots,
         COALESCE(c.trades, CAST(JSON_EXTRACT(v.details, '$.trading.trades') AS UNSIGNED)) AS trades,
         COALESCE(c.balance, CAST(JSON_EXTRACT(v.details, '$.accounts.balance') AS DECIMAL(18,2))) AS balance,
         COALESCE(c.deposits, CAST(JSON_EXTRACT(v.details, '$.funding.deposits') AS DECIMAL(18,2))) AS deposits,
         IF(c.client_id IS NOT NULL, c.last_trade_at, JSON_UNQUOTE(JSON_EXTRACT(v.details, '$.trading.last_trade_at'))) AS last_trade_at
  ${PEOPLE_FROM}
  LEFT JOIN elefin_clients c ON c.client_id = IF(u.broker IS NOT NULL, u.elefin_client_id, COALESCE(d.elefin_client_id, ch.elefin_client_id))
  LEFT JOIN verification_logs v ON v.id = (
    SELECT MAX(id) FROM verification_logs WHERE telegram_id = u.telegram_id AND result = 'passed' AND broker = 'elefin'
  )`;

// "Show" filter on the Members page.
const SHOW = {
  in_discord: "d.status = 'member'",
  not_in_discord: "(d.status IS NULL OR d.status <> 'member')",
  in_channel: "ch.status = 'member'",
  not_in_channel: "(ch.status IS NULL OR ch.status <> 'member')",
  removed: "(d.status IN ('kicked', 'banned') OR ch.status IN ('kicked', 'banned'))",
  unverified: 'u.verified_at IS NULL',
  elefin: "COALESCE(u.broker, d.broker, ch.broker) = 'elefin'",
  xm: "COALESCE(u.broker, d.broker, ch.broker) = 'xm'",
};

function peopleWhere({ search, show }) {
  const where = [PEOPLE_BASE_WHERE];
  const params = [];
  if (search) {
    const like = `%${search}%`;
    where.push(`(CAST(u.telegram_id AS CHAR) = ? OR u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?
             OR u.full_name LIKE ? OR u.phone LIKE ?
             OR d.discord_user_id = ? OR d.username LIKE ? OR d.display_name LIKE ?
             OR COALESCE(u.verified_email, d.email, ch.email) LIKE ? OR COALESCE(u.xm_login_id, d.xm_login_id, ch.xm_login_id) = ?)`);
    params.push(search, like, like, like, like, like, search, like, like, like, search);
  }
  if (SHOW[show]) where.push(SHOW[show]);
  return { sql: `WHERE ${where.join(' AND ')}`, params };
}

const SORT = {
  verified_at: 'COALESCE(u.verified_at, d.joined_at, ch.joined_at)',
  telegram: 'COALESCE(u.full_name, telegram_name)',
  discord: 'discord_name',
  email: 'email',
  lots: 'lots',
  last_trade: 'last_trade_at',
};

export async function listPeople({ search = '', show = '', page = 1, pageSize = 25, sort = 'verified_at', dir = 'desc' } = {}) {
  const { sql, params } = peopleWhere({ search, show });
  const limit = Math.min(Math.max(Number(pageSize) || 25, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const order = `${SORT[sort] ?? SORT.verified_at} ${dir === 'asc' ? 'ASC' : 'DESC'}`;

  const [rows, [{ total }]] = await Promise.all([
    query(`${PEOPLE_SELECT} ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]),
    query(`SELECT COUNT(*) AS total ${PEOPLE_FROM} ${sql}`, params),
  ]);
  return { rows: rows.map(normalizePerson), total: Number(total), page: Math.max(Number(page) || 1, 1), pageSize: limit };
}

export async function exportPeople(filters = {}) {
  const { sql, params } = peopleWhere(filters);
  return (await query(`${PEOPLE_SELECT} ${sql} ORDER BY ${SORT.verified_at} DESC`, params)).map(normalizePerson);
}

const normalizePerson = (r) => ({ ...r, verified: Boolean(Number(r.verified)) });

/** Which places are switched on (for showing/hiding columns). */
export async function getJoinPlaces() {
  const rows = await query(
    "SELECT `key`, `value` FROM settings WHERE `key` IN ('discord_enabled', 'telegram_channel_enabled', 'elefin_enabled', 'xm_enabled')",
  );
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    discord: (v.discord_enabled ?? '1') === '1',
    channel: v.telegram_channel_enabled === '1',
    elefin: (v.elefin_enabled ?? '1') === '1',
    xm: v.xm_enabled === '1',
  };
}

export async function getStats() {
  const [[members], [channel], [users], [verifications]] = await Promise.all([
    query(`SELECT
             SUM(status = 'member') AS active,
             SUM(status = 'member' AND telegram_id IS NOT NULL) AS linked,
             SUM(status = 'left') AS left_count,
             SUM(status = 'kicked') AS kicked,
             SUM(status = 'banned') AS banned
           FROM discord_members`),
    query(`SELECT
             SUM(status = 'member') AS active,
             SUM(status = 'kicked') AS kicked,
             SUM(status = 'banned') AS banned
           FROM channel_members`),
    query('SELECT COUNT(*) AS total, SUM(verified_at IS NOT NULL) AS verified FROM tg_users'),
    query(`SELECT
             SUM(result = 'passed') AS passed,
             SUM(result = 'failed') AS failed,
             SUM(result = 'not_found') AS not_found
           FROM verification_logs WHERE created_at > UTC_TIMESTAMP() - INTERVAL 7 DAY`),
  ]);
  const n = (v) => Number(v ?? 0);
  return {
    members: { active: n(members.active), linked: n(members.linked), left: n(members.left_count), kicked: n(members.kicked), banned: n(members.banned) },
    channel: { active: n(channel.active), kicked: n(channel.kicked), banned: n(channel.banned) },
    users: { total: n(users.total), verified: n(users.verified) },
    last7d: { passed: n(verifications.passed), failed: n(verifications.failed), notFound: n(verifications.not_found) },
  };
}

export async function getRecentVerifications(limit = 8) {
  return query(
    `SELECT v.id, v.telegram_id, v.broker, v.email, v.result, v.created_at, u.username AS telegram_username
     FROM verification_logs v LEFT JOIN tg_users u ON u.telegram_id = v.telegram_id
     ORDER BY v.id DESC LIMIT ?`,
    [limit],
  );
}

// ---------- inactivity cleanup ----------
// Everyone currently in the Discord server or the Telegram channel who joined with the
// given broker, one row per broker account, with where they are.
const ACCOUNT = { elefin: 'elefin_client_id', xm: 'xm_login_id' };
const peopleOf = (broker) => {
  const col = ACCOUNT[broker];
  if (!col) throw new Error(`Unknown broker ${broker}`);
  const where = `status = 'member' AND broker = '${broker}' AND ${col} IS NOT NULL`;
  return `
  SELECT p.${col}, MAX(p.telegram_id) AS telegram_id, MAX(p.email) AS email,
         MAX(p.discord_user_id) AS discord_user_id, MAX(p.discord_username) AS discord_username,
         MAX(p.in_channel) AS in_channel
  FROM (
    SELECT ${col}, telegram_id, email, discord_user_id, username AS discord_username, 0 AS in_channel
    FROM discord_members WHERE ${where}
    UNION ALL
    SELECT ${col}, telegram_id, email, NULL, NULL, 1
    FROM channel_members WHERE ${where}
  ) p
  GROUP BY p.${col}`;
};
const PEOPLE = peopleOf('elefin');

/**
 * People (in either place) who haven't traded in the last `days` days (never traded
 * counts too), based on the sync that started at `syncedAt`. With `includeMissing`,
 * also returns people whose Elefin client wasn't in that sync.
 */
export async function findInactiveMembers({ days, syncedAt, includeMissing = false }) {
  return query(
    `SELECT people.*, u.username AS telegram_username, TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS telegram_name,
            u.full_name, u.phone, u.phone_verified_at,
            c.lots, c.trades, c.balance, c.deposits, c.last_trade_at,
            (c.client_id IS NULL OR c.synced_at < ?) AS missing
     FROM (${PEOPLE}) people
     LEFT JOIN tg_users u ON u.telegram_id = people.telegram_id
     LEFT JOIN elefin_clients c ON c.client_id = people.elefin_client_id
     WHERE (c.synced_at >= ? AND (c.last_trade_at IS NULL OR c.last_trade_at < UTC_TIMESTAMP() - INTERVAL ? DAY))
        OR (? AND (c.client_id IS NULL OR c.synced_at < ?))
     ORDER BY missing DESC, c.last_trade_at IS NULL DESC, c.last_trade_at ASC`,
    [syncedAt, syncedAt, days, includeMissing ? 1 : 0, syncedAt],
  );
}

export async function countLinkedActiveMembers(broker = 'elefin') {
  const [r] = await query(`SELECT COUNT(*) AS n FROM (${peopleOf(broker)}) people`);
  return Number(r.n);
}

/** XM members currently in the Discord server or Telegram channel (activity comes from the XM API). */
export async function listXmMembers() {
  return query(
    `SELECT people.*, u.username AS telegram_username, TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS telegram_name,
            u.full_name, u.phone, u.phone_verified_at
     FROM (${peopleOf('xm')}) people
     LEFT JOIN tg_users u ON u.telegram_id = people.telegram_id`,
  );
}

// ---------- settings ----------
export async function getAllSettings() {
  return query('SELECT `key`, `value`, description, updated_at FROM settings ORDER BY `key`');
}

/** All settings for the admin panel, values shown as stored. */
// Write-only settings: never sent to the browser. The panel only learns whether one is set.
export const SECRET_SETTINGS = new Set(['elefin_token', 'xm_api_token', 'telegram_gateway_token']);

export async function getSettingsForAdmin() {
  const rows = await getAllSettings();
  return rows.map(({ key, value, description }) =>
    SECRET_SETTINGS.has(key)
      ? { key, value: '', description, secret: true, isSet: Boolean(value) }
      : { key, value: value ?? '', description },
  );
}

/** Personal channel links belong to one channel; drop them when the channel changes. */
export async function clearChannelInvites() {
  await query('UPDATE tg_users SET channel_invite_link = NULL, channel_invite_expires_at = NULL WHERE channel_invite_link IS NOT NULL');
}

export async function updateSettings(values) {
  for (const [key, value] of Object.entries(values)) {
    await query('UPDATE settings SET `value` = ? WHERE `key` = ?', [String(value ?? ''), key]);
  }
}

export async function getAllConditions() {
  return query('SELECT id, condition_key, label, threshold, is_active, sort_order FROM conditions ORDER BY sort_order, id');
}

/** Only the threshold and on/off switch are edited in the panel; labels stay as seeded. */
export async function updateConditions(list) {
  for (const c of list) {
    await query('UPDATE conditions SET threshold = ?, is_active = ? WHERE id = ?', [Number(c.threshold) || 0, c.is_active ? 1 : 0, Number(c.id)]);
  }
}
