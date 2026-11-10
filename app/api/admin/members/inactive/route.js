import { requireAdminApi } from '@/lib/auth';
import { recordIncident } from '@/src/services/incidents.js';
import { findInactiveMembers, countLinkedActiveMembers, listXmMembers } from '@/src/db/adminRepo.js';
import { syncElefinClients } from '@/src/services/elefinSync.js';
import { getXmSettings, xmActivity, xmBalances, XM_MAX_DAYS } from '@/src/services/xm.js';

export const dynamic = 'force-dynamic';

const bad = (error, status = 400) => Response.json({ error }, { status });

/**
 * POST { broker: 'elefin' | 'xm', days: number, includeMissing?: boolean, includeLowBalance?: boolean }
 * Returns people who joined with that broker and have no trades in the last `days` days.
 * Nothing is kicked here.
 * - Elefin: downloads the full client list (200 per page) first.
 * - XM: asks the XM API for the trades of those accounts (50 accounts / 93 days per request).
 */
export async function POST(request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { broker = 'elefin', days, includeMissing, includeLowBalance } = await request.json().catch(() => ({}));
  const d = Number(days);
  const maxDays = broker === 'xm' ? XM_MAX_DAYS : 3650;
  if (!Number.isInteger(d) || d < 1 || d > maxDays) return bad(`Days must be a whole number between 1 and ${maxDays}`);

  if (broker === 'xm') return findInactiveXm(d, Boolean(includeLowBalance));
  if (broker !== 'elefin') return bad('Unknown broker');

  let sync;
  try {
    sync = await syncElefinClients();
  } catch (err) {
    await recordIncident({ type: 'elefin_sync_failed', reason: err.message });
    return bad(`Could not download Elefin clients: ${err.message}`, 502);
  }

  const [members, linked] = await Promise.all([
    findInactiveMembers({ days: d, syncedAt: sync.startedAt, includeMissing: Boolean(includeMissing) }),
    countLinkedActiveMembers('elefin'),
  ]);

  return Response.json({
    broker: 'elefin',
    syncedAt: sync.startedAt,
    clientsSynced: sync.count,
    linkedMembers: linked,
    members: members.map((m) => ({
      ...m,
      key: `elefin:${m.elefin_client_id}`,
      missing: Boolean(Number(m.missing)),
      in_channel: Boolean(Number(m.in_channel)),
    })),
  });
}

async function findInactiveXm(days, includeLowBalance) {
  const s = await getXmSettings();
  if (!s.xm_api_token) return bad('The XM API token isn’t set. Add it on the Brokers page.');

  const people = await listXmMembers();
  const ids = people.map((p) => String(p.xm_login_id));
  let activity;
  let balance = null;
  try {
    activity = await xmActivity(ids, days, s);
    if (includeLowBalance) balance = await xmBalances(ids, s);
  } catch (err) {
    await recordIncident({ type: 'xm_api_error', reason: `Inactivity check: ${err.message}` });
    return bad(`Could not load XM trades: ${err.message}`, 502);
  }

  const members = people
    .map((p) => {
      const id = String(p.xm_login_id);
      const a = activity[id];
      return {
        ...p,
        key: `xm:${id}`,
        in_channel: Boolean(Number(p.in_channel)),
        last_trade_at: a.lastTradeAt,
        lots: a.lots,
        trades: a.trades,
        // XM only says whether the balance is above the threshold agreed with it.
        balance_ok: balance ? (balance[id] ?? false) : null,
      };
    })
    .filter((m) => !m.last_trade_at || m.balance_ok === false)
    .sort((a, b) => (a.last_trade_at ?? '').localeCompare(b.last_trade_at ?? ''));

  return Response.json({ broker: 'xm', checkedAt: new Date(), linkedMembers: people.length, members });
}
