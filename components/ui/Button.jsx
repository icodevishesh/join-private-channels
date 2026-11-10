const variants = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300',
  // Tinted accent for page actions: light fill, accent border and text, stronger on hover.
  soft: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 shadow-xs hover:bg-indigo-100 hover:ring-indigo-300 disabled:opacity-50',
  success: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-200 shadow-xs hover:bg-green-100 hover:ring-green-300 disabled:opacity-50',
  secondary: 'bg-white text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 disabled:text-zinc-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-300',
};

const sizes = {
  xs: 'h-7 px-2.5 text-[13px] gap-1.5',
  row: 'h-7 px-2.5 text-[13px] gap-1.5',
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  icon: 'size-8 justify-center',
};

/** Button classes, also for links that should look like buttons (<a>, <Link>). */
export function buttonClass({ variant = 'primary', size = 'md', className = '' } = {}) {
  return `inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`;
}

export default function Button({ variant = 'primary', size = 'md', className = '', type = 'button', loading = false, children, disabled, ...props }) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass({ variant, size, className })} {...props}>
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
}
