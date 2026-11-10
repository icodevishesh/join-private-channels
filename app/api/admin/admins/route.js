import { requireAdminApi, getSession } from '@/lib/auth';
import { listAdmins, createAdmin, AdminError } from '@/lib/admins';

export const dynamic = 'force-dynamic';

const shape = (a) => ({ id: a.id, username: a.username, role: a.role, permissions: a.permissions, lastLoginAt: a.lastLoginAt, createdAt: a.createdAt });

export async function GET() {
  const denied = await requireAdminApi('admins.manage');
  if (denied) return denied;
  return Response.json({ admins: (await listAdmins()).map(shape) });
}

/** POST { username, password, role, permissions } */
export async function POST(request) {
  const denied = await requireAdminApi('admins.manage');
  if (denied) return denied;
  const me = await getSession();
  const body = await request.json().catch(() => ({}));
  try {
    const admin = await createAdmin(body, me.id);
    return Response.json({ admin: shape(admin) }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
