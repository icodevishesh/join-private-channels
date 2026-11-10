// All user-facing copy lives here (Telegram HTML parse mode).

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const orList = (labels) => (labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}` : labels[0] ?? '');

// `brokers` are the enabled brokers' labels, e.g. ['Elefin', 'XM'].
export const welcome = (firstName, brokers = ['Elefin']) => `
👋 <b>Hey ${esc(firstName) || 'Trader'}, welcome aboard!</b>

You just found the doorway to our <b>private trading community</b> 🔐📈

Here's what's waiting for you inside:
📊 <b>Daily market updates</b> — key levels, news &amp; setups before the bell
💡 <b>Trading tips &amp; tricks</b> — risk management, entries, exits, psychology
🧠 <b>Learn from real traders</b> — breakdowns of live trades, wins <i>and</i> losses
🤝 <b>A focused community</b> — no spam, no noise, just people leveling up

<b>How to get in (takes ~30 seconds):</b>
${
  brokers.length > 1
    ? `1️⃣ Tap <b>“Verify my account”</b> below and pick your broker (<b>${orList(brokers)}</b>)
2️⃣ Send your Elefin email or your XM MT5 account ID`
    : brokers[0] === 'XM'
      ? `1️⃣ Tap <b>“Verify my XM account”</b> below
2️⃣ Send your <b>XM MT5 account ID</b>`
      : `1️⃣ Tap <b>“Verify my Elefin account”</b> below
2️⃣ Send the email you registered with on <b>Elefin</b>`
}
3️⃣ Get your <b>personal join links</b> and you're in 🎟️

Ready? Let's go 👇`.trim();

export const askEmail = `
📧 <b>Send me the email address you use on your Elefin account.</b>

Just type it in the chat, e.g. <code>you@example.com</code>`.trim();

export const invalidEmail = `
🤔 Hmm, that doesn't look like a valid email.

Please send the exact email you registered with on Elefin, e.g. <code>you@example.com</code>`.trim();

export const checking = (broker = 'Elefin') => `🔎 Checking your ${broker} account… one moment.`;

export const chooseBroker = `
🏦 <b>Which broker is your trading account with?</b>

Pick one below.`.trim();

export const askXm = `
🔢 <b>Send me your XM MT5 account ID.</b>

It's the number you log in to MetaTrader 5 with (numbers only), e.g. <code>12345678</code>`.trim();

export const invalidXm = `
🤔 Hmm, that doesn't look like an XM MT5 account ID.

Please send just the numbers, e.g. <code>12345678</code>`.trim();

export const verificationClosed = `
🔒 <b>Verification is closed right now.</b>

Please check back later or contact support.`.trim();

export const brokerClosed = (broker) => `
🔒 <b>${esc(broker)} verification is closed right now.</b>

Please check back later or contact support.`.trim();

export const notAffiliatedXm = (loginId, hasLink) => `
😕 <b>We couldn't find XM account <code>${esc(loginId)}</code> under our partner link.</b>

To unlock our private community, please <b>open an XM account using the link below</b> 👇
${hasLink ? '' : '\n<i>(The signup link is being set up — please check back shortly.)</i>\n'}
Already signed up through us? Double-check the account ID and send it again.`.trim();

export const xmTaken = `
🚫 This XM account is already linked to another Telegram account.

If this is your account and you didn't link it, please contact support.`.trim();

export const notAffiliated = (email, hasLink) => `
😕 <b>We couldn't find <code>${esc(email)}</code> under our partner link.</b>

You are not affiliated with our partner link yet. To unlock our private community, please <b>open an account on Elefin using the link below</b> 👇
${hasLink ? '' : '\n<i>(The signup link is being set up — please check back shortly.)</i>\n'}
Already signed up through us? Double-check the email for typos and send it again.`.trim();

export const conditionsReport = ({ client, results, passed, broker = 'Elefin' }) => {
  const lines = results.map(
    (r) => `${r.passed ? '✅' : '❌'} ${esc(r.label)}\n      <i>You: ${esc(r.actual)}</i>`,
  );
  const passedCount = results.filter((r) => r.passed).length;

  if (passed) {
    return `
🎉 <b>You're verified, ${esc(client.name?.split(' ')[0] || 'Trader')}!</b>
${results.length ? `\n<b>Requirements (${passedCount}/${results.length}):</b>\n${lines.join('\n')}` : ''}`.trim();
  }

  return `
👍 <b>Good news:</b> your ${esc(broker)} account is linked with us!

But you haven't met all the requirements to join yet <b>(${passedCount}/${results.length} passed)</b>:

${lines.join('\n')}

Once you've completed the ❌ items, tap <b>“Check again”</b> and you'll be in 🚀`.trim();
};

