'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { notify } from '../ui/Toast';
import PageHeader from '../ui/PageHeader';
import Pagination from '../ui/Pagination';
import ProgressBar from '../ui/ProgressBar';
import { LoadingBlock } from '../ui/Spinner';
import { Select } from '../ui/Field';
import TelegramUser from '../members/TelegramUser';
import Icon from '../ui/Icon';
import IncidentReviewModal from './IncidentReviewModal';
import { useAdmin } from '../layout/AdminContext';
import { INCIDENT_SEVERITIES, INCIDENT_TYPES } from '@/lib/incidentTypes';
import { formatDate } from '@/lib/format';

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'ignored', label: 'Ignored' },
  { id: 'all', label: 'All' },
];
const SEVERITY_TONE = { error: 'red', warning: 'amber', info: 'zinc' };
const STATUS_TONE = { open: 'amber', resolved: 'green', ignored: 'zinc' };
const th = 'px-3 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-zinc-500 uppercase';

const toQuery = (f) => new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v != null)).toString();

export default function IncidentsView() {
  const { can } = useAdmin();
  const canManage = can('incidents.manage');
  const [filters, setFilters] = useState({ status: 'open', type: '', severity: '', page: 1 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState(null); // { incident, action }
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/incidents?${toQuery(filters)}`, { cache: 'no-store' }).catch(() => null);
    if (res?.status === 401) return window.location.assign('/admin/login');
    if (res?.ok) setData(await res.json());
    else notify({ tone: 'error', text: 'Could not load incidents.' });
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));

  async function reopen(incident) {
    setBusy(incident.id);
    const res = await fetch('/api/admin/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: incident.id, status: 'open' }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(null);
    notify(res?.ok ? { tone: 'success', text: 'Reopened.' } : { tone: 'error', text: body?.error ?? 'Could not reopen.' });
    load();
  }

  const rows = data?.rows ?? [];

  return (
    <>
      <PageHeader title="Incidents" description="Problems the bot ran into, as a to-do list. Resolve or ignore each one with a note." />


      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg bg-zinc-100 p-1" role="tablist" aria-label="Status">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filters.status === t.id}
              onClick={() => update({ status: t.id })}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filters.status === t.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {t.label}
              {t.id !== 'all' && <span className="ml-1.5 text-xs tabular-nums opacity-60">{data?.counts?.[t.id] ?? 0}</span>}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={filters.type} onChange={(e) => update({ type: e.target.value })} aria-label="Type" className="sm:w-56">
            <option value="">All types</option>
            {Object.entries(INCIDENT_TYPES).map(([id, t]) => (
              <option key={id} value={id}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select value={filters.severity} onChange={(e) => update({ severity: e.target.value })} aria-label="Severity" className="sm:w-40">
            <option value="">Any severity</option>
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!canManage && <p className="mb-3 text-sm text-amber-700">View only: your account can’t resolve incidents.</p>}

      <Card>
        <ProgressBar active={loading} />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className={`${th} pl-4 sm:pl-6`}>When</th>
                <th className={th}>Type</th>
                <th className={th}>User</th>
                <th className={th}>What happened</th>
                <th className={th}>Status</th>
                <th className={`${th} pr-4 sm:pr-6`} />
              </tr>
            </thead>
            <tbody className={`divide-y divide-zinc-100 bg-white ${loading && rows.length ? 'opacity-50' : ''}`}>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-zinc-500">
                    {!data && loading ? <LoadingBlock label="Loading incidents…" className="py-4" /> : filters.status === 'open' ? 'Nothing open. 🎉' : 'No incidents here.'}
                  </td>
                </tr>
              )}
              {rows.map((i) => {
                const type = INCIDENT_TYPES[i.type];
                return (
                  <tr key={i.id} className="align-top hover:bg-zinc-50">
                    <td className="py-3 pr-3 pl-4 text-sm whitespace-nowrap text-zinc-600 sm:pl-6">
                      <p>{formatDate(i.last_seen_at ?? i.created_at)}</p>
                      {i.occurrences > 1 && (
                        <p className="text-xs text-zinc-500">
                          ×{i.occurrences} since {formatDate(i.created_at, false)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Badge tone={SEVERITY_TONE[i.severity]}>{type?.label ?? i.type}</Badge>
                      <p className="mt-1 text-xs text-zinc-500 capitalize">{i.severity}</p>
                    </td>
                    <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                      {i.telegram_id ? (
                        <TelegramUser u={i} />
                      ) : (
                        <span className="text-zinc-400">System</span>
                      )}
                    </td>
                    <td className="max-w-md px-3 py-2.5 text-sm text-zinc-700">
                      <p className="break-words">{i.reason ?? '—'}</p>
                      {type?.hint && <p className="mt-0.5 text-xs text-zinc-500">{type.hint}</p>}
                      {i.details && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-800">Details</summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-zinc-50 p-2 text-xs text-zinc-700 ring-1 ring-zinc-200 ring-inset">
                            {JSON.stringify(i.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                      <Badge tone={STATUS_TONE[i.status]}>{i.status[0].toUpperCase() + i.status.slice(1)}</Badge>
                      {i.resolved_by && (
                        <p className="mt-1 text-xs text-zinc-500">
                          {i.resolved_by} · {formatDate(i.resolved_at, false)}
                        </p>
                      )}
                      {i.resolution_note && <p className="mt-0.5 max-w-56 text-xs whitespace-normal text-zinc-500">{i.resolution_note}</p>}
                    </td>
                    <td className="py-3 pr-4 pl-3 whitespace-nowrap sm:pr-6">
                      {canManage &&
                        (i.status === 'open' ? (
                          <div className="flex justify-end gap-1.5">
                            <Button size="row" variant="success" onClick={() => setReview({ incident: i, action: 'resolved' })}>
                              <Icon name="check" className="size-3.5" />
                              Resolve
                            </Button>
                            <Button size="row" variant="secondary" onClick={() => setReview({ incident: i, action: 'ignored' })}>
                              <Icon name="eyeOffSmall" className="size-3.5" />
                              Ignore
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <Button size="row" variant="soft" loading={busy === i.id} onClick={() => reopen(i)}>
                              {busy !== i.id && <Icon name="undo" className="size-3.5" />}
                              Reopen
                            </Button>
                          </div>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={filters.page} pageSize={data?.pageSize ?? 30} total={data?.total ?? 0} onPage={(p) => setFilters((f) => ({ ...f, page: p }))} />
      </Card>

      {review && (
        <IncidentReviewModal
          incident={review.incident}
          action={review.action}
          onClose={() => setReview(null)}
          onDone={(updated) => {
            setReview(null);
            notify({ tone: 'success', text: `${updated} incident${updated === 1 ? '' : 's'} ${review.action}.` });
            load();
          }}
        />
      )}
    </>
  );
}
