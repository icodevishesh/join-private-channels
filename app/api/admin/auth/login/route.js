import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { authenticate, createFirstSuperAdmin, AdminError } from '@/lib/admins';

// Simple in-memory throttle: 10 failed attempts per IP per 15 minutes.
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;

// Relative redirect so it works on localhost, a LAN IP and behind ngrok/a proxy alike.
const redirectTo = (location, headers = {}) => new Response(null, { status: 303, headers: { Location: location, ...headers } });

// Only mark the cookie Secure when the browser is actually on HTTPS (directly or via a proxy like ngrok),
// otherwise browsers drop it on plain-http addresses and the login never sticks.
function isHttps(request) {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? new URL(request.url).protocol.replace(':', '');
  return proto === 'https';
}

function sessionCookie(admin, request) {
  const { maxAge, path, httpOnly, sameSite } = sessionCookieOptions;
  return [
    `${SESSION_COOKIE}=${createSessionToken(admin)}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    httpOnly && 'HttpOnly',
    `SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`,
    isHttps(request) && 'Secure',
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * HTML form post (works without JavaScript).
 * mode=setup creates the first super admin, and only works while there are no admins.
 */
export async function POST(request) {
  const form = await request.formData().catch(() => null);
  const field = (name) => String(form?.get(name) ?? '');
  const fail = (code, extra = '') => redirectTo(`/admin/login?error=${code}${extra}`);

  if (field('mode') === 'setup') {
    if (field('password') !== field('confirm')) return fail('mismatch');
    try {
      const admin = await createFirstSuperAdmin(field('username'), field('password'));
      return redirectTo('/admin', { 'Set-Cookie': sessionCookie(admin, request) });
    } catch (err) {
      if (err instanceof AdminError) return fail('setup', `&message=${encodeURIComponent(err.message)}`);
      throw err;
    }
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const now = Date.now();
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= 10) return fail('throttled');

  const admin = await authenticate(field('username'), field('password'));
  if (!admin) {
    failures.set(ip, [...recent, now]);
    return fail('invalid');
  }

  failures.delete(ip);
  return redirectTo('/admin', { 'Set-Cookie': sessionCookie(admin, request) });
}
