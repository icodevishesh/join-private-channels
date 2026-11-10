const tones = {
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  zinc: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
};

export default function Badge({ tone = 'zinc', children }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

const statusTone = { member: 'green', left: 'zinc', kicked: 'amber', banned: 'red' };

export function StatusBadge({ status }) {
  return <Badge tone={statusTone[status] ?? 'zinc'}>{status}</Badge>;
}
