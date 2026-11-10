const sizes = { sm: 'size-4 border-2', md: 'size-6 border-2', lg: 'size-8 border-[3px]' };

export default function Spinner({ size = 'md', className = '' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-indigo-600 border-r-transparent ${sizes[size]} ${className}`}
    />
  );
}

/** Centered spinner with a short message, for empty areas while data loads. */
export function LoadingBlock({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 text-sm text-zinc-500 ${className}`}>
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
