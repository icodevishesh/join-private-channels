import { requireAdminApi } from '@/lib/auth';
import { testElefinConnection } from '@/src/services/elefin.js';
import { testXmConnection } from '@/src/services/xm.js';

export const dynamic = 'force-dynamic';

/** POST { broker: 'elefin' | 'xm' } → checks the saved API token with one small request. */
export async function POST(request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { broker } = await request.json().catch(() => ({}));
  try {
    if (broker === 'elefin') {
      const { clients } = await testElefinConnection();
      return Response.json({ ok: true, message: `Connected. ${clients.toLocaleString('en-US')} clients under your partner link.` });
    }
    if (broker === 'xm') {
      const { tradesToday } = await testXmConnection();
      return Response.json({ ok: true, message: `Connected. ${tradesToday.toLocaleString('en-US')} trades by your clients today.` });
    }
    return Response.json({ error: 'Unknown broker' }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 502 });
  }
}
