import { requireAdminApi } from '@/lib/auth';
import { runtime } from '@/src/runtime.js';
import { enableMembersIntent } from '@/src/services/setupStatus.js';

export const dynamic = 'force-dynamic';

/** POST { type: 'enable_intent' | 'restart_gateway' } */
export async function POST(request) {
  const denied = await requireAdminApi('discord.edit');
  if (denied) return denied;

  const { type } = await request.json().catch(() => ({}));
  try {
    if (type === 'enable_intent') {
      await enableMembersIntent();
      // The gateway needs to reconnect to pick up the new intent.
      await runtime.restartGateway?.();
      return Response.json({ message: 'Server Members Intent enabled and member tracking reconnected.' });
    }
    if (type === 'restart_gateway') {
      if (!runtime.restartGateway) return Response.json({ error: 'Restart is only available when running through server.js' }, { status: 400 });
      await runtime.restartGateway();
      return Response.json({ message: 'Member tracking reconnected.' });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
