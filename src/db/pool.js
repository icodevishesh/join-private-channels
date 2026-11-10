import mysql from 'mysql2/promise';
import { config } from '../config.js';

// Reused across Next.js hot reloads so dev mode doesn't open a new pool on every edit.
export const pool = (globalThis.__tgdcPool ??= mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  // The DB is remote and drops idle connections; keep them alive and recycle idle ones
  // so queries don't fail with ECONNRESET.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  maxIdle: 5,
  idleTimeout: 60_000,
  charset: 'utf8mb4',
  timezone: 'Z',
}));

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}
