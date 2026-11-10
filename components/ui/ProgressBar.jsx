/**
 * Thin bar for "working…" states. Without `value` it slides back and forth
 * (indeterminate); with `value` (0–100) it shows real progress.
 * Keeps its height when hidden so the layout doesn't jump.
 */
export default function ProgressBar({ active = true, value, className = '' }) {
  return (
    <div className={`relative h-0.5 w-full overflow-hidden ${className}`} aria-hidden={!active}>
      {active &&
        (value === undefined ? (
          <div className="progress-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-indigo-600" />
        ) : (
          <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
        ))}
    </div>
  );
}
