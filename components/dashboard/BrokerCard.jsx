import Link from 'next/link';
import Badge from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';

function Metric({ label, value, href }) {
  const body = (
    <>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-zinc-900 tabular-nums">{value}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block px-4 py-3 transition-colors hover:bg-zinc-50 sm:px-5">
      {body}
    </Link>
  ) : (
    <div className="px-4 py-3 sm:px-5">{body}</div>
  );
}

/** One broker's numbers on the dashboard. */
export default function BrokerCard({ id, label, enabled, stats, days, color }) {
  const n = (v) => Number(v).toLocaleString('en-US');
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
            {label}
            <Badge tone={enabled ? 'green' : 'zinc'}>{enabled ? 'On' : 'Off'}</Badge>
          </span>
        }
        actions={
          <Link href="/admin/brokers" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            Manage →
          </Link>
        }
      />
      <div className="grid grid-cols-3 divide-x divide-zinc-100">
        <Metric label="Verified now" value={n(stats.verified)} href={`/admin/members?show=${id}`} />
        <Metric label="In Discord" value={n(stats.inDiscord)} />
        <Metric label="In channel" value={n(stats.inChannel)} />
      </div>
      <div className="grid grid-cols-3 divide-x divide-zinc-100 border-t border-zinc-100">
        <Metric label={`Checks (${days}d)`} value={n(stats.checks)} />
        <Metric label={`Pass rate (${days}d)`} value={stats.passRate === null ? '—' : `${stats.passRate}%`} />
        <Metric label={`Not affiliated (${days}d)`} value={n(stats.notAffiliated)} />
      </div>
    </Card>
  );
}
