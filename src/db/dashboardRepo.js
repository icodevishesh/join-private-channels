import { query } from './pool.js';

const DAY_MS = 86_400_000;

/** Every UTC day from `days - 1` days ago to today, as YYYY-MM-DD. */
function dayKeys(days) {
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

const toKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/** Counts per day for one SQL query that returns rows of { day, n }, with missing days as 0. */
function fill(keys, rows) {
  const byDay = new Map(rows.map((r) => [toKey(r.day), Number(r.n)]));
  return keys.map((k) => byDay.get(k) ?? 0);
}

/** Everything the dashboard charts need for the last `days` days (UTC). */
export async function getDashboardData(days) {
  const keys = dayKeys(days);
  const since = `${keys[0]} 00:00:00`;

  const [started, verified, discordJoins, channelJoins, results, [funnel]] = await Promise.all([
    query('SELECT DATE(created_at) AS day, COUNT(*) AS n FROM tg_users WHERE created_at >= ? GROUP BY day', [since]),
    query(
      "SELECT DATE(created_at) AS day, COUNT(DISTINCT telegram_id) AS n FROM verification_logs WHERE result = 'passed' AND created_at >= ? GROUP BY day",
      [since],
    ),
    query('SELECT DATE(joined_at) AS day, COUNT(*) AS n FROM discord_members WHERE telegram_id IS NOT NULL AND joined_at >= ? GROUP BY day', [since]),
    query('SELECT DATE(joined_at) AS day, COUNT(*) AS n FROM channel_members WHERE broker IS NOT NULL AND joined_at >= ? GROUP BY day', [since]),
    query('SELECT result, COUNT(*) AS n FROM verification_logs WHERE created_at >= ? GROUP BY result', [since]),
    query(
      `SELECT
         (SELECT COUNT(*) FROM tg_users WHERE created_at >= ?) AS started,
         (SELECT COUNT(DISTINCT telegram_id) FROM verification_logs WHERE created_at >= ?) AS checked,
         (SELECT COUNT(DISTINCT telegram_id) FROM verification_logs WHERE result = 'passed' AND created_at >= ?) AS verified,
         (SELECT COUNT(*) FROM discord_members WHERE telegram_id IS NOT NULL AND joined_at >= ?) AS joined_discord,
         (SELECT COUNT(*) FROM channel_members WHERE broker IS NOT NULL AND joined_at >= ?) AS joined_channel`,
      [since, since, since, since, since],
    ),
  ]);

  const resultCounts = Object.fromEntries(results.map((r) => [r.result, Number(r.n)]));
  return {
    days,
    labels: keys,
    activity: { started: fill(keys, started), verified: fill(keys, verified) },
    joins: { discord: fill(keys, discordJoins), channel: fill(keys, channelJoins) },
    results: [
      { key: 'passed', label: 'Passed', value: resultCounts.passed ?? 0 },
      { key: 'failed', label: 'Requirements not met', value: resultCounts.failed ?? 0 },
      { key: 'not_found', label: 'Not affiliated', value: resultCounts.not_found ?? 0 },
      { key: 'taken', label: 'Account already linked', value: resultCounts.taken ?? 0 },
      { key: 'error', label: 'Error', value: resultCounts.error ?? 0 },
    ],
    funnel: [
      { label: 'Started the bot', value: Number(funnel.started) },
      { label: 'Checked an account', value: Number(funnel.checked) },
      { label: 'Verified', value: Number(funnel.verified) },
      { label: 'Joined Discord', value: Number(funnel.joined_discord) },
      { label: 'Joined Telegram channel', value: Number(funnel.joined_channel) },
    ],
  };
}

/**
 * Per-broker numbers for the dashboard: who is verified and in right now, plus the
 * checks in the last `days` days (pass rate, verified per day).
 */
export async function getBrokerDashboard(days) {
  const keys = dayKeys(days);
  const since = `${keys[0]} 00:00:00`;

  const [verified, joined, checks, perDay] = await Promise.all([
    query('SELECT broker, COUNT(*) AS n FROM tg_users WHERE verified_at IS NOT NULL AND broker IS NOT NULL GROUP BY broker'),
    query(
      `SELECT broker, SUM(src = 'd') AS discord, SUM(src = 'c') AS channel FROM (
         SELECT broker, 'd' AS src FROM discord_members WHERE status = 'member' AND broker IS NOT NULL
         UNION ALL
         SELECT broker, 'c' FROM channel_members WHERE status = 'member' AND broker IS NOT NULL
       ) m GROUP BY broker`,
    ),
    query(
      `SELECT broker, COUNT(*) AS checks, COUNT(DISTINCT telegram_id) AS people,
              COUNT(DISTINCT IF(result = 'passed', telegram_id, NULL)) AS passed,
              SUM(result = 'not_found') AS not_found, SUM(result = 'failed') AS failed, SUM(result = 'error') AS errors
       FROM verification_logs WHERE created_at >= ? GROUP BY broker`,
      [since],
    ),
    query(
      `SELECT broker, DATE(created_at) AS day, COUNT(DISTINCT telegram_id) AS n
       FROM verification_logs WHERE result = 'passed' AND created_at >= ? GROUP BY broker, day`,
      [since],
    ),
  ]);

  const find = (rows, id) => rows.find((r) => r.broker === id) ?? {};
  const brokers = Object.fromEntries(
    ['elefin', 'xm'].map((id) => {
      const c = find(checks, id);
      const j = find(joined, id);
      const people = Number(c.people ?? 0);
      const passed = Number(c.passed ?? 0);
      return [
        id,
        {
          verified: Number(find(verified, id).n ?? 0),
          inDiscord: Number(j.discord ?? 0),
          inChannel: Number(j.channel ?? 0),
          checks: Number(c.checks ?? 0),
          people,
          passed,
          notAffiliated: Number(c.not_found ?? 0),
          failed: Number(c.failed ?? 0),
          errors: Number(c.errors ?? 0),
          passRate: people ? Math.round((passed / people) * 100) : null,
          verifiedPerDay: fill(keys, perDay.filter((r) => r.broker === id)),
        },
      ];
    }),
  );
  return { labels: keys, brokers };
}
