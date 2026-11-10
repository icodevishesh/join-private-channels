import { cookies } from 'next/headers';
import { requireAdminApi, getSession, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { updateAdmin, deleteAdmin, AdminError } from '@/lib/admins';

export const dynamic = 'force-dynamic';

const fail = (err) => {
  if (err instanceof AdminError) return Response.json({ error: err.message }, { status: 400 });
  throw err;
};

/** PATCH { role?, permissions?, password? } */
export async function PATCH(request, { params }) {
  const denied = await requireAdminApi('admins.manage');
  if (denied) return denied;
  const me = await getSession();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  // Admins can change their own password, but never their own role or permissions;
  // another super admin has to do that.
  const self = Number(id) === me.id;
  if (self && body.role !== undefined) {
    return Response.json({ error: 'You can’t change your own role. Ask another super admin.' }, { status: 400 });
  }
  try {
    const admin = await updateAdmin(Number(id), {
      role: self ? undefined : body.role,
      permissions: self ? undefined : body.permissions,
      password: body.password || undefined,
    });
    // A new password signs the admin out everywhere; keep *this* browser signed in when it's your own.
    if (self && body.password) {
      const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? new URL(request.url).protocol.replace(':', '');
      (await cookies()).set(SESSION_COOKIE, createSessionToken(admin), { ...sessionCookieOptions, secure: proto === 'https' });
    }
    return Response.json({ admin: { id: admin.id, username: admin.username, role: admin.role, permissions: admin.permissions } });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request, { params }) {
  const denied = await requireAdminApi('admins.manage');
  if (denied) return denied;
  const me = await getSession();
  const { id } = await params;
  try {
    await deleteAdmin(Number(id), me.id);
    return Response.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
