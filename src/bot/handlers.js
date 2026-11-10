import { InlineKeyboard, GrammyError } from 'grammy';
import * as repo from '../db/repo.js';
import * as msg from './messages.js';
import { recordIncident } from '../services/incidents.js';
import { findClientByEmail } from '../services/elefin.js';
import { checkXmAccount, isLoginId } from '../services/xm.js';
import { getEnabledBrokers, isBrokerEnabled } from '../services/brokers.js';
import { CODE_LENGTH, checkCode, isUserError, normalizePhone, sendCode } from '../services/telegramGateway.js';
import { evaluateConditions } from '../services/conditions.js';
import { createConnectUrl, getServerUrl } from '../services/discord.js';
import { getChannelConfig, getChannelInviteLink, getChannelOpenUrl, isOurChannel, revokeInviteLink } from '../services/telegramChannel.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HTML = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };

// Prevents a user from triggering parallel checks.
const busy = new Set();

async function withUserLock(ctx, fn) {
  const id = ctx.from.id;
  if (busy.has(id)) return;
  busy.add(id);
  try {
    await fn();
  } finally {
    busy.delete(id);
  }
}

/**
 * One bot message per interaction, updated in place.
 * Button presses edit the message that holds the button; typed input gets one
 * new message, and later updates edit that message.
 */
function createScreen(ctx) {
  let messageId = ctx.callbackQuery?.message?.message_id ?? null;

  return {
    async show(text, { keyboard, ...extra } = {}) {
      const options = { ...HTML, ...extra, reply_markup: keyboard ?? new InlineKeyboard() };
      if (messageId) {
        try {
          await ctx.api.editMessageText(ctx.chat.id, messageId, text, options);
          return;
        } catch (err) {
          if (err instanceof GrammyError && err.description.includes('message is not modified')) return;
          // The message can't be edited (deleted, too old, ...), so send a new one.
        }
      }
      const sent = await ctx.reply(text, options);
      messageId = sent.message_id;
    },
  };
}

const backKeyboard = () => new InlineKeyboard().text('⬅️ Back', 'home');

async function showWelcome(ctx, screen = createScreen(ctx)) {
  const brokers = await getEnabledBrokers();
  const keyboard = new InlineKeyboard();
  if (brokers.length === 1) keyboard.text(`✅ Verify my ${brokers[0].label} account`, `verify:${brokers[0].id}`);
  else if (brokers.length > 1) keyboard.text('✅ Verify my account', 'verify');
  for (const b of brokers) if (b.signupUrl) keyboard.row().url(`📝 Open an ${b.label} account`, b.signupUrl);
  // Greet them by the name they gave in the questionnaire, if any.
  const firstName = (await repo.getUser(ctx.from.id))?.full_name?.split(' ')[0] || ctx.from.first_name;
  await screen.show(brokers.length ? msg.welcome(firstName, brokers.map((b) => b.label)) : msg.verificationClosed, { keyboard });
}

/** "Verify": goes straight to the only enabled broker, or asks which one. */
async function startVerification(ctx, screen = createScreen(ctx)) {
  const user = await repo.getUser(ctx.from.id);
  if (repo.isVerified(user)) return deliverJoinLinks(ctx, user, screen);
  const brokers = await getEnabledBrokers();
  if (!brokers.length) return screen.show(msg.verificationClosed);
  if (brokers.length === 1) return askForAccount(ctx, brokers[0].id, screen);
  const keyboard = new InlineKeyboard();
  for (const b of brokers) keyboard.text(b.label, `verify:${b.id}`);
  keyboard.row().text('⬅️ Back', 'home');
  await screen.show(msg.chooseBroker, { keyboard });
}

