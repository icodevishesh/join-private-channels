const tones = {
  success: 'bg-green-50 text-green-800 ring-green-600/20',
  error: 'bg-red-50 text-red-800 ring-red-600/20',
  info: 'bg-zinc-50 text-zinc-700 ring-zinc-300',
};

export default function Alert({ tone = 'info', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${tones[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div>{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}
