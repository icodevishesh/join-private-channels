import { config } from '../config.js';
import { getPublicUrl, getDiscordRedirectUri } from './publicUrl.js';
import { getDiscordConfig } from './discordSettings.js';
import { query } from '../db/pool.js';
import { getSetting } from '../db/repo.js';
import { runtime } from '../runtime.js';
import { discordFetch, getApplication } from './discord.js';
import { getChannelConfig, inspectChannel, getAddToChannelUrl } from './telegramChannel.js';
import { testElefinConnection } from './elefin.js';
import { testXmConnection, getXmSettings } from './xm.js';

/*
 * Health / configuration checks for the admin "Setup" page.
 * Each check: { id, label, status: 'ok' | 'warn' | 'error' | 'off', detail, action?, link?, value?, fix?, fixLabel? }
 * `fix` is the settings field (or section) that fixes it, used by the "Fix now" button.
 */

const PERM = {
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  VIEW_CHANNEL: 1n << 10n,
  MANAGE_ROLES: 1n << 28n,
};
const INTENT_MEMBERS = 1 << 14;
const INTENT_MEMBERS_LIMITED = 1 << 15;

const ok = (detail, action) => ({ status: 'ok', detail, action });
const warn = (detail, action) => ({ status: 'warn', detail, action });
const error = (detail, action) => ({ status: 'error', detail, action });
const off = (label, detail, fix) => ({ id: `${fix}_off`, label, status: 'off', detail, fix, fixLabel: 'Turn on' });

const isLocalUrl = (url) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);

function requiredPermissions(d) {
  let p = PERM.CREATE_INSTANT_INVITE | PERM.KICK_MEMBERS | PERM.BAN_MEMBERS | PERM.VIEW_CHANNEL;
  if (d.memberRoleId) p |= PERM.MANAGE_ROLES;
  return p;
}

function botInviteUrl(clientId, d) {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', 'bot');
  url.searchParams.set('permissions', requiredPermissions(d).toString());
  if (d.guildId) {
    url.searchParams.set('guild_id', d.guildId);
    url.searchParams.set('disable_guild_select', 'true');
  }
  return url.toString();
}

const settled = async (fn) => {
  try {
    return { value: await fn() };
  } catch (err) {
    return { error: err };
  }
};

