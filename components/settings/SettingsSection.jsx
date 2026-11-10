'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import { Input, Toggle } from '../ui/Field';
import { useSaveSettings } from './useSaveSettings';
import { useAdmin } from '../layout/AdminContext';
import { PAGE_PERMISSION } from '@/lib/permissions';

/**
 * One settings card (e.g. "Discord server") that saves only its own fields.
 * `stacked` puts inputs under their labels (for narrow, side-by-side cards); toggles stay beside the label.
 */
export default function SettingsSection({ section, actions, stacked = false }) {
  const { can } = useAdmin();
  const canEdit = can(PAGE_PERMISSION[section.page] ?? 'settings.edit');
  const [values, setValues] = useState(() => Object.fromEntries(section.rows.map((r) => [r.key, r.value ?? ''])));
  const { save, saving } = useSaveSettings();
  // Write-only fields (e.g. the Elefin token): the server only says whether they're set.
  const [isSet, setIsSet] = useState(() => Object.fromEntries(section.rows.map((r) => [r.key, Boolean(r.isSet)])));

  // Pick up values changed elsewhere on the page (e.g. "Use this channel").
  useEffect(() => {
    setValues(Object.fromEntries(section.rows.map((r) => [r.key, r.value ?? ''])));
    setIsSet(Object.fromEntries(section.rows.map((r) => [r.key, Boolean(r.isSet)])));
  }, [section.rows]);

  async function onSubmit(e) {
    e.preventDefault();
    const data = await save({ settings: values });
    if (!data) return;
    // Show the values as saved (trimmed by the server). Secrets come back empty, which clears what was typed.
    const fresh = new Map(data.settings.map((s) => [s.key, s]));
    setValues((v) => Object.fromEntries(Object.keys(v).map((k) => [k, fresh.get(k)?.value ?? v[k]])));
    setIsSet((v) => Object.fromEntries(Object.keys(v).map((k) => [k, Boolean(fresh.get(k)?.isSet)])));
  }

  return (
    <Card id={`section-${section.id}`}>
      <CardHeader title={section.title} description={section.description} actions={actions} />
      <form onSubmit={onSubmit}>
        <fieldset disabled={!canEdit} className="divide-y divide-zinc-100">
          {section.rows.map((r) => {
            const meta = r.meta ?? {};
            const set = (value) => setValues((v) => ({ ...v, [r.key]: value }));
            const toggle = meta.type === 'toggle';
            const layout = !stacked
              ? 'grid gap-2 px-4 py-4 sm:px-6 md:grid-cols-[16rem_1fr] md:items-center md:gap-6'
              : toggle
                ? 'flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5'
                : 'flex flex-col gap-2 px-4 py-3.5 sm:px-5';
            return (
              <div key={r.key} id={`field-${r.key}`} className={`transition-colors ${layout}`}>
                <div>
                  <label htmlFor={`input-${r.key}`} className="text-sm font-medium text-zinc-800">
                    {meta.label}
                  </label>
                  {r.description && <p className="mt-0.5 text-xs text-zinc-500">{r.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {toggle ? (
                    <>
                      <Toggle checked={values[r.key] === '1'} onChange={(on) => set(on ? '1' : '0')} label={meta.label} />
                      <span className="text-sm text-zinc-600">{values[r.key] === '1' ? 'On' : 'Off'}</span>
                    </>
                  ) : (
                    <Input
                      id={`input-${r.key}`}
                      type={r.secret ? 'password' : (meta.type ?? 'text')}
                      inputMode={meta.inputMode}
                      min={meta.type === 'number' ? 0 : undefined}
                      step={meta.step}
                      placeholder={r.secret && isSet[r.key] ? '••••••••••••••••••••••••' : meta.placeholder}
                      value={values[r.key]}
                      onChange={(e) => set(e.target.value)}
                      autoComplete={r.secret ? 'new-password' : 'off'}
                      spellCheck={false}
                      className={`${meta.suffix ? 'max-w-36' : ''} ${meta.mono ? 'font-mono' : ''}`}
                    />
                  )}
                  {meta.suffix && <span className="text-xs text-zinc-500">{meta.suffix}</span>}
                </div>
              </div>
            );
          })}
        </fieldset>
        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 sm:px-5">
          {canEdit ? (
            <Button type="submit" loading={saving}>
              Save {section.title}
            </Button>
          ) : (
            <p className="text-sm text-zinc-500">Read-only for your account.</p>
          )}
        </div>
      </form>
    </Card>
  );
}
