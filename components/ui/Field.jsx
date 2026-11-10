const control =
  'block rounded-md border-0 bg-white px-3 text-sm text-zinc-900 ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:bg-zinc-50 disabled:text-zinc-500';

export function Label({ htmlFor, children, hint }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-zinc-700">
      {children}
      {hint && <span className="mt-0.5 block text-xs font-normal text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Input({ className = '', ...props }) {
  // Full width unless the caller sets one (e.g. w-24).
  return <input className={`${control} h-9 ${/(^|\s)w-/.test(className) ? '' : 'w-full'} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${control} h-9 pr-8 ${/(^|\s)w-/.test(className) ? '' : 'w-full'} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ className = '', ...props }) {
  return <input type="checkbox" className={`size-4 rounded border-zinc-300 accent-indigo-600 ${className}`} {...props} />;
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-zinc-300'}`}
    >
      <span className={`inline-block size-4 rounded-full bg-[#fff] shadow transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  );
}
