import { getSettings } from '../db/repo.js';

/*
 * XM partners API, authenticated with "Authorization: Bearer <token>".
 * - GET /traders/{loginId}                     one account: is it under our partner link? (404 = no)
 * - GET /trader-statistics/trades?startTime&endTime[&traderIds=1,2,3]
 *                                              trades of our clients; at most 93 days per request
 * - GET /trader-balance?traderIds=1,2,3        balance above/below the threshold agreed with XM
 * XM doesn't expose emails or deposit history, so XM users verify with their MT5 account ID.
 */

export class XmError extends Error {}

const SETTING_KEYS = ['xm_api_base', 'xm_api_token', 'xm_min_lots', 'xm_lots_window_days', 'xm_reject_archived', 'xm_require_balance', 'xm_signup_url', 'xm_enabled'];

/** XM allows at most this many days between startTime and endTime. */
const MAX_WINDOW_DAYS = 92;
/** Accounts per trades/balance request, to keep URLs short. */
export const XM_IDS_PER_REQUEST = 50;
/** Longest activity window we query (several 93-day requests). */
export const XM_MAX_DAYS = 365;

export const isLoginId = (v) => /^\d{5,12}$/.test(String(v ?? ''));

export async function getXmSettings() {
  const s = await getSettings(SETTING_KEYS);
  return { ...s, xm_api_base: s.xm_api_base || 'https://mypartners.xm.com/api' };
}

async function xmGet(s, path) {
  if (!s.xm_api_token) throw new XmError('The XM API token isn’t set (admin panel → Brokers → XM)');
  const base = s.xm_api_base.replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${s.xm_api_token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new XmError(`Could not reach the XM API: ${err.message}`);
  }
  // A 401 on /traders/{id} means "not ours"; on the statistics endpoints it means a bad token.
  if (res.status === 401 && !path.startsWith('/traders/')) throw new XmError('The XM API rejected the token (HTTP 401)');
  const body = res.ok ? await res.json().catch(() => null) : null;
  return { status: res.status, body };
}

/** One account, or null when it isn't under our partner link (XM answers 401/404). */
export async function lookupXmTrader(loginId, s) {
  const r = await xmGet(s, `/traders/${encodeURIComponent(loginId)}`);
  if (r.status === 404 || r.status === 401) return null;
  if (r.status !== 200 || !r.body) throw new XmError(`XM trader lookup failed (HTTP ${r.status})`);
  return r.body;
}

