'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '../ui/Card';
import Button, { buttonClass } from '../ui/Button';
import Icon from '../ui/Icon';
import { notify } from '../ui/Toast';
import Pagination from '../ui/Pagination';
import PageHeader from '../ui/PageHeader';
import ProgressBar from '../ui/ProgressBar';
import MemberFilters from './MemberFilters';
import PeopleTable from './PeopleTable';
import BulkActionModal from './BulkActionModal';
import { runPersonAction } from './personActions';
import { useAdmin } from '../layout/AdminContext';

const DEFAULT_FILTERS = { search: '', show: '', sort: 'verified_at', dir: 'desc', page: 1, pageSize: 25 };

const toQuery = (filters) =>
  new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString();

const placesText = (places) =>
  [places.discord && 'the Discord server', places.channel && 'the Telegram channel'].filter(Boolean).join(' and ') || 'the community';

const ACTION_BODY = {
  kick: (where) =>
    `They’ll be removed from ${where} (wherever they are) and told on Telegram. They can rejoin by verifying their broker account again in the bot, as long as they meet the join requirements.`,
  ban: (where) => `They’ll be removed from ${where} and can’t join either place again until you allow them.`,
  allow: () => 'Lifts their kick or ban so they can verify again in the Telegram bot and rejoin.',
};

const LINK_BUTTON = buttonClass({ variant: 'soft' });

export default function MembersView({ initialShow = '' }) {
  const { can } = useAdmin();
  const canManage = can('members.manage');
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, show: initialShow });
  const [data, setData] = useState({ rows: [], total: 0, places: { discord: true, channel: false } });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [action, setAction] = useState(null);
  const [progress, setProgress] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/members?${toQuery(filters)}`).catch(() => null);
    if (res?.status === 401) return window.location.assign('/admin/login');
    if (res?.ok) setData(await res.json());
    else notify({ tone: 'error', text: 'Could not load members.' });
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const updateFilters = (patch) => {
    setFilters((f) => ({ ...f, page: 1, ...patch }));
    setSelected(new Set());
  };

  const onSort = (key) => setFilters((f) => ({ ...f, sort: key, dir: f.sort === key && f.dir === 'desc' ? 'asc' : 'desc', page: 1 }));

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = (checked) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const r of data.rows) checked ? next.add(r.person_id) : next.delete(r.person_id);
      return next;
    });

  async function confirm(reason) {
    const people = data.rows.filter((r) => selected.has(r.person_id));
    const result = await runPersonAction({ action, people, places: data.places, reason, onProgress: setProgress });
    setProgress(null);
    setAction(null);

    if (!result.total) notify({ tone: 'info', text: 'Nothing to do: none of the selected people are in a state this action applies to.' });
    else if (result.stopped) notify({ tone: 'error', text: `Stopped early: ${result.stopped}` });
    else if (result.failed.length) {
      notify({ tone: 'error', text: `${result.failed.length} failed: ${result.failed.map((f) => `${f.where} ${f.id} (${f.error})`).join('; ')}` });
    } else notify({ tone: 'success', text: `Done for ${people.length} ${people.length === 1 ? 'person' : 'people'}.` });

    setSelected(new Set());
    load();
  }

  const { page, pageSize, ...exportFilters } = filters;

  return (
    <>
      <PageHeader
        title="Members"
        description="Everyone who verified through the Telegram bot, with where they are now."
        actions={
          <>
            <Link href="/admin/cleanup" className={LINK_BUTTON}>
              <Icon name="userX" />
              Remove inactive
            </Link>
            <a href={`/api/admin/members/export?${toQuery(exportFilters)}`} className={LINK_BUTTON}>
              <Icon name="download" />
              Export CSV
            </a>
          </>
        }
      />


      <Card>
        <MemberFilters filters={filters} places={data.places} onChange={updateFilters} />
        <ProgressBar active={loading} />

        {selected.size > 0 && (
          <div className="flex flex-col gap-2 border-b border-indigo-100 bg-indigo-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm font-medium text-indigo-900">
              {selected.size} selected
              <button type="button" onClick={() => setSelected(new Set())} className="ml-3 text-indigo-600 hover:underline">
                Clear
              </button>
            </p>
            {!canManage ? (
              <p className="text-sm text-indigo-700">Your account can view members but not change them.</p>
            ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAction('allow')}>
                Allow rejoin
              </Button>
              <Button size="sm" variant="danger" onClick={() => setAction('kick')}>
                Kick
              </Button>
              <Button size="sm" variant="danger" onClick={() => setAction('ban')}>
                Ban
              </Button>
            </div>
            )}
          </div>
        )}

        <PeopleTable
          rows={data.rows}
          places={data.places}
          loading={loading}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          sort={filters.sort}
          dir={filters.dir}
          onSort={onSort}
        />

        <Pagination page={filters.page} pageSize={filters.pageSize} total={data.total} onPage={(p) => setFilters((f) => ({ ...f, page: p }))} />
      </Card>

      <p className="mt-3 text-xs text-zinc-500">
        Click a name to see their details and open their Discord or Telegram profile. Only people who came through the bot are listed.
        <br />* Elefin activity is from the latest Elefin sync (run from Inactivity cleanup), or from their last verification. XM activity is checked live in Inactivity cleanup.
      </p>

      {action && (
        <BulkActionModal
          action={action}
          count={selected.size}
          bodyOverride={ACTION_BODY[action](placesText(data.places))}
          progress={progress}
          onClose={() => !progress && setAction(null)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}
