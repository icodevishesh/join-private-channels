import { query } from '../db/pool.js';
import { INCIDENT_TYPES, INCIDENT_STATUSES, INCIDENT_SEVERITIES } from '../../lib/incidentTypes.js';

/*
 * Incidents: problems the bot or server ran into, listed on the admin Incidents page.
 * recordIncident never throws, so logging a problem can't cause another one.
 */

export { INCIDENT_TYPES, INCIDENT_STATUSES, INCIDENT_SEVERITIES };

const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

/**
 * @param {{ type: keyof INCIDENT_TYPES, reason?: string, telegramId?: number|string, details?: object, severity?: string }} incident
 */
export async function recordIncident({ type, reason = null, telegramId = null, details = null, severity }) {
  try {
    const sev = INCIDENT_SEVERITIES.includes(severity) ? severity : (INCIDENT_TYPES[type]?.severity ?? 'warning');
    const why = clip(reason, 255);
    const user = telegramId == null ? null : Number(telegramId);
    const json = details ? JSON.stringify(details).slice(0, 60_000) : null;

    // Same open problem again: count it instead of adding a new row.
    const bumped = await query(
      `UPDATE incidents SET occurrences = occurrences + 1, last_seen_at = UTC_TIMESTAMP(), details = COALESCE(?, details)
       WHERE status = 'open' AND type = ? AND reason <=> ? AND telegram_id <=> ?
       ORDER BY id DESC LIMIT 1`,
      [json, type, why, user],
    );
    if (bumped.affectedRows) return;

    await query(
      `INSERT INTO incidents (telegram_id, type, severity, reason, details, last_seen_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [user, type, sev, why, json],
    );
  } catch (err) {
    console.error('[incidents] could not record incident:', err.message);
  }
}