const ymd = (d) => d.toISOString().slice(0, 10);
// XM timestamps have no timezone; treat them as UTC.
const parseXmTime = (t) => (t ? Date.parse(/Z|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`) : NaN);

/**
 * Trading activity of the given accounts over the last `days` days (max 365), in 93-day
 * requests of up to 50 accounts each. Returns { [loginId]: { lastTradeAt, lots, trades } };
 * accounts with no trades get { lastTradeAt: null, lots: 0, trades: 0 }.
 */
export async function xmActivity(loginIds, days, s) {
  const span = Math.min(Math.max(1, Math.floor(days)), XM_MAX_DAYS);
  const out = {};
  for (const id of loginIds) out[id] = { lastTradeAt: null, lots: 0, trades: 0 };
  if (!loginIds.length) return out;

  const end = new Date();
  const earliest = new Date(end.getTime() - span * 86_400_000);
  for (let i = 0; i < loginIds.length; i += XM_IDS_PER_REQUEST) {
    const ids = loginIds.slice(i, i + XM_IDS_PER_REQUEST);
    let windowEnd = end;
    while (windowEnd > earliest) {
      const windowStart = new Date(Math.max(earliest.getTime(), windowEnd.getTime() - MAX_WINDOW_DAYS * 86_400_000));
      const q = `startTime=${ymd(windowStart)}&endTime=${ymd(windowEnd)}&traderIds=${ids.join(',')}`;
      const r = await xmGet(s, `/trader-statistics/trades?${q}`);
      if (r.status === 404) {
        // No trades for these accounts in this window.
      } else if (r.status !== 200 || !Array.isArray(r.body)) {
        throw new XmError(`XM trade statistics failed (HTTP ${r.status})`);
      } else {
        for (const t of r.body) {
          const a = out[String(t.loginId)];
          if (!a) continue;
          const when = parseXmTime(t.closeTime) || parseXmTime(t.openTime);
          if (Number.isFinite(when) && when < earliest.getTime()) continue; // the API is day-granular; trim to the exact window
          a.trades++;
          a.lots += Number(t.lots) || 0;
          if (Number.isFinite(when) && (!a.lastTradeAt || when > Date.parse(a.lastTradeAt))) a.lastTradeAt = new Date(when).toISOString();
        }
      }
      windowEnd = new Date(windowStart.getTime() - 86_400_000);
    }
  }
  for (const a of Object.values(out)) a.lots = Math.round(a.lots * 100) / 100;
  return out;
}

/** Balance-over-threshold flags, { [loginId]: boolean } (accounts XM doesn't return are left out). */
export async function xmBalances(loginIds, s) {
  const out = {};
  for (let i = 0; i < loginIds.length; i += XM_IDS_PER_REQUEST) {
    const ids = loginIds.slice(i, i + XM_IDS_PER_REQUEST);
    const r = await xmGet(s, `/trader-balance?traderIds=${ids.join(',')}`);
    if (r.status === 404) continue;
    if (r.status !== 200 || !Array.isArray(r.body)) throw new XmError(`XM balance check failed (HTTP ${r.status})`);
    for (const b of r.body) out[String(b.loginId)] = Boolean(b.balanceOverThreshold);
  }
  return out;
}

const fmtNum = (n) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * Full eligibility check for one XM account, using the XM settings.
 * Returns { found, trader, activity, results: [{ key, label, passed, actual }], passed }
 * in the same shape as the Elefin join requirements, so the bot shows both the same way.
 */
export async function checkXmAccount(loginId, settings) {
  const s = settings ?? (await getXmSettings());
  const minLots = Math.max(0, Number(s.xm_min_lots) || 0);
  const windowDays = Math.min(Math.max(1, Number(s.xm_lots_window_days) || 90), XM_MAX_DAYS);

  const trader = await lookupXmTrader(loginId, s);
  // "validated" is XM's affiliation flag: a non-validated account isn't under our partner link.
  if (!trader || !trader.validated) return { found: false, trader: null, results: [], passed: false };

  const results = [];
  if (s.xm_reject_archived === '1') {
    results.push({ key: 'not_archived', label: 'XM account is active (not archived)', passed: !trader.archived, actual: trader.archived ? 'archived' : 'active' });
  }
  if (s.xm_require_balance === '1') {
    const ok = (await xmBalances([loginId], s))[loginId] ?? false;
    results.push({ key: 'balance', label: 'Balance above the required level', passed: ok, actual: ok ? 'above' : 'below' });
  }
  let activity = { lastTradeAt: null, lots: 0, trades: 0 };
  if (minLots > 0) {
    activity = (await xmActivity([loginId], windowDays, s))[loginId] ?? activity;
    results.push({
      key: 'min_lots',
      label: `At least ${fmtNum(minLots)} lots traded in the last ${windowDays} days`,
      passed: activity.lots >= minLots,
      actual: `${fmtNum(activity.lots)} lots`,
    });
  }
  return { found: true, trader, activity, results, passed: results.every((r) => r.passed) };
}

/** Quick token check for the admin panel: one day of trade statistics. */
export async function testXmConnection(settings) {
  const s = settings ?? (await getXmSettings());
  const today = ymd(new Date());
  const r = await xmGet(s, `/trader-statistics/trades?startTime=${today}&endTime=${today}`);
  if (r.status !== 200 && r.status !== 404) throw new XmError(`XM API answered HTTP ${r.status}`);
  return { tradesToday: Array.isArray(r.body) ? r.body.length : 0 };
}
