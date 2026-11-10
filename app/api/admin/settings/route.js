import { requireAdminApi } from '@/lib/auth';
import { getAllSettings, getSettingsForAdmin, updateSettings, getAllConditions, updateConditions, clearChannelInvites, SECRET_SETTINGS } from '@/src/db/adminRepo.js';
import { invalidateDiscordConfig } from '@/src/services/discordSettings.js';
import { invalidatePublicUrl, normalizeUrl } from '@/src/services/publicUrl.js';
import { runtime } from '@/src/runtime.js';
import { settingsPageFor, PAGES } from '@/components/settings/settingsMeta';
import { PAGE_PERMISSION } from '@/lib/permissions';

const pageOf = (key) => Object.keys(PAGES).find((page) => PAGES[page] === settingsPageFor(key));

export const dynamic = 'force-dynamic';

const NUMERIC = new Set(['discord_connect_link_ttl_minutes', 'max_verification_attempts_per_hour']);
const SNOWFLAKE = new Set(['discord_guild_id', 'discord_client_id', 'discord_member_role_id']);
const URLS = new Set(['referral_link', 'elefin_api_base', 'public_url', 'xm_api_base', 'xm_signup_url']);
const TOGGLES = new Set(['discord_enabled', 'telegram_channel_enabled', 'elefin_enabled', 'xm_enabled', 'xm_reject_archived', 'xm_require_balance', 'questionnaire_enabled']);
// Changing these needs the Discord gateway to reconnect.
const GATEWAY_KEYS = new Set(['discord_bot_token', 'discord_guild_id']);

const bad = (error) => Response.json({ error }, { status: 400 });

/** PUT { settings?: { key: value }, conditions?: [{ id, threshold, is_active }] } */
export async function PUT(request) {
  const body = await request.json().catch(() => ({}));

  // Every page touched by this save needs its edit permission.
  const needed = new Set();
  for (const key of Object.keys(body.settings ?? {})) needed.add(PAGE_PERMISSION[pageOf(key)] ?? 'settings.edit');
  // Join requirements belong to Elefin, on the Brokers page.
  if (Array.isArray(body.conditions)) needed.add('brokers.edit');
  if (!needed.size) needed.add('settings.edit');
  for (const permission of needed) {
    const denied = await requireAdminApi(permission);
    if (denied) return denied;
  }
  let restartGateway = false;

  if (body.settings && typeof body.settings === 'object') {
    const current = new Map((await getAllSettings()).map((s) => [s.key, s.value ?? '']));
    const values = {};
    for (const [key, raw] of Object.entries(body.settings)) {
      if (!current.has(key)) continue;
      const v = key === 'public_url' ? normalizeUrl(raw) : String(raw ?? '').trim();
      // Secrets come back empty unless the admin typed a new one: keep the saved value.
      if (SECRET_SETTINGS.has(key) && v === '') continue;
      if (NUMERIC.has(key) && !/^\d+$/.test(v)) return bad('Please enter a whole number.');
      if (SNOWFLAKE.has(key) && v && !/^\d{15,25}$/.test(v)) return bad('Discord IDs are long numbers, e.g. 123456789012345678.');
      if (URLS.has(key) && v && !/^https?:\/\//i.test(v)) return bad('Links must start with http:// or https://');
      if (TOGGLES.has(key) && !['0', '1'].includes(v)) return bad('Invalid on/off value.');
      if (key === 'xm_min_lots' && !/^\d+(\.\d{1,2})?$/.test(v)) return bad('Minimum lots must be a number like 1 or 0.5.');
      if (key === 'xm_lots_window_days' && !(/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 365)) return bad('The lots window must be 1 to 365 days.');
      if (key === 'telegram_channel_id' && v && !/^-\d{5,20}$/.test(v)) return bad('Channel IDs look like -1001234567890. Pick your channel from the list instead.');
      if (v === current.get(key)) continue;
      values[key] = v;
      if (GATEWAY_KEYS.has(key)) restartGateway = true;
    }
    await updateSettings(values);
    if (Object.keys(values).some((k) => k.startsWith('discord_'))) invalidateDiscordConfig();
    if ('public_url' in values) invalidatePublicUrl();
    if ('telegram_channel_id' in values) await clearChannelInvites();
    // Reconnect in the background so the save returns immediately.
    if (restartGateway) runtime.restartGateway?.().catch((err) => console.error('[discord-gw]', err));
  }

  if (Array.isArray(body.conditions)) {
    for (const c of body.conditions) {
      if (!Number.isFinite(Number(c.threshold)) || Number(c.threshold) < 0) return bad('Values must be positive numbers.');
    }
    await updateConditions(body.conditions);
  }

  return Response.json({ settings: await getSettingsForAdmin(), conditions: await getAllConditions(), gatewayRestarted: restartGateway });
}
