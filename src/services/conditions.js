const DAY_MS = 24 * 60 * 60 * 1000;

const fmtMoney = (n, currency = 'USD') => `${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
const fmtNum = (n) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// Each evaluator returns { passed, actual } where `actual` is a human-readable value.
const evaluators = {
  min_deposit(client, threshold) {
    const v = Number(client.funding?.deposits ?? 0);
    return { passed: v >= threshold, actual: fmtMoney(v, client.funding?.currency) };
  },
  min_balance(client, threshold) {
    const v = Number(client.accounts?.balance ?? 0);
    return { passed: v >= threshold, actual: fmtMoney(v, client.funding?.currency) };
  },
  min_lots(client, threshold) {
    const v = Number(client.trading?.lots ?? 0);
    return { passed: v >= threshold, actual: `${fmtNum(v)} lots` };
  },
  min_trades(client, threshold) {
    const v = Number(client.trading?.trades ?? 0);
    return { passed: v >= threshold, actual: `${fmtNum(v)} trades` };
  },
  last_trade_within_days(client, threshold) {
    const last = client.trading?.last_trade_at ? new Date(client.trading.last_trade_at) : null;
    if (!last || Number.isNaN(last.getTime())) return { passed: false, actual: 'no trades yet' };
    const days = Math.floor((Date.now() - last.getTime()) / DAY_MS);
    const actual = days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`;
    return { passed: days <= threshold, actual };
  },
};

/**
 * Evaluates all active conditions from the DB against an Elefin client.
 * @returns {{ passed: boolean, results: Array<{ key, label, passed, actual }> }}
 */
export function evaluateConditions(client, conditions) {
  const results = conditions.map((c) => {
    const threshold = Number(c.threshold);
    const label = c.label.replace(/\{\{\s*value\s*\}\}/g, fmtNum(threshold));
    const evaluator = evaluators[c.condition_key];
    if (!evaluator) {
      return { key: c.condition_key, label, passed: false, actual: 'unknown condition type' };
    }
    return { key: c.condition_key, label, ...evaluator(client, threshold) };
  });
  return { passed: results.every((r) => r.passed), results };
}

export const supportedConditionKeys = Object.keys(evaluators);