async function askForAccount(ctx, broker, screen = createScreen(ctx)) {
  const user = await repo.getUser(ctx.from.id);
  if (repo.isVerified(user)) return deliverJoinLinks(ctx, user, screen);
  if (!(await isBrokerEnabled(broker))) return screen.show(msg.brokerClosed(broker === 'xm' ? 'XM' : 'Elefin'), { keyboard: backKeyboard() });
  await repo.setUserState(ctx.from.id, broker === 'xm' ? 'awaiting_xm' : 'awaiting_email');
  await screen.show(broker === 'xm' ? msg.askXm : msg.askEmail, { keyboard: backKeyboard() });
}

/**
 * Sends the join links for every enabled place (Discord server, Telegram channel),
 * or "already in" / "removed" for each, in one message.
 */
async function deliverJoinLinks(ctx, user, screen = createScreen(ctx), header = '') {
  const withHeader = (text) => (header ? `${header}\n\n${text}` : text);
  const [discordOn, channel] = await Promise.all([repo.getSetting('discord_enabled', '1'), getChannelConfig()]);
  const keyboard = new InlineKeyboard();
  let discord = null;
  let channelState = null;
  // Banned in one place means banned everywhere.
  const banned = await repo.isPersonBanned(user.telegram_id);

  if (discordOn === '1') {
    const member = user.discord_user_id ? await repo.getMember(user.discord_user_id) : null;
    if (banned) {
      discord = 'banned';
    } else if (member?.status === 'member') {
      discord = 'member';
      keyboard.url('💬 Open Discord', await getServerUrl()).row();
    } else {
      try {
        keyboard.url('🚀 Join the Discord server', await createConnectUrl(user.telegram_id)).row();
        discord = 'link';
      } catch (err) {
        console.error('[discord]', err.message);
        await recordIncident({ type: 'discord_unavailable', reason: err.message, telegramId: user.telegram_id });
        discord = 'unavailable';
      }
    }
  }

  if (channel.enabled && channel.channelId) {
    const member = await repo.getChannelMember(user.telegram_id);
    if (banned) {
      channelState = 'banned';
    } else if (member?.status === 'member') {
      channelState = 'member';
      keyboard.url('📢 Open the channel', await getChannelOpenUrl()).row();
    } else {
      try {
        keyboard.url('📢 Join the Telegram channel', await getChannelInviteLink(user)).row();
        channelState = 'link';
      } catch (err) {
        console.error('[telegram-channel]', err.message);
        await recordIncident({ type: 'channel_unavailable', reason: err.description ?? err.message, telegramId: user.telegram_id });
        channelState = 'unavailable';
      }
    }
  }

  if (!discord && !channelState) return screen.show(withHeader(msg.joiningClosed));
  if (discord === 'unavailable' || channelState === 'unavailable') keyboard.text('🔄 Try again', 'link');
  const minutes = await repo.getSetting('discord_connect_link_ttl_minutes', '60');
  await screen.show(withHeader(msg.joinLinks({ discord, channel: channelState, minutes })), { keyboard });
}

