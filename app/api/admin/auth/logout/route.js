import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  // Relative redirect so it works behind a reverse proxy.
  return new Response(null, { status: 303, headers: { Location: '/admin/login' } });
}