// Status of each place in the join message:
// 'link' (button to join) | 'member' (already in) | 'banned' | 'unavailable' | null (turned off)
const DISCORD_LINE = {
  link: '💬 <b>Discord server</b>: tap <b>“Join the Discord server”</b>, log in with Discord and tap <b>Authorize</b>. You\'re added automatically. Use the Discord account you want to keep, as it gets linked to your broker account.',
  member: '💬 <b>Discord server</b>: ✅ you\'re already in.',
  banned: '💬 <b>Discord server</b>: 🚫 your access was removed. Contact support if this is a mistake.',
  unavailable: '💬 <b>Discord server</b>: ⚠️ not available right now. Tap <b>“Try again”</b> in a few minutes.',
};
const CHANNEL_LINE = {
  link: '📢 <b>Telegram channel</b>: tap <b>“Join the Telegram channel”</b>, then <b>Request to join</b>. The bot approves you right away.',
  member: '📢 <b>Telegram channel</b>: ✅ you\'re already in.',
  banned: '📢 <b>Telegram channel</b>: 🚫 your access was removed. Contact support if this is a mistake.',
  unavailable: '📢 <b>Telegram channel</b>: ⚠️ not available right now. Tap <b>“Try again”</b> in a few minutes.',
};

export const joinLinks = ({ discord, channel, minutes }) => {
  const lines = [discord && DISCORD_LINE[discord], channel && CHANNEL_LINE[channel]].filter(Boolean);
  const hasLink = discord === 'link' || channel === 'link';
  const allIn = [discord, channel].filter(Boolean).every((s) => s === 'member');
  return [
    allIn ? '✅ <b>You\'re all set!</b>' : '🚀 <b>Last step: join the community!</b>',
    '',
    lines.join('\n\n'),
    ...(hasLink ? ['', `⏳ Join links work for ${minutes} minutes and only for you. Send /link if they expire.`] : []),
  ].join('\n');
};

export const joiningClosed = `
🔒 <b>Joining is closed right now.</b>

You're verified. Please check back later or contact support.`.trim();

export const kickedNotice = (reason) => `
👋 <b>You've been removed from our private community.</b>
${reason ? `\nReason: <i>${esc(reason)}</i>\n` : ''}
Want back in? Send /verify, verify your broker account again and, if you meet the requirements, you'll get new join links. 🔄`.trim();

export const channelJoined = `
🎉 <b>You're in!</b> Welcome to our private Telegram channel. 📈🔥`.trim();

export const channelJoinDeclined = `
🔒 <b>Your request to join the channel wasn't approved.</b>

Only verified members can join. Send /start to verify your broker account and get your personal join link.`.trim();

export const joinedSuccess = (name) => `
🎉 <b>Welcome to the community${name ? `, ${esc(name)}` : ''}!</b>

You've been added to our private Discord server. Open Discord to see the daily updates and trading tips. 📈🔥`.trim();

export const emailTaken = `
🚫 This Elefin email is already linked to another Telegram account.

If this is your email and you didn't link it, please contact support.`.trim();

export const rateLimited = '⏱️ Too many attempts. Please wait a bit and try again later.';

export const genericError = '⚠️ Something went wrong on our side. Please try again in a few minutes.';

export const notVerifiedYet = "You haven't verified yet. Send /verify to get started.";

export const help = `
<b>Commands</b>
/start — welcome &amp; overview
/verify — verify your broker account
/link — get your join links (verified users)
/help — show this message`.trim();

// ---------- start questionnaire ----------
export const askName = `
👋 <b>Welcome! Before we start, a quick introduction.</b>

What's your <b>full name</b>? Just type it below.`.trim();

export const invalidName = '🤔 Please send your name as plain text (2 to 64 characters).';

export const askPhone = (name) => `
Nice to meet you, <b>${esc(name)}</b>! 🙌

📱 Now share your <b>phone number</b>: tap <b>“Share my phone number”</b> below, or type it with the country code, e.g. <code>+44 7700 900123</code>.

We'll send you a code on Telegram to confirm it.`.trim();

export const invalidPhone = `
🤔 That doesn't look like a valid phone number.

Please include the country code, e.g. <code>+44 7700 900123</code>, or tap <b>“Share my phone number”</b>.`.trim();

export const phoneUnavailable = `
😕 We couldn't send a code to this number. It needs to be a phone number with a Telegram account.

Please check it and try again.`.trim();

export const askCode = (phone, length) => `
📨 We've sent a <b>${length}-digit code</b> to <code>${esc(phone)}</code> as a Telegram message (from “Verification Codes”).

Type the code here.`.trim();

export const codeCooldown = (seconds) => `⏱️ A code was just sent. You can ask for a new one in ${seconds} seconds.`;

export const invalidCodeFormat = (length) => `🔢 Please type the ${length}-digit code we sent you.`;

export const wrongCode = '❌ That code isn\'t right. Please check it and try again.';

export const codeExpired = '⌛ This code has expired or had too many tries. Tap <b>“Send a new code”</b>.';

export const profileDone = (name) => `✅ <b>Thanks, ${esc(name)}!</b> Your phone number is confirmed.`;
