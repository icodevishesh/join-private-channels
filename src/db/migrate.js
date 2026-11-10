import { pathToFileURL } from 'node:url';
import { pool, query } from './pool.js';
import { config } from '../config.js';
import { tables, defaultSettings, defaultConditions, obsoleteSettings } from './schema.js';
import { DISCORD_SETTINGS } from '../services/discordSettings.js';

const q = (name) => `\`${name.replace(/`/g, '``')}\``;

function createTableSql(name, def) {
  const parts = Object.entries(def.columns).map(([col, type]) => `${q(col)} ${type}`);
  if (def.primaryKey) parts.push(`PRIMARY KEY (${def.primaryKey.map(q).join(', ')})`);
  for (const [idx, { columns, unique }] of Object.entries(def.indexes || {})) {
    parts.push(`${unique ? 'UNIQUE ' : ''}KEY ${q(idx)} (${columns.map(q).join(', ')})`);
  }
  return `CREATE TABLE IF NOT EXISTS ${q(name)} (\n  ${parts.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

export async function migrate({ log = console.log } = {}) {
  const db = config.db.database;

  // Read the whole current schema in three queries (the DB may be remote, so avoid round trips).
  const [tableRows, columnRows, indexRows] = await Promise.all([
    query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [db]),
    query('SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?', [db]),
    query('SELECT DISTINCT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?', [db]),
  ]);
  const existingTables = new Set(tableRows.map((r) => r.TABLE_NAME));
  const namesByTable = (rows, key) => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.TABLE_NAME)) map.set(r.TABLE_NAME, new Set());
      map.get(r.TABLE_NAME).add(r[key]);
    }
    return map;
  };
  const columnsByTable = namesByTable(columnRows, 'COLUMN_NAME');
  const indexesByTable = namesByTable(indexRows, 'INDEX_NAME');

  for (const [name, def] of Object.entries(tables)) {
    if (!existingTables.has(name)) {
      await query(createTableSql(name, def));
      log(`[migrate] created table ${name}`);
      continue;
    }

    // Add missing columns, keeping the declared order.
    const existingCols = columnsByTable.get(name) ?? new Set();
    let prev = null;
    for (const [col, type] of Object.entries(def.columns)) {
      if (!existingCols.has(col)) {
        const position = prev ? `AFTER ${q(prev)}` : 'FIRST';
        await query(`ALTER TABLE ${q(name)} ADD COLUMN ${q(col)} ${type} ${position}`);
        log(`[migrate] added column ${name}.${col}`);
      }
      prev = col;
    }

    // Add missing indexes.
    const existingIdx = indexesByTable.get(name) ?? new Set();
    for (const [idx, { columns, unique }] of Object.entries(def.indexes || {})) {
      if (!existingIdx.has(idx)) {
        await query(
          `ALTER TABLE ${q(name)} ADD ${unique ? 'UNIQUE ' : ''}INDEX ${q(idx)} (${columns.map(q).join(', ')})`,
        );
        log(`[migrate] added index ${name}.${idx}`);
      }
    }
  }

  // Seed defaults without overwriting anything already configured.
  await query('INSERT INTO settings (`key`, `value`, description) VALUES ? ON DUPLICATE KEY UPDATE description = VALUES(description)', [
    defaultSettings.map((s) => [s.key, s.value, s.description]),
  ]);
  if (obsoleteSettings.length) {
    await query('DELETE FROM settings WHERE `key` IN (?)', [obsoleteSettings]);
  }
  // Copy values still kept in .env into the database once, so they can be managed in the admin panel.
  const envSeeds = [
    ['elefin_token', config.elefinTokenSeed],
    ['public_url', process.env.PUBLIC_URL?.replace(/\/+$/, '')],
    ...Object.values(DISCORD_SETTINGS).map(({ key, env }) => [key, process.env[env]]),
  ];
  for (const [key, value] of envSeeds) {
    if (!value) continue;
    const res = await query(
      "UPDATE settings SET `value` = ? WHERE `key` = ? AND (`value` IS NULL OR `value` = '')",
      [value.trim(), key],
    );
    if (res.affectedRows) log(`[migrate] copied ${key} from .env into settings`);
  }
  await query('INSERT IGNORE INTO conditions (condition_key, label, threshold, is_active, sort_order) VALUES ?', [
    defaultConditions.map((c) => [c.condition_key, c.label, c.threshold, 0, c.sort_order]),
  ]);

  // Rows from before XM support were all Elefin.
  await query("UPDATE tg_users SET broker = 'elefin' WHERE broker IS NULL AND verified_email IS NOT NULL");
  await query("UPDATE discord_members SET broker = 'elefin' WHERE broker IS NULL AND elefin_client_id IS NOT NULL");
  await query("UPDATE channel_members SET broker = 'elefin' WHERE broker IS NULL AND elefin_client_id IS NOT NULL");

  log('[migrate] schema is up to date');
}

// Allow `npm run migrate`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
