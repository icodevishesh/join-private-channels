import { pool, query } from './pool.js';
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES, INCIDENT_TYPES } from '../services/incidents.js';

const pick = (value, allowed) => (allowed.includes(value) ? value : '');

/** Incidents for the admin page, with the user's name and a count of similar open ones. */
export async function listIncidents({ status = 'open', type = '', severity = '', page = 1, pageSize = 30 } = {}) {
  const where = [];
  const params = [];
  const s = status === 'all' ? '' : pick(status, INCIDENT_STATUSES) || 'open';
  if (s) { where.push('i.status = ?'); params.push(s); }
  if (pick(type, Object.keys(INCIDENT_TYPES))) { where.push('i.type = ?'); params.push(type); }
  if (pick(severity, INCIDENT_SEVERITIES)) { where.push('i.severity = ?'); params.push(severity); }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(pageSize) || 30, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [rows, [{ total }], counts] = await Promise.all([
    query(
      `SELECT i.*, u.username AS telegram_username, TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS telegram_name,
              u.full_name, u.phone, u.phone_verified_at,
              (SELECT COUNT(*) FROM incidents x
               WHERE x.status = 'open' AND x.type = i.type AND x.telegram_id <=> i.telegram_id AND x.id <> i.id) AS similar_open
       FROM incidents i LEFT JOIN tg_users u ON u.telegram_id = i.telegram_id
       ${sql} ORDER BY COALESCE(i.last_seen_at, i.created_at) DESC, i.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ),
    query(`SELECT COUNT(*) AS total FROM incidents i ${sql}`, params),
    query('SELECT status, COUNT(*) AS n FROM incidents GROUP BY status'),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, similar_open: Number(r.similar_open), details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details })),
    total: Number(total),
    page: Math.max(Number(page) || 1, 1),
    pageSize: limit,
    status: s || 'all',
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
  };
}

export async function countOpenIncidents() {
  const [r] = await query("SELECT COUNT(*) AS n FROM incidents WHERE status = 'open'");
  return Number(r.n);
}

/**
 * Resolve / ignore / reopen one incident. With `applyToSimilar`, every other open
 * incident of the same user and type gets the same treatment.
 */
export async function reviewIncident({ id, status, note, adminName, applyToSimilar }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[incident]] = await conn.query('SELECT id, telegram_id, type FROM incidents WHERE id = ? FOR UPDATE', [id]);
    if (!incident) {
      await conn.rollback();
      return null;
    }
    const similar = applyToSimilar && status !== 'open';
    const target = similar
      ? { sql: "(id = ? OR (type = ? AND telegram_id <=> ? AND status = 'open'))", values: [id, incident.type, incident.telegram_id] }
      : { sql: 'id = ?', values: [id] };

    const [res] =
      status === 'open'
        ? await conn.query(`UPDATE incidents SET status = 'open', resolved_by = NULL, resolution_note = NULL, resolved_at = NULL WHERE ${target.sql}`, target.values)
        : await conn.query(
            `UPDATE incidents SET status = ?, resolved_by = ?, resolution_note = ?, resolved_at = UTC_TIMESTAMP() WHERE ${target.sql}`,
            [status, String(adminName).slice(0, 64), note || null, ...target.values],
          );
    await conn.commit();
    return res.affectedRows;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
