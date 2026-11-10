import { requireAdminApi } from '@/lib/auth';
import { filtersFromSearchParams } from '@/lib/memberFilters';
import { listPeople, getJoinPlaces } from '@/src/db/adminRepo.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const filters = filtersFromSearchParams(new URL(request.url).searchParams);
  const [people, places] = await Promise.all([listPeople(filters), getJoinPlaces()]);
  return Response.json({ ...people, places });
}