async function coreChecks() {
  const [elefinOn, xmOn] = await Promise.all([getSetting('elefin_enabled', '1'), getSetting('xm_enabled', '0')]);
  const [db, tg, elefin, xm] = await Promise.all([
    settled(() => query('SELECT 1')),
    settled(async () => {
      const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/getMe`, { signal: AbortSignal.timeout(10_000) });
      const body = await res.json();
      if (!body.ok) throw new Error(body.description);
      return body.result;
    }),
    elefinOn === '1'
      ? settled(async () => {
          if (!(await getSetting('elefin_token'))) throw new Error('No token saved yet.');
          if (!(await getSetting('elefin_api_base'))) throw Object.assign(new Error('API base URL not set yet.'), { fix: 'elefin_api_base' });
          return (await testElefinConnection()).clients;
        })
      : null,
    xmOn === '1'
      ? settled(async () => {
          const s = await getXmSettings();
          if (!s.xm_api_token) throw new Error('No token saved yet.');
          return testXmConnection(s);
        })
      : null,
  ]);
  const xmSignup = await getSetting('xm_signup_url');
  const [questionnaireOn, gatewayToken] = await Promise.all([getSetting('questionnaire_enabled', '1'), getSetting('telegram_gateway_token')]);

  const referral = await getSetting('referral_link');
  const [discordOn, channel] = await Promise.all([getSetting('discord_enabled', '1'), getChannelConfig()]);
  const destinations = [discordOn === '1' && 'Discord server', channel.enabled && 'Telegram channel'].filter(Boolean);
  const [{ n: activeConditions }] = await query('SELECT COUNT(*) AS n FROM conditions WHERE is_active = 1');
  const botState = runtime.bot;

  return [
    { id: 'db', label: 'Database', ...(db.error ? error(db.error.message) : ok(`Connected to ${config.db.database} on ${config.db.host}`)) },
    {
      id: 'telegram',
      label: 'Telegram bot',
      ...(tg.error
        ? error(`Token rejected: ${tg.error.message}`)
        : botState.state === 'running'
          ? ok(`@${tg.value.username} is running`)
          : botState.state === 'error'
            ? error(`@${tg.value.username}: ${botState.error}`)
            : warn(`@${tg.value.username} is ${botState.state}`)),
      link: tg.value ? { href: `https://t.me/${tg.value.username}`, label: 'Open bot' } : undefined,
    },
    !elefin && !xm
      ? { id: 'brokers', label: 'Brokers', ...error('Both Elefin and XM are turned off, so nobody can verify.'), fix: 'elefin_enabled', fixLabel: 'Turn one on' }
      : null,
    elefin
      ? {
          id: 'elefin',
          label: 'Elefin API',
          ...(elefin.error ? error(elefin.error.message) : ok(`Token works — ${Number(elefin.value).toLocaleString('en-US')} clients under your partner link`)),
          fix: elefin.error ? (elefin.error.fix ?? 'elefin_token') : undefined,
        }
      : off('Elefin', 'Turned off. Elefin clients can’t verify.', 'elefin_enabled'),
    xm
      ? {
          id: 'xm',
          label: 'XM API',
          ...(xm.error ? error(xm.error.message) : ok('Token works')),
          fix: xm.error ? 'xm_api_token' : undefined,
        }
      : off('XM', 'Turned off. XM clients can’t verify.', 'xm_enabled'),
    xm && !xmSignup
      ? { id: 'xm_signup', label: 'XM sign-up link', ...warn('Not set. XM users who aren’t under your link won’t get a sign-up link.'), fix: 'xm_signup_url' }
      : null,
    {
      id: 'destinations',
      label: 'Where verified users can join',
      ...(destinations.length
        ? ok(destinations.join(' and '))
        : error('Both the Discord server and the Telegram channel are turned off, so verified users can’t join anything.')),
      fix: destinations.length ? undefined : 'discord_enabled',
      fixLabel: 'Turn one on',
    },
    questionnaireOn === '1'
      ? {
          id: 'questionnaire',
          label: 'Start questionnaire',
          ...(gatewayToken ? ok('On. Users confirm their phone with a Telegram Gateway code.') : error('On, but the Telegram Gateway token isn’t set, so users can’t confirm their phone.')),
          fix: gatewayToken ? undefined : 'telegram_gateway_token',
        }
      : off('Start questionnaire', 'Turned off. Users aren’t asked for their name and phone.', 'questionnaire_enabled'),
    elefin && {
      id: 'referral',
      label: 'Elefin referral link',
      ...(referral ? ok(referral) : warn('Not set. Users who aren’t affiliated won’t get a sign-up link.')),
      fix: referral ? undefined : 'referral_link',
    },
    elefin && {
      id: 'conditions',
      label: 'Elefin join requirements',
      ...(Number(activeConditions) > 0
        ? ok(`${activeConditions} active`)
        : warn('None active, so every affiliated Elefin client can join.')),
      fix: Number(activeConditions) > 0 ? undefined : 'conditions',
    },
  ].filter(Boolean);
}

// A good result is remembered for 10 minutes per app + secret, so refreshing the
// Setup page doesn't hit Discord's (strictly rate-limited) token endpoint every time.
const secretCache = (globalThis.__tgdcSecretCheck ??= new Map());
const SECRET_OK_MS = 10 * 60_000;

/** @returns {Promise<'valid' | 'rejected' | string>} a string other than the two is a temporary problem */
async function checkClientSecret(appId, clientSecret) {
  const key = `${appId}:${clientSecret}`;
  if (Date.now() - (secretCache.get(key) ?? 0) < SECRET_OK_MS) return 'valid';
  try {
    await discordFetch('/oauth2/token', {
      method: 'POST',
      token: `Basic ${Buffer.from(key).toString('base64')}`,
      form: { grant_type: 'client_credentials', scope: 'identify' },
    });
    secretCache.set(key, Date.now());
    return 'valid';
  } catch (err) {
    // 401 / invalid_client is Discord saying the secret is wrong. Anything else
    // (rate limit, network, Discord outage) says nothing about the secret.
    if (err.status === 401 || /invalid_client/i.test(err.message)) return 'rejected';
    if (err.status === 429) return 'Discord is rate limiting these checks';
    return err.message.replace(/^Discord POST \/oauth2\/token failed /, '');
  }
}

async function discordChecks() {
  const d = await getDiscordConfig();
  if (!d.botToken) {
    return [{ id: 'discord_token', label: 'Discord bot token', ...error('Not set yet. Copy it from the Developer Portal → your app → Bot → Reset Token.'), fix: 'discord_bot_token' }];
  }

  const app = await settled(() => getApplication({ fresh: true }));
  if (app.error) {
    return [{ id: 'discord_token', label: 'Discord bot token', ...error(`Token rejected: ${app.error.message}`), fix: 'discord_bot_token' }];
  }
  const application = app.value;
  const portal = `https://discord.com/developers/applications/${application.id}`;
  const checks = [{ id: 'discord_token', label: 'Discord bot token', ...ok(`Application “${application.name}” (${application.id})`) }];

  // Server Members Intent (can be turned on through the API for bots in < 100 servers).
  const intentOn = (application.flags & (INTENT_MEMBERS | INTENT_MEMBERS_LIMITED)) !== 0;
  checks.push({
    id: 'intent',
    label: 'Server Members Intent',
    ...(intentOn
      ? ok('Enabled')
      : error('Disabled. The bot can’t track who joins or leaves.', { type: 'enable_intent', label: 'Enable it' })),
    link: intentOn ? undefined : { href: `${portal}/bot`, label: 'Bot settings' },
  });

  const gw = runtime.gateway;
  checks.push({
    id: 'gateway',
    label: 'Member tracking (gateway)',
    ...(gw.state === 'running'
      ? ok(`Connected as ${gw.tag}`)
      : gw.state === 'starting'
        ? warn('Connecting…')
        : error(gw.error ?? `State: ${gw.state}`, { type: 'restart_gateway', label: 'Reconnect' })),
  });

  // Server, permissions and role hierarchy.
  if (!d.guildId) {
    checks.push({ id: 'guild', label: 'Discord server', ...error('Server ID not set. In Discord, right-click your server → Copy Server ID (needs Developer Mode).'), fix: 'discord_guild_id' });
  } else {
    const guild = await settled(async () => (await discordFetch(`/guilds/${d.guildId}`)).data);
    if (guild.error) {
      checks.push({
        id: 'guild',
        label: 'Bot is in the server',
        ...error(guild.error.status === 404 || guild.error.status === 403 ? 'The bot is not in this server yet (or the server ID is wrong).' : guild.error.message),
        link: { href: botInviteUrl(application.id, d), label: 'Add bot to server' },
        fix: 'discord_guild_id',
      });
    } else {
      checks.push({ id: 'guild', label: 'Bot is in the server', ...ok(`“${guild.value.name}”`) });

      const member = await settled(async () => (await discordFetch(`/guilds/${d.guildId}/members/${application.bot?.id ?? application.id}`)).data);
      const roles = guild.value.roles ?? [];
      if (!member.error) {
        const byId = new Map(roles.map((r) => [r.id, r]));
        const everyone = byId.get(d.guildId);
        const botRoles = member.value.roles.map((id) => byId.get(id)).filter(Boolean);
        let perms = BigInt(everyone?.permissions ?? 0);
        for (const r of botRoles) perms |= BigInt(r.permissions);
        const isOwner = guild.value.owner_id === member.value.user.id;
        const isAdmin = isOwner || (perms & PERM.ADMINISTRATOR) !== 0n;

        const missing = Object.entries(PERM)
          .filter(([, bit]) => (requiredPermissions(d) & bit) !== 0n && (perms & bit) === 0n)
          .map(([name]) => name.toLowerCase().replace(/_/g, ' '));
        checks.push({
          id: 'permissions',
          label: 'Bot permissions',
          ...(isAdmin || !missing.length ? ok(isAdmin ? 'Administrator' : 'All required permissions granted') : error(`Missing: ${missing.join(', ')}`)),
          link: isAdmin || !missing.length ? undefined : { href: botInviteUrl(application.id, d), label: 'Grant permissions' },
        });

        const botTop = Math.max(0, ...botRoles.map((r) => r.position));
        const highestMember = Math.max(0, ...roles.filter((r) => r.id !== d.guildId && !r.managed).map((r) => r.position));
        if (d.memberRoleId) {
          const role = byId.get(d.memberRoleId);
          checks.push({
            id: 'member_role',
            label: 'Member role',
            ...(!role
              ? error(`Role ${d.memberRoleId} doesn’t exist in this server`)
              : role.position < botTop
                ? ok(`“${role.name}” will be given to new members`)
                : error(`Drag the bot’s role above “${role.name}” in Server Settings → Roles`)),
            fix: role ? undefined : 'discord_member_role_id',
          });
        }
        checks.push({
          id: 'hierarchy',
          label: 'Bot role position',
          ...(botTop >= highestMember
            ? ok('The bot’s role is above all member roles, so it can kick and ban anyone')
            : warn('Some roles are above the bot’s role. The bot can’t kick or ban members who have them. Drag the bot’s role up in Server Settings → Roles.')),
        });
      }
    }
  }

  // Login with Discord (OAuth2).
  if (d.clientId && d.clientId !== application.id) {
    checks.push({ id: 'client_id', label: 'Client ID', ...error(`The saved Client ID (${d.clientId}) doesn’t match this bot’s application (${application.id}). Clear it — it’s detected automatically.`), fix: 'discord_client_id' });
  }

  if (!d.clientSecret) {
    checks.push({
      id: 'client_secret',
      label: 'Client secret',
      ...error('Not set yet. Copy it from the Developer Portal → OAuth2 → Client Secret (Reset Secret).'),
      link: { href: `${portal}/oauth2`, label: 'OAuth2 settings' },
      fix: 'discord_client_secret',
    });
  } else {
    const result = await checkClientSecret(application.id, d.clientSecret);
    const rejected = result === 'rejected';
    checks.push({
      id: 'client_secret',
      label: 'Client secret',
      ...(result === 'valid'
        ? ok('Valid')
        : rejected
          ? error('Discord says this secret is wrong. Reset it in OAuth2 settings and save the new one.')
          : warn(`Couldn’t check it right now (${result}). This is usually temporary; refresh in a minute.`)),
      link: rejected ? { href: `${portal}/oauth2`, label: 'OAuth2 settings' } : undefined,
      fix: rejected ? 'discord_client_secret' : undefined,
    });
  }

  const redirect = await getDiscordRedirectUri();
  const registered = (application.redirect_uris ?? []).includes(redirect);
  checks.push({
    id: 'redirect',
    label: 'Redirect URL',
    ...(registered
      ? ok(redirect)
      : error('Not registered on Discord yet. Copy it, open OAuth2 settings, click “Add Redirect”, paste and save.', { type: 'copy', value: redirect, label: 'Copy URL' })),
    value: redirect,
    link: registered ? undefined : { href: `${portal}/oauth2`, label: 'OAuth2 settings' },
    extra: registered || !application.redirect_uris?.length ? undefined : `Currently registered: ${application.redirect_uris.join(', ')}`,
  });

  return checks;
}

async function webChecks() {
  const url = await getPublicUrl();
  const checks = [];

  if (isLocalUrl(url)) {
    checks.push({
      id: 'public_url',
      label: 'Public URL',
      ...warn(`${url} only works on this computer. Set your public HTTPS address so users can log in with Discord from their phones.`, { type: 'use_current_url', label: 'Use this address' }),
      fix: 'public_url',
      value: url,
    });
    return checks;
  }

  checks.push({
    id: 'public_url',
    label: 'Public URL',
    ...(url.startsWith('https://')
      ? ok(url, { type: 'use_current_url', label: 'Use this address' })
      : warn(`${url} isn’t HTTPS. Discord and browsers expect HTTPS for logins.`, { type: 'use_current_url', label: 'Use this address' })),
    value: url,
    fix: url.startsWith('https://') ? undefined : 'public_url',
  });

  const health = await settled(async () => {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8_000), cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (body?.app !== 'tg-discord-automation') throw new Error(`HTTP ${res.status}, but it isn’t this server`);
    return true;
  });
  checks.push({
    id: 'reachable',
    label: 'Reachable from the internet',
    ...(health.error ? error(`${url}/health failed: ${health.error.message}. Check your domain, proxy or tunnel — or set the right address.`) : ok(`${url} reaches this server`)),
    fix: health.error ? 'public_url' : undefined,
  });
  return checks;
}

async function channelChecks() {
  const { enabled, channelId } = await getChannelConfig();
  if (!enabled) return [off('Telegram channel', 'Turned off. Verified users won’t get a Telegram channel link.', 'telegram_channel_enabled')];

  const addUrl = await getAddToChannelUrl().catch(() => null);
  const addLink = addUrl ? { href: addUrl, label: 'Add bot to channel' } : undefined;
  if (!channelId) {
    return [{ id: 'channel', label: 'Channel', ...error('No channel picked yet. Add the bot to your channel as an admin, then pick it on the Telegram Channel page.'), fix: 'telegram_channel_id', link: addLink }];
  }

  const info = await settled(() => inspectChannel(channelId));
  if (info.error) {
    return [{
      id: 'channel',
      label: 'Channel',
      ...error(`The bot can’t open this channel (${info.error.description ?? info.error.message}). Make sure the bot is still an admin there, or pick the channel again.`),
      fix: 'telegram_channel_id',
      link: addLink,
    }];
  }

  const { chat, member } = info.value;
  const isAdmin = member.status === 'administrator' || member.status === 'creator';
  const checks = [
    { id: 'channel', label: 'Channel', ...ok(`“${chat.title}” (${chat.type})`) },
    {
      id: 'channel_private',
      label: 'Private',
      ...(chat.username
        ? error(`It’s public (@${chat.username}), so anyone can join without verifying. Make it private in the channel settings.`)
        : ok('Only people with a link can join, and the bot approves each request')),
    },
    {
      id: 'channel_admin',
      label: 'Bot is an admin',
      ...(isAdmin ? ok('Yes') : error('The bot isn’t an admin in this channel.')),
      link: isAdmin ? undefined : addLink,
    },
  ];
  if (isAdmin) {
    checks.push(
      {
        id: 'channel_invite',
        label: 'Permission: invite users',
        ...(member.status === 'creator' || member.can_invite_users
          ? ok('The bot can create personal join links')
          : error('Missing “Invite users via link”. Without it the bot can’t create join links.')),
        link: member.status === 'creator' || member.can_invite_users ? undefined : addLink,
      },
      {
        id: 'channel_ban',
        label: 'Permission: remove members',
        ...(member.status === 'creator' || member.can_restrict_members
          ? ok('Kick and ban from the admin panel will work')
          : warn('Missing “Ban users”. Joining works, but kicking and banning from the admin panel won’t.')),
        link: member.status === 'creator' || member.can_restrict_members ? undefined : addLink,
      },
    );
  }
  checks.push({
    id: 'channel_requests',
    label: 'Join requests',
    ...(runtime.bot.state === 'running'
      ? ok('The bot is running and approves verified users instantly')
      : error('The Telegram bot isn’t running, so join requests wait unanswered.')),
  });
  return checks;
}

export async function getSetupStatus() {
  const discordOn = (await getSetting('discord_enabled', '1')) === '1';
  const [core, discord, web, channel] = await Promise.all([
    coreChecks(),
    discordOn ? discordChecks() : [],
    discordOn ? webChecks() : [],
    channelChecks(),
  ]);
  const isLogin = (c) => ['client_id', 'client_secret', 'redirect'].includes(c.id);
  const groups = [
    { id: 'core', title: 'Bot & data', checks: core },
    discordOn
      ? { id: 'discord', title: 'Discord server', checks: discord.filter((c) => !isLogin(c)) }
      : { id: 'discord', title: 'Discord server', checks: [off('Discord server', 'Turned off. Verified users won’t get a Discord button.', 'discord_enabled')] },
    ...(discordOn ? [{ id: 'oauth', title: 'Discord login', checks: [...web, ...discord.filter(isLogin)] }] : []),
    { id: 'channel', title: 'Telegram channel', checks: channel },
  ];
  const all = groups.flatMap((g) => g.checks);
  const count = (status) => all.filter((c) => c.status === status).length;
  return { checkedAt: new Date(), summary: { ok: count('ok'), warn: count('warn'), error: count('error') }, groups };
}

/** Turns on the (limited) Server Members Intent through the API. */
export async function enableMembersIntent() {
  const app = await getApplication({ fresh: true });
  if (app.flags & (INTENT_MEMBERS | INTENT_MEMBERS_LIMITED)) return;
  await discordFetch('/applications/@me', { method: 'PATCH', body: { flags: app.flags | INTENT_MEMBERS_LIMITED } });
  await getApplication({ fresh: true });
}
