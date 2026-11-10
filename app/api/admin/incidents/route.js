import { requireAdminApi, getSession } from '@/lib/auth';
import { listIncidents, reviewIncident } from '@/src/db/incidentsRepo.js';
import { INCIDENT_STATUSES } from '@/src/services/incidents.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  return Response.json(
    await listIncidents({
      status: sp.get('status') ?? 'open',
      type: sp.get('type') ?? '',
      severity: sp.get('severity') ?? '',
      page: Number(sp.get('page') ?? 1),
    }),
  );
}

/** POST { id, status: 'open' | 'resolved' | 'ignored', note?, applyToSimilar? } */
export async function POST(request) {
  const denied = await requireAdminApi('incidents.manage');
  if (denied) return denied;
  const me = await getSession();
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !INCIDENT_STATUSES.includes(body.status)) {
    return Response.json({ error: 'Invalid incident or status.' }, { status: 400 });
  }
  const updated = await reviewIncident({
    id,
    status: body.status,
    note: typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '',
    adminName: me.username,
    applyToSimilar: body.applyToSimilar === true,
  });
  if (updated === null) return Response.json({ error: 'That incident no longer exists.' }, { status: 404 });
  return Response.json({ updated });
}
