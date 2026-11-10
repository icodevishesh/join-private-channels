import { getSetting } from '../db/repo.js';

export class ElefinError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET /clients with the given query params. Retries a few times when rate-limited (HTTP 429). */
async function getClients(params) {
  const token = await getSetting('elefin_token');
  const base = await getSetting('elefin_api_base');
  if (!token) throw new ElefinError('The Elefin API token isn’t set (admin panel → Settings → Elefin)');
  if (!base) throw new ElefinError('The Elefin API base URL isn’t set (admin panel → Settings → Elefin)');

  const url = new URL(`${base.replace(/\/+$/, '')}/clients`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new ElefinError(`Elefin API request failed: ${err.message}`);
    }

    if (res.status === 429 && attempt < 5) {
      const wait = Number(res.headers.get('retry-after')) || 15;
      await sleep(wait * 1000);
      continue;
    }

    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      throw new ElefinError(`Elefin API error (HTTP ${res.status}): ${body?.message ?? 'unknown'}`);
    }
    return { clients: body.data?.data ?? [], meta: body.data?.meta ?? {} };
  }
}

/**
 * Looks up an Elefin client by email.
 * Returns the client object, or null when the email is not affiliated with us.
 */
export async function findClientByEmail(email) {
  const { clients } = await getClients({ email });
  // Guard against partial/fuzzy matches: only accept the exact email.
  return clients.find((c) => c.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

/**
 * Downloads every client, 200 per page, a few pages at a time.
 * Sorted by client_id so new sign-ups during the download don't shift pages.
 * @param {(page: number, lastPage: number) => void} [onPage]
 */
export async function fetchAllClients(onPage, concurrency = 3) {
  const params = (page) => ({ per_page: 200, page, sort: 'client_id', direction: 'asc' });
  const first = await getClients(params(1));
  const lastPage = Number(first.meta.last_page) || 1;
  const all = [...first.clients];
  onPage?.(1, lastPage);

  let next = 2;
  async function worker() {
    while (next <= lastPage) {
      const page = next++;
      const { clients } = await getClients(params(page));
      all.push(...clients);
      onPage?.(page, lastPage);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(lastPage - 1, 0)) }, worker));

  // De-duplicate in case a client appears on two pages.
  return [...new Map(all.map((c) => [c.client_id, c])).values()];
}

/** Quick token check for the admin panel. Returns how many clients are under the partner link. */
export async function testElefinConnection() {
  const { meta } = await getClients({ per_page: 1 });
  return { clients: Number(meta.total ?? 0) };
}
