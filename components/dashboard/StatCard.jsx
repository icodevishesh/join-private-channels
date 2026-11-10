import Link from 'next/link';
import Icon from '../ui/Icon';

// Full class strings so Tailwind can see them.
const TONES = {
  indigo: { tile: 'bg-indigo-50 text-indigo-600 ring-indigo-100', bar: 'bg-indigo-500' },
  amber: { tile: 'bg-amber-50 text-amber-600 ring-amber-100', bar: 'bg-amber-500' },
  green: { tile: 'bg-green-50 text-green-600 ring-green-100', bar: 'bg-green-500' },
  zinc: { tile: 'bg-zinc-100 text-zinc-600 ring-zinc-200', bar: 'bg-zinc-400' },
};

/** Dashboard number tile. With `href`, the whole card is a link with a hover lift. */
export default function StatCard({ label, value, hint, icon, tone = 'indigo', href }) {
  const t = TONES[tone] ?? TONES.indigo;
  const body = (
    <>
      {/* Accent strip that appears on hover. */}
      <span className={`absolute inset-x-0 top-0 h-0.5 scale-x-0 transition-transform duration-200 group-hover:scale-x-100 ${t.bar}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-500">{label}</p>
        {icon && (
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${t.tile}`}>
            <Icon name={icon} className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">{Number(value).toLocaleString('en-US')}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      {href && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100">
          View <span aria-hidden="true">→</span>
        </span>
      )}
    </>
  );

  const base = 'group relative block overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 shadow-xs transition-all duration-200';
  return href ? (
    <Link href={href} className={`${base} hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-indigo-600`}>
      {body}
    </Link>
  ) : (
    <div className={`${base} hover:border-zinc-300 hover:shadow-sm`}>{body}</div>
  );
}
