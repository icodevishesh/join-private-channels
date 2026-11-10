'use client';

import { useEffect, useState } from 'react';
import Icon from '../ui/Icon';
import { Input, Select } from '../ui/Field';

export default function MemberFilters({ filters, places, onChange }) {
  const [search, setSearch] = useState(filters.search);

  // Debounce typing so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => search !== filters.search && onChange({ search }), 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <Icon name="search" />
        </span>
        <Input
          type="search"
          placeholder="Search name, username, email, Telegram or Discord ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search members"
        />
      </div>
      <Select value={filters.show} onChange={(e) => onChange({ show: e.target.value })} aria-label="Show" className="sm:w-56">
        <option value="">Everyone</option>
        {places.discord && <option value="in_discord">In the Discord server</option>}
        {places.discord && <option value="not_in_discord">Not in the Discord server</option>}
        {places.channel && <option value="in_channel">In the Telegram channel</option>}
        {places.channel && <option value="not_in_channel">Not in the Telegram channel</option>}
        <option value="removed">Kicked or banned</option>
        <option value="unverified">Need to verify again</option>
        <option value="elefin">Elefin clients</option>
        <option value="xm">XM clients</option>
      </Select>
    </div>
  );
}
