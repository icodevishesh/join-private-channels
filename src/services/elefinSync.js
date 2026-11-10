import { query } from '../db/pool.js';
import { fetchAllClients } from './elefin.js';

/*
 * Copies the full Elefin client list into `elefin_clients`.
 * Clients missing from the latest download keep their old `synced_at`, which is how
 * we spot members who are no longer under our partner link.
 */

const toDate = (v) => (v ? new Date(v) : null);
const num = (v) => (v === null || v === undefined ? null : Number(v));

function row(c, syncedAt) {
  return [
    c.client_id,
    c.email?.toLowerCase() ?? null,
    c.name ?? null,
    c.country ?? null,
    c.status ?? null,
    toDate(c.registered_at),
    num(c.funding?.deposits),
    num(c.funding?.net_deposit),
    num(c.accounts?.balance),
    num(c.accounts?.equity),
    num(c.trading?.lots),
    num(c.trading?.trades),
    toDate(c.trading?.last_trade_at),
    c.funding?.is_funded ? 1 : 0,
    JSON.stringify(c),
    syncedAt,
  ];
}

const COLUMNS = 'client_id, email, name, country, status, registered_at, deposits, net_deposit, balance, equity, lots, trades, last_trade_at, is_funded, data, synced_at';
const UPDATE = COLUMNS.split(', ')
  .filter((c) => c !== 'client_id')
  .map((c) => `${c} = VALUES(${c})`)
  .join(', ');

async function runSync() {
  // Whole seconds, so it compares cleanly with the DATETIME column.
  const startedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const clients = await fetchAllClients();

  for (let i = 0; i < clients.length; i += 200) {
    const batch = clients.slice(i, i + 200).map((c) => row(c, startedAt));
    await query(`INSERT INTO elefin_clients (${COLUMNS}) VALUES ? ON DUPLICATE KEY UPDATE ${UPDATE}`, [batch]);
  }

  const durationMs = Date.now() - startedAt.getTime();
  console.log(`[elefin-sync] ${clients.length} clients in ${(durationMs / 1000).toFixed(1)}s`);
  return { startedAt, count: clients.length, durationMs };
}

// Only one sync at a time; callers that arrive mid-sync share its result.
let running = null;

export function syncElefinClients() {
  running ??= runSync().finally(() => {
    running = null;
  });
  return running;
}

export async function getLastSyncAt() {
  const [r] = await query('SELECT MAX(synced_at) AS at FROM elefin_clients');
  return r.at;
}