async function verifyEmail(ctx, rawEmail, screen = createScreen(ctx)) {
  const email = rawEmail.trim().toLowerCase();
  const telegramId = ctx.from.id;
  const retryKeyboard = () => new InlineKeyboard().text('🔄 Try another email', 'verify');

  if (!EMAIL_RE.test(email)) return screen.show(msg.invalidEmail, { keyboard: backKeyboard() });
  if (!(await isBrokerEnabled('elefin'))) return screen.show(msg.brokerClosed('Elefin'), { keyboard: backKeyboard() });
  if (await isRateLimited(telegramId)) return screen.show(msg.rateLimited);

  const owner = await repo.findUserByVerifiedEmail(email);
  if (owner && Number(owner.telegram_id) !== telegramId) {
    await repo.logVerification({ telegramId, email, result: 'taken' });
    await recordIncident({
      type: 'email_taken',
      reason: 'Tried an Elefin email already linked to another Telegram account',
      telegramId,
      details: { email, linked_to_telegram_id: owner.telegram_id },
    });
    return screen.show(msg.emailTaken, { keyboard: retryKeyboard() });
  }

  await repo.setLastCheckedEmail(telegramId, email);
  await screen.show(msg.checking('Elefin'));

  let client;
  try {
    client = await findClientByEmail(email);
  } catch (err) {
    console.error('[elefin]', err.message);
    await recordIncident({ type: 'elefin_api_error', reason: err.message, telegramId, details: { email } });
    await repo.logVerification({ telegramId, email, result: 'error', details: { error: err.message } });
    return screen.show(msg.genericError, { keyboard: new InlineKeyboard().text('🔄 Try again', 'recheck') });
  }

  if (!client) {
    await repo.logVerification({ telegramId, email, result: 'not_found' });
    const link = await repo.getSetting('referral_link');
    await recordIncident({
      type: 'not_affiliated',
      reason: `${email} is not under the partner link`,
      telegramId,
      details: { email },
    });
    // A setup problem, not the user's: one system-wide incident (repeats are counted).
    if (!link) await recordIncident({ type: 'referral_link_missing', reason: 'Referral link is empty, so non-affiliated users get no sign-up link' });
    const keyboard = new InlineKeyboard();
    if (link) keyboard.url('📝 Open an Elefin account', link).row();
    keyboard.text('🔄 Try another email', 'verify');
    return screen.show(msg.notAffiliated(email, Boolean(link)), { keyboard });
  }

  const conditions = await repo.getActiveConditions();
  const evaluation = evaluateConditions(client, conditions);
  const snapshot = {
    results: evaluation.results,
    funding: client.funding,
    accounts: { balance: client.accounts?.balance, equity: client.accounts?.equity },
    trading: client.trading,
  };

  if (!evaluation.passed) {
    await repo.logVerification({ telegramId, email, clientId: client.client_id, result: 'failed', details: snapshot });
    const missed = evaluation.results.filter((r) => !r.passed);
    await recordIncident({
      type: 'requirements_failed',
      reason: `Didn’t meet: ${missed.map((r) => r.label).join(', ')}`.slice(0, 255),
      telegramId,
      details: { email, client_id: client.client_id, failed: missed.map((r) => ({ requirement: r.label, actual: r.actual })) },
    });
    return screen.show(msg.conditionsReport({ client, ...evaluation }), {
      keyboard: new InlineKeyboard().text('🔄 Check again', 'recheck'),
    });
  }

  await repo.logVerification({ telegramId, email, clientId: client.client_id, result: 'passed', details: snapshot });
  try {
    await repo.markUserVerified(telegramId, { broker: 'elefin', email, clientId: client.client_id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return screen.show(msg.emailTaken, { keyboard: retryKeyboard() });
    throw err;
  }

  await deliverJoinLinks(ctx, await repo.getUser(telegramId), screen, msg.conditionsReport({ client, ...evaluation }));
}

async function isRateLimited(telegramId) {
  const limit = Number(await repo.getSetting('max_verification_attempts_per_hour', '10'));
  return (await repo.countRecentVerifications(telegramId)) >= limit;
}

async function verifyXm(ctx, raw, screen = createScreen(ctx)) {
  const loginId = String(raw).replace(/\s+/g, '');
  const telegramId = ctx.from.id;
  const log = (result, extra = {}) => repo.logVerification({ telegramId, broker: 'xm', email: loginId, result, ...extra });

  if (!isLoginId(loginId)) return screen.show(msg.invalidXm, { keyboard: backKeyboard() });
  if (!(await isBrokerEnabled('xm'))) return screen.show(msg.brokerClosed('XM'), { keyboard: backKeyboard() });
  if (await isRateLimited(telegramId)) return screen.show(msg.rateLimited);

  const owner = await repo.findUserByXmLogin(loginId);
  if (owner && Number(owner.telegram_id) !== telegramId) {
    await log('taken');
    await recordIncident({
      type: 'email_taken',
      reason: 'Tried an XM account already linked to another Telegram account',
      telegramId,
      details: { broker: 'xm', xm_login_id: loginId, linked_to_telegram_id: owner.telegram_id },
    });
    return screen.show(msg.xmTaken, { keyboard: new InlineKeyboard().text('🔄 Try another account', 'verify:xm') });
  }

  await repo.setLastCheckedEmail(telegramId, loginId);
  await screen.show(msg.checking('XM'));

  let check;
  try {
    check = await checkXmAccount(loginId);
  } catch (err) {
    console.error('[xm]', err.message);
    await recordIncident({ type: 'xm_api_error', reason: err.message, telegramId, details: { xm_login_id: loginId } });
    await log('error', { details: { error: err.message } });
    return screen.show(msg.genericError, { keyboard: new InlineKeyboard().text('🔄 Try again', 'recheck') });
  }

  if (!check.found) {
    await log('not_found');
    const link = await repo.getSetting('xm_signup_url');
    await recordIncident({ type: 'not_affiliated', reason: `XM account ${loginId} is not under the partner link`, telegramId, details: { broker: 'xm', xm_login_id: loginId } });
    if (!link) await recordIncident({ type: 'referral_link_missing', reason: 'XM sign-up link is empty, so non-affiliated XM users get no sign-up link' });
    const keyboard = new InlineKeyboard();
    if (link) keyboard.url('📝 Open an XM account', link).row();
    keyboard.text('🔄 Try another account', 'verify:xm');
    return screen.show(msg.notAffiliatedXm(loginId, Boolean(link)), { keyboard });
  }

  const snapshot = { results: check.results, trader: check.trader, activity: check.activity };
  const report = msg.conditionsReport({ client: { name: ctx.from.first_name }, results: check.results, passed: check.passed, broker: 'XM' });

  if (!check.passed) {
    await log('failed', { details: snapshot });
    const missed = check.results.filter((r) => !r.passed);
    await recordIncident({
      type: 'requirements_failed',
      reason: `XM: didn’t meet: ${missed.map((r) => r.label).join(', ')}`.slice(0, 255),
      telegramId,
      details: { broker: 'xm', xm_login_id: loginId, failed: missed.map((r) => ({ requirement: r.label, actual: r.actual })) },
    });
    const keyboard = new InlineKeyboard().text('🔄 Check again', 'recheck');
    const link = await repo.getSetting('xm_signup_url');
    if (link) keyboard.row().url('📝 Open an XM account', link);
    return screen.show(report, { keyboard });
  }

  await log('passed', { details: snapshot });
  try {
    await repo.markUserVerified(telegramId, { broker: 'xm', loginId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return screen.show(msg.xmTaken, { keyboard: new InlineKeyboard().text('🔄 Try another account', 'verify:xm') });
    throw err;
  }

  await deliverJoinLinks(ctx, await repo.getUser(telegramId), screen, report);
}

// ---------- start questionnaire: name, then a phone number verified through Telegram Gateway ----------

const RESEND_AFTER_SECONDS = 60;
const removeKeyboard = { reply_markup: { remove_keyboard: true } };
const phoneKeyboard = {
  reply_markup: { keyboard: [[{ text: '📱 Share my phone number', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
};
const codeKeyboard = () => new InlineKeyboard().text('🔄 Send a new code', 'q_resend').text('✏️ Change number', 'q_change');

const questionnaireOn = async () => (await repo.getSetting('questionnaire_enabled', '1')) === '1';

/**
 * Before anything else, users answer the questionnaire (when it's on). Returns true when
 * the update was taken over by it, so the caller should stop. Old users who never answered
 * get it too, the next time they use the bot.
 */
async function questionnaireGate(ctx) {
  if (!(await questionnaireOn())) return false;
  const user = await repo.getUser(ctx.from.id);
  if (!repo.needsProfile(user)) return false;
  await resumeQuestionnaire(ctx, user);
  return true;
}

async function resumeQuestionnaire(ctx, user) {
  if (!user?.full_name) {
    await repo.setUserState(ctx.from.id, 'q_name');
    return ctx.reply(msg.askName, { ...HTML, ...removeKeyboard });
  }
  if (user.state === 'q_code' && user.pending_phone) {
    return ctx.reply(msg.askCode(user.pending_phone, CODE_LENGTH), { ...HTML, reply_markup: codeKeyboard() });
  }
  await repo.setUserState(ctx.from.id, 'q_phone');
  return ctx.reply(msg.askPhone(user.full_name), { ...HTML, ...phoneKeyboard });
}

async function answerName(ctx, text) {
  const name = text.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 64 || name.startsWith('/')) return ctx.reply(msg.invalidName, HTML);
  await repo.saveFullName(ctx.from.id, name);
  await repo.setUserState(ctx.from.id, 'q_phone');
  await ctx.reply(msg.askPhone(name), { ...HTML, ...phoneKeyboard });
}

async function answerPhone(ctx, raw) {
  const phone = normalizePhone(raw);
  if (!phone) return ctx.reply(msg.invalidPhone, { ...HTML, ...phoneKeyboard });
  const user = await repo.getUser(ctx.from.id);
  // Don't send a new code to the same number more than once a minute.
  const sentAgo = user?.phone_code_sent_at ? (Date.now() - new Date(user.phone_code_sent_at).getTime()) / 1000 : Infinity;
  if (user?.pending_phone === phone && sentAgo < RESEND_AFTER_SECONDS) {
    return ctx.reply(msg.codeCooldown(Math.ceil(RESEND_AFTER_SECONDS - sentAgo)), HTML);
  }

  let requestId;
  try {
    requestId = await sendCode(phone, ctx.from.id);
  } catch (err) {
    if (isUserError(err)) return ctx.reply(msg.phoneUnavailable, { ...HTML, ...phoneKeyboard });
    console.error('[gateway]', err.message);
    await recordIncident({ type: 'phone_verification_failed', reason: err.message, telegramId: ctx.from.id, details: { phone } });
    return ctx.reply(msg.genericError, { ...HTML, ...phoneKeyboard });
  }
  await repo.savePhoneRequest(ctx.from.id, phone, requestId);
  await repo.setUserState(ctx.from.id, 'q_code');
  // Hide the "share phone" keyboard, then show the code buttons.
  await ctx.reply('👍', removeKeyboard).then((m) => ctx.api.deleteMessage(ctx.chat.id, m.message_id).catch(() => {}));
  await ctx.reply(msg.askCode(phone, CODE_LENGTH), { ...HTML, reply_markup: codeKeyboard() });
}

async function answerCode(ctx, text) {
  const code = text.replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) return ctx.reply(msg.invalidCodeFormat(CODE_LENGTH), HTML);
  const user = await repo.getUser(ctx.from.id);
  if (!user?.phone_request_id) return resumeQuestionnaire(ctx, { ...user, state: null });

  let status;
  try {
    status = await checkCode(user.phone_request_id, code);
  } catch (err) {
    console.error('[gateway]', err.message);
    await recordIncident({ type: 'phone_verification_failed', reason: err.message, telegramId: ctx.from.id, details: { phone: user.pending_phone } });
    return ctx.reply(msg.genericError, HTML);
  }
  if (status === 'code_invalid') return ctx.reply(msg.wrongCode, { ...HTML, reply_markup: codeKeyboard() });
  if (status !== 'code_valid') return ctx.reply(msg.codeExpired, { ...HTML, reply_markup: codeKeyboard() });

  await repo.markPhoneVerified(ctx.from.id);
  await ctx.reply(msg.profileDone(user.full_name), HTML);
  await showWelcome(ctx);
}

export function registerHandlers(bot) {
  // Keep tg_users up to date for every private interaction.
  bot.use(async (ctx, next) => {
    if (ctx.from && ctx.chat?.type === 'private') await repo.upsertUser(ctx.from);
    await next();
  });

  // ---- Telegram channel: join requests, joins/leaves, bot added as admin ----

  // Approve only verified users (the request comes from their own Telegram account,
  // so a forwarded invite link doesn't help anyone else).
  bot.on('chat_join_request', async (ctx) => {
    const req = ctx.chatJoinRequest;
    const channel = await getChannelConfig();
    if (!channel.enabled || !isOurChannel(req.chat.id, channel.channelId)) return;

    await repo.upsertUser(req.from);
    const user = await repo.getUser(req.from.id);
    const banned = await repo.isPersonBanned(req.from.id);
    const dm = (text) => ctx.api.sendMessage(req.user_chat_id, text, HTML).catch(() => {});

    if (repo.isVerified(user) && !banned) {
      try {
        await ctx.api.approveChatJoinRequest(req.chat.id, req.from.id);
      } catch (err) {
        await recordIncident({ type: 'channel_approve_failed', reason: err.description ?? err.message, telegramId: req.from.id });
        throw err;
      }
      await repo.recordChannelJoin({
        telegramId: req.from.id,
        channelId: req.chat.id,
        link: repo.memberLink(user),
      });
      // Their personal link has done its job.
      await revokeInviteLink(req.chat.id, user.channel_invite_link);
      await repo.saveChannelInvite(req.from.id, null, null);
      console.log(`[telegram-channel] approved ${req.from.username ?? req.from.id}`);
      await dm(msg.channelJoined);
    } else {
      await ctx.api.declineChatJoinRequest(req.chat.id, req.from.id).catch(() => {});
      await recordIncident({
        type: 'channel_join_declined',
        reason: banned ? 'Banned user asked to join the channel' : 'Unverified user asked to join the channel',
        telegramId: req.from.id,
      });
      console.log(`[telegram-channel] declined ${req.from.username ?? req.from.id} (not verified)`);
      await dm(msg.channelJoinDeclined);
    }
  });

  // Keeps channel_members in sync with joins and leaves (needs the bot to be an admin).
  bot.on('chat_member', async (ctx) => {
    const update = ctx.chatMember;
    const channel = await getChannelConfig();
    if (!isOurChannel(update.chat.id, channel.channelId)) return;
    const person = update.new_chat_member.user;
    if (person.is_bot) return;

    const status = update.new_chat_member.status;
    if (['member', 'administrator', 'creator'].includes(status)) {
      await repo.upsertUser(person);
      const user = await repo.getUser(person.id);
      const link = repo.isVerified(user) ? repo.memberLink(user) : null;
      await repo.recordChannelJoin({ telegramId: person.id, channelId: update.chat.id, link });
    } else if (status === 'left') {
      await repo.markChannelMemberLeft(person.id);
    } else if (status === 'kicked') {
      // Bans made in Telegram directly. Kicks from the admin panel set their own status.
      await repo.setChannelMemberStatus(person.id, 'banned', null, { onlyIfMember: true });
    }
  });

  // Remember channels/groups the bot is added to, so the admin panel can offer them.
  bot.on('my_chat_member', async (ctx) => {
    const { chat, new_chat_member: me } = ctx.myChatMember;
    if (chat.type === 'private') return;
    await repo.upsertBotChat({ chatId: chat.id, title: chat.title, type: chat.type, username: chat.username, botStatus: me.status });
  });

  // Everything else only works in private chats.
  bot.chatType(['group', 'supergroup', 'channel']).use(() => {});

  bot.command('start', async (ctx) => {
    if (await questionnaireGate(ctx)) return;
    await showWelcome(ctx);
  });
  bot.command('help', (ctx) => ctx.reply(msg.help, HTML));
  bot.command('verify', async (ctx) => {
    if (await questionnaireGate(ctx)) return;
    await startVerification(ctx);
  });

  bot.command('link', async (ctx) => {
    if (await questionnaireGate(ctx)) return;
    const user = await repo.getUser(ctx.from.id);
    if (!repo.isVerified(user)) return ctx.reply(msg.notVerifiedYet, HTML);
    await withUserLock(ctx, () => deliverJoinLinks(ctx, user));
  });

  // Questionnaire buttons on the "enter the code" message.
  bot.callbackQuery('q_resend', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await repo.getUser(ctx.from.id);
    if (!user?.pending_phone) return resumeQuestionnaire(ctx, user);
    await withUserLock(ctx, () => answerPhone(ctx, user.pending_phone));
  });

  bot.callbackQuery('q_change', async (ctx) => {
    await ctx.answerCallbackQuery();
    await repo.clearPhoneRequest(ctx.from.id);
    const user = await repo.getUser(ctx.from.id);
    await resumeQuestionnaire(ctx, { ...user, state: null });
  });

  // Every other button waits until the questionnaire is done.
  bot.on('callback_query:data', async (ctx, next) => {
    if (await questionnaireGate(ctx)) return ctx.answerCallbackQuery();
    await next();
  });

  bot.callbackQuery('home', async (ctx) => {
    await ctx.answerCallbackQuery();
    await repo.setUserState(ctx.from.id, null);
    await showWelcome(ctx);
  });

  bot.callbackQuery('verify', async (ctx) => {
    await ctx.answerCallbackQuery();
    await startVerification(ctx);
  });

  bot.callbackQuery(/^verify:(elefin|xm)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await askForAccount(ctx, ctx.match[1]);
  });

  // Checks the last account again: an XM account ID (digits) or an Elefin email.
  bot.callbackQuery('recheck', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await repo.getUser(ctx.from.id);
    const last = user?.last_checked_email;
    if (!last) return startVerification(ctx);
    await withUserLock(ctx, () => (isLoginId(last) ? verifyXm(ctx, last) : verifyEmail(ctx, last)));
  });

  bot.callbackQuery('link', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await repo.getUser(ctx.from.id);
    if (!repo.isVerified(user)) {
      return createScreen(ctx).show(msg.notVerifiedYet, {
        keyboard: new InlineKeyboard().text('✅ Verify my account', 'verify'),
      });
    }
    await withUserLock(ctx, () => deliverJoinLinks(ctx, user));
  });

  // Phone shared with the "Share my phone number" button.
  bot.on('message:contact', async (ctx) => {
    const user = await repo.getUser(ctx.from.id);
    if (!(await questionnaireOn()) || !repo.needsProfile(user)) return showWelcome(ctx);
    if (!user?.full_name) return resumeQuestionnaire(ctx, user);
    await withUserLock(ctx, () => answerPhone(ctx, ctx.message.contact.phone_number));
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return ctx.reply(msg.help, HTML);

    const user = await repo.getUser(ctx.from.id);
    if ((await questionnaireOn()) && repo.needsProfile(user)) {
      if (user?.state === 'q_name' && !user.full_name) return answerName(ctx, text);
      if (user?.state === 'q_phone' && user.full_name) return withUserLock(ctx, () => answerPhone(ctx, text));
      if (user?.state === 'q_code' && user.full_name) return withUserLock(ctx, () => answerCode(ctx, text));
      return resumeQuestionnaire(ctx, user);
    }
    // Accept an email or an XM account ID any time; otherwise only nudge if we were waiting for one.
    const compact = text.replace(/\s+/g, '');
    const kind =
      user?.state === 'awaiting_xm' ? 'xm'
      : EMAIL_RE.test(text) ? 'elefin'
      : isLoginId(compact) && (await isBrokerEnabled('xm')) ? 'xm'
      : user?.state === 'awaiting_email' ? 'elefin'
      : null;
    if (kind) {
      if (repo.isVerified(user)) return withUserLock(ctx, () => deliverJoinLinks(ctx, user));
      return withUserLock(ctx, () => (kind === 'xm' ? verifyXm(ctx, compact) : verifyEmail(ctx, text)));
    }
    await showWelcome(ctx);
  });
}
