import { requireAdminApi } from '@/lib/auth';
import { getSetupStatus } from '@/src/services/setupStatus.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  return Response.json(await getSetupStatus());
}
