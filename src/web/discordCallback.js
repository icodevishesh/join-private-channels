import * as repo from '../db/repo.js';
import { recordIncident } from '../services/incidents.js';
import { esc, joinedSuccess } from '../bot/messages.js';
import { addUserToGuild, exchangeCodeForUser, getServerUrl } from '../services/discord.js';

/*
 * GET /discord/callback?code=...&state=...
 * Discord sends the user here after they tap "Authorize". We learn their exact
 * Discord ID, add them to the server and link them to their Telegram/Elefin account.
 */

function page(res, status, { title, body, button, autoRedirect }) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${autoRedirect ? `<meta http-equiv="refresh" content="3;url=${esc(autoRedirect)}">` : ''}
<style>
  :root { color-scheme: light dark; --bg:#f4f5f7; --card:#fff; --text:#111827; --muted:#6b7280; --accent:#5865f2; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1115; --card:#181b22; --text:#f3f4f6; --muted:#9ca3af; } }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--text);
         font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; padding:16px; box-sizing:border-box; }
  .card { background:var(--card); max-width:420px; width:100%; border-radius:16px; padding:32px 28px; text-align:center;
          box-shadow:0 1px 3px rgba(0,0,0,.08); }
  h1 { font-size:22px; margin:0 0 8px; } p { color:var(--muted); margin:0 0 24px; }
  a.btn { display:inline-block; background:var(--accent); color:#fff; text-decoration:none; padding:12px 22px;
          border-radius:10px; font-weight:600; }
</style></head>
<body><main class="card"><h1>${esc(title)}</h1><p>${body}</p>
${button ? `<a class="btn" href="${esc(button.href)}">${esc(button.label)}</a>` : ''}
</main></body></html>`);
}

const fail = (res, title, body) => page(res, 400, { title, body });

export async function handleDiscordCallback(req, res, url, telegramApi) {
  if (url.searchParams.get('error')) {
    return fail(res, 'Authorization cancelled', 'No problem. Go back to Telegram and tap “Join the Discord server” again whenever you’re ready.');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return fail(res, 'Invalid link', 'Please go back to Telegram and tap “Join the Discord server” again.');

  try {
    if ((await repo.getSetting('discord_enabled', '1')) !== '1') {
      return fail(res, 'Discord joining is closed', 'Joining the Discord server is turned off right now. Please check back later.');
    }
    const st = await repo.getValidOAuthState(state);
    if (!st) {
      return fail(res, 'This link has expired', 'Join buttons work once and for a limited time. Send /link to the Telegram bot to get a new one.');
    }

    const user = await repo.getUser(st.telegram_id);
    if (!repo.isVerified(user)) {
      return fail(res, 'Not verified', 'Please verify your broker account with the Telegram bot first.');
    }

    const { accessToken, user: discordUser } = await exchangeCodeForUser(code);
    const displayName = discordUser.global_name || discordUser.username;

    // One Discord account per verified Telegram user, and vice versa.
    const rejected = (reason) =>
      recordIncident({ type: 'discord_login_rejected', reason, telegramId: user.telegram_id, details: { discord_user_id: discordUser.id, discord_username: discordUser.username } });
    if (user.discord_user_id && user.discord_user_id !== discordUser.id) {
      await rejected('Logged in with a different Discord account than the one linked');
      return fail(res, 'Different Discord account', 'Your broker account is already linked to another Discord account. Log in with that account, or contact support to change it.');
    }
    const other = await repo.findUserByDiscordId(discordUser.id);
    if (other && Number(other.telegram_id) !== Number(user.telegram_id)) {
      await rejected('Discord account already linked to another member');
      return fail(res, 'Account already linked', 'This Discord account is already linked to another member. Please contact support.');
    }
    const member = await repo.getMember(discordUser.id);
    if (member?.status === 'banned' || (await repo.isPersonBanned(user.telegram_id))) {
      await rejected('Banned user tried to rejoin');
      return fail(res, 'Access removed', 'Your access to the server has been removed. If you think this is a mistake, please contact support.');
    }

    await addUserToGuild(discordUser.id, accessToken, `Verified ${user.broker === 'xm' ? `XM MT5 ${user.xm_login_id}` : `Elefin client ${user.elefin_client_id}`} / TG ${user.telegram_id}`);
    await repo.linkDiscordToUser(user.telegram_id, discordUser.id);
    await repo.recordMemberJoin({
      discordUserId: discordUser.id,
      username: discordUser.username,
      displayName,
      joinedAt: new Date(),
      link: repo.memberLink(user),
    });
    await repo.markOAuthStateUsed(state, discordUser.id);
    const serverUrl = await getServerUrl();
    console.log(`[discord-oauth] ${discordUser.username} (${discordUser.id}) added → TG ${user.telegram_id}`);

    telegramApi
      ?.sendMessage(user.telegram_id, joinedSuccess(displayName), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '💬 Open Discord', url: serverUrl }]] },
      })
      .catch((err) => console.error('[discord-oauth] telegram notify failed:', err.message));

    return page(res, 200, {
      title: `You're in, ${displayName}! 🎉`,
      body: 'You have been added to the server. Opening Discord…',
      button: { href: serverUrl, label: 'Open Discord' },
      autoRedirect: serverUrl,
    });
  } catch (err) {
    console.error('[discord-oauth]', err.message);
    await recordIncident({ type: 'discord_join_failed', reason: err.message, details: { state_prefix: state?.slice(0, 6) } });
    return page(res, 500, {
      title: 'Something went wrong',
      body: 'We couldn’t add you to the server. Please try again in a few minutes by sending /link to the Telegram bot.',
    });
  }
}
