import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/dashboard/StatCard';
import BrokerCard from '@/components/dashboard/BrokerCard';
import { BROKERS, BROKER_IDS } from '@/lib/brokers';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { BarChart, HBars, Legend, LineChart } from '@/components/dashboard/Charts';
import { SERIES } from '@/lib/chartColors';
import { getStats, getRecentVerifications, getJoinPlaces } from '@/src/db/adminRepo.js';
import { getDashboardData, getBrokerDashboard } from '@/src/db/dashboardRepo.js';
import { countOpenIncidents } from '@/src/db/incidentsRepo.js';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Dashboard · Spaceship' };

const RANGES = [7, 14, 30, 90];
const resultTone = { passed: 'green', failed: 'amber', not_found: 'zinc', taken: 'red', error: 'red' };
const resultLabel = { passed: 'Passed', failed: 'Requirements not met', not_found: 'Not affiliated', taken: 'Already linked', error: 'Error' };
const sum = (a) => a.reduce((t, v) => t + v, 0);

export default async function DashboardPage({ searchParams }) {
  const { days: rawDays } = await searchParams;
  const days = RANGES.includes(Number(rawDays)) ? Number(rawDays) : 14;
  const [stats, recent, chart, openIncidents, brokers, places] = await Promise.all([
    getStats(),
    getRecentVerifications(6),
    getDashboardData(days),
    countOpenIncidents().catch(() => 0),
    getBrokerDashboard(days),
    getJoinPlaces(),
  ]);
  const byBroker = BROKER_IDS.map((id, i) => ({ label: BROKERS[id].label, values: brokers.brokers[id].verifiedPerDay, color: SERIES[i] }));

  const activity = [
    { label: 'Started the bot', values: chart.activity.started, color: SERIES[0] },
    { label: 'Verified', values: chart.activity.verified, color: SERIES[1] },
  ];
  const joins = [
    { label: 'Discord', values: chart.joins.discord, color: SERIES[0] },
    { label: 'Telegram channel', values: chart.joins.channel, color: SERIES[1] },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your Discord server, Telegram channel, brokers and verifications at a glance"
        actions={
          <div className="inline-flex rounded-lg bg-zinc-100 p-1" role="tablist" aria-label="Time range">
            {RANGES.map((d) => (
              <Link
                key={d}
                href={`/admin?days=${d}`}
                role="tab"
                aria-selected={d === days}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  d === days ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Discord members"
          value={stats.members.active}
          hint={`${stats.members.linked} verified · ${stats.members.kicked} kicked · ${stats.members.banned} banned`}
          icon="plug"
          href="/admin/members?show=in_discord"
        />
        <StatCard
          label="Telegram channel"
          value={stats.channel.active}
          hint={`${stats.channel.kicked} kicked · ${stats.channel.banned} banned`}
          icon="send"
          href="/admin/members?show=in_channel"
        />
        <StatCard label="Verified users" value={stats.users.verified} hint={`${stats.users.total} started the bot`} icon="shieldCheck" tone="green" href="/admin/members" />
        <StatCard
          label={`Verified (${days} days)`}
          value={sum(chart.activity.verified)}
          hint={`${sum(chart.activity.started)} new users in the same period`}
          icon="users"
          tone="green"
        />
        <StatCard
          label="Open incidents"
          value={openIncidents}
          hint={openIncidents ? 'Needs a look' : 'All clear'}
          icon="alert"
          tone={openIncidents ? 'amber' : 'zinc'}
          href="/admin/incidents"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="New users vs verified" description={`Per day, last ${days} days (UTC)`} />
          <div className="space-y-3 px-4 py-3 sm:px-5">
            <Legend items={activity.map((s) => ({ ...s, total: sum(s.values) }))} />
            <LineChart labels={chart.labels} series={activity} ariaLabel={`New users and verified users per day, last ${days} days`} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Joins" description={`New members per day through the bot, last ${days} days (UTC)`} />
          <div className="space-y-3 px-4 py-3 sm:px-5">
            <Legend items={joins.map((s) => ({ ...s, total: sum(s.values) }))} />
            <BarChart labels={chart.labels} series={joins} ariaLabel={`Discord and Telegram channel joins per day, last ${days} days`} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {BROKER_IDS.map((id, i) => (
          <BrokerCard key={id} id={id} label={BROKERS[id].label} enabled={places[id]} stats={brokers.brokers[id]} days={days} color={SERIES[i]} />
        ))}
        <Card>
          <CardHeader title="Verified by broker" description={`Per day, last ${days} days (UTC)`} />
          <div className="space-y-3 px-4 py-3 sm:px-5">
            <Legend items={byBroker.map((s) => ({ ...s, total: sum(s.values) }))} />
            <LineChart labels={brokers.labels} series={byBroker} ariaLabel={`Verified users per day by broker, last ${days} days`} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Join funnel" description={`Last ${days} days · % of people who started the bot`} />
          <div className="px-4 py-3 sm:px-5">
            <HBars items={chart.funnel} showShare />
          </div>
        </Card>
        <Card>
          <CardHeader title="Verification results" description={`Every account check (Elefin and XM), last ${days} days`} />
          <div className="px-4 py-3 sm:px-5">
            <HBars items={chart.results} color={SERIES[1]} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Recent verifications"
            actions={
              <Link href="/admin/members" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                Members →
              </Link>
            }
          />
          {recent.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-zinc-500">No verifications yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {recent.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{v.broker === 'xm' ? `XM · MT5 #${v.email}` : v.email}</p>
                    <p className="text-xs text-zinc-500">
                      {v.telegram_username ? `@${v.telegram_username}` : `TG ${v.telegram_id}`} · {formatDate(v.created_at)}
                    </p>
                  </div>
                  <Badge tone={resultTone[v.result]}>{resultLabel[v.result] ?? v.result}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
