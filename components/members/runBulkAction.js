'use client';

const CHUNK = 50;

/**
 * Sends kick/ban/allow requests in chunks so large selections don't hit the
 * per-request limit, reporting progress after each chunk.
 * @returns {{ succeeded: number, failed: Array<{ id, error }>, error?: string }}
 */
export async function runBulkAction({ platform, action, ids, reason, onProgress, source }) {
  const result = { succeeded: 0, failed: [] };
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const res = await fetch('/api/admin/members/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, action, ids: chunk, reason, source }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.status === 401) window.location.assign('/admin/login');
    if (!res?.ok) return { ...result, error: data?.error ?? 'Request failed' };
    result.succeeded += data.succeeded;
    result.failed.push(...data.failed);
    onProgress?.(Math.min(i + CHUNK, ids.length));
  }
  return result;
}
