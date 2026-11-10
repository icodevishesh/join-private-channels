import { requireAdminApi } from '@/lib/auth';
import { recordIncident } from '@/src/services/incidents.js';
import { kickMember, banMember, allowRejoin } from '@/src/services/discord.js';
import { kickChannelMember, banChannelMember, allowChannelRejoin } from '@/src/services/telegramChannel.js';

export const dynamic = 'force-dynamic';

// Discord members are identified by Discord user ID, channel members by Telegram user ID.
const ACTIONS = {
  discord: {
    kick: (id, reason) => kickMember(id, reason),
    ban: (id, reason) => banMember(id, reason),
    allow: (id) => allowRejoin(id),
  },
  telegram: {
    kick: (id, reason) => kickChannelMember(Number(id), reason),
    ban: (id, reason) => banChannelMember(Number(id), reason),
    allow: (id) => allowChannelRejoin(Number(id)),
  },
};
const ID_PATTERN = { discord: /^\d{15,25}$/, telegram: /^\d{4,20}$/ };
const MAX_PER_REQUEST = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * POST { platform: 'discord' | 'telegram', action: 'kick' | 'ban' | 'allow', ids: string[], reason?: string, source?: 'cleanup' }
 * Kicks from the Inactivity cleanup page need "cleanup.run"; everything else needs "members.manage".
 */
export async function POST(request) {
  const { platform = 'discord', action, ids, reason, source } = await request.json().catch(() => ({}));
  const denied = await requireAdminApi(source === 'cleanup' && action === 'kick' ? 'cleanup.run' : 'members.manage');
  if (denied) return denied;

  const run = ACTIONS[platform]?.[action];
  if (!run) return Response.json({ error: 'Unknown action' }, { status: 400 });
  const list = [...new Set(Array.isArray(ids) ? ids.map(String) : [])].filter((id) => ID_PATTERN[platform].test(id));
  if (!list.length) return Response.json({ error: 'No members selected' }, { status: 400 });
  if (list.length > MAX_PER_REQUEST) return Response.json({ error: `Select at most ${MAX_PER_REQUEST} members at a time` }, { status: 400 });

  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 255) : null;
  const results = [];
  // One at a time with a short pause to stay within Discord's and Telegram's rate limits.
  for (const id of list) {
    try {
      await run(id, cleanReason);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
      await recordIncident({
        type: 'removal_failed',
        reason: `${action} on ${platform === 'telegram' ? 'Telegram channel' : 'Discord'} failed: ${err.description ?? err.message}`,
        telegramId: platform === 'telegram' ? Number(id) : null,
        details: { platform, action, id },
      });
    }
    await sleep(250);
  }

  return Response.json({
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
  });
}
