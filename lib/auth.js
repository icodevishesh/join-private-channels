import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { config } from '@/src/config.js';
import { getAdmin } from './admins';
import { can } from './permissions';

export const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const secret = () => config.admin.sessionSecret || createHash('sha256').update(`tgdc-session:${config.telegramToken}`).digest('hex');

const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Signed cookie value pointing at an admin account (and its current session version). */
export function createSessionToken(admin) {
  const payload = Buffer.from(
    JSON.stringify({ aid: admin.id, sv: admin.sessionVersion ?? 0, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readSessionToken(token) {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() / 1000 && data.aid ? data : null;
  } catch {
    return null;
  }
}

// `Secure` is decided per request in the login route (HTTPS directly or via a proxy).
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
};

/**
 * The signed-in admin, loaded fresh from the database on every request, so deleting
 * an admin, changing their role or their password takes effect immediately.
 */
export async function getSession() {
  const data = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!data) return null;
  const admin = await getAdmin(data.aid);
  if (!admin || admin.sessionVersion !== data.sv) return null;
  return admin;
}

/** What the browser is allowed to know about the signed-in admin. */
export const publicAdmin = (admin) => admin && { id: admin.id, username: admin.username, role: admin.role, permissions: admin.permissions };

/** For pages: redirects to the login page when not signed in. */
export async function requireAdminPage() {
  const admin = await getSession();
  if (!admin) redirect('/admin/login');
  return admin;
}

/**
 * For API routes: returns a 401/403 response when not signed in or not allowed,
 * otherwise null. Pass a permission (e.g. 'members.manage') for actions that change things.
 */
export async function requireAdminApi(permission) {
  const admin = await getSession();
  if (!admin) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  if (permission && !can(admin, permission)) {
    return Response.json({ error: 'Your admin account isn’t allowed to do this.' }, { status: 403 });
  }
  return null;
}
