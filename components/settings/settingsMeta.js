// How each settings key is shown in the admin panel, and on which page.
// Keys not listed here appear under "Other" on the Settings page.
export const PAGES = {
  settings: '/admin/settings',
  brokers: '/admin/brokers',
  discord: '/admin/discord',
  telegram: '/admin/telegram',
};

export const SECTIONS = [
  {
    id: 'discord',
    page: 'discord',
    title: 'Discord server',
    description: 'Bot and “Login with Discord” credentials from the Discord Developer Portal.',
    fields: {
      discord_enabled: { label: 'Enabled', type: 'toggle' },
      discord_bot_token: { label: 'Bot token', placeholder: 'Paste the bot token', mono: true },
      discord_guild_id: { label: 'Server ID', placeholder: 'e.g. 123456789012345678', inputMode: 'numeric' },
      discord_client_secret: { label: 'Client secret', placeholder: 'Paste the client secret', mono: true },
      discord_member_role_id: { label: 'Member role ID', placeholder: 'Optional', inputMode: 'numeric' },
      discord_client_id: { label: 'Client ID', placeholder: 'Detected automatically', inputMode: 'numeric' },
    },
  },
  {
    id: 'web',
    page: 'discord',
    title: 'Public URL',
    description: 'Where this server is reachable from the internet. Discord sends users back to <public URL>/discord/callback after they tap “Authorize”.',
    fields: {
      public_url: { label: 'Public URL', placeholder: 'https://bot.example.com', type: 'url' },
    },
  },
  {
    id: 'channel',
    page: 'telegram',
    title: 'Telegram channel',
    description: 'Verified users get a personal join link; the bot approves only them.',
    fields: {
      telegram_channel_enabled: { label: 'Enabled', type: 'toggle' },
      telegram_channel_id: { label: 'Channel ID', placeholder: 'Pick a channel above, or paste e.g. -1001234567890', mono: true },
    },
  },
  {
    id: 'elefin',
    page: 'brokers',
    title: 'Elefin',
    description: 'Users verify with the email of their Elefin account. Join requirements are below.',
    fields: {
      elefin_enabled: { label: 'Enabled', type: 'toggle' },
      elefin_token: { label: 'API token', placeholder: 'Paste the Elefin API token' },
      referral_link: { label: 'Referral link', placeholder: 'https://…', type: 'url' },
      elefin_api_base: { label: 'API base URL', type: 'url', placeholder: 'https://…/api/v1' },
    },
  },
  {
    id: 'xm',
    page: 'brokers',
    title: 'XM',
    description: 'Users verify with their XM MT5 account ID (XM’s API has no emails). The account must be under your XM partner link. Join requirements are below.',
    fields: {
      xm_enabled: { label: 'Enabled', type: 'toggle' },
      xm_api_token: { label: 'API token', placeholder: 'Paste the XM partners API token' },
      xm_signup_url: { label: 'Sign-up link', placeholder: 'https://…', type: 'url' },
      xm_api_base: { label: 'API base URL', type: 'url', placeholder: 'https://mypartners.xm.com/api' },
    },
  },
  {
    id: 'xm_requirements',
    page: 'brokers',
    title: 'XM join requirements',
    description: 'XM clients must meet all of these to join.',
    fields: {
      xm_min_lots: { label: 'Minimum lots', type: 'number', suffix: 'lots', step: '0.01' },
      xm_lots_window_days: { label: 'Lots window', type: 'number', suffix: 'days' },
      xm_reject_archived: { label: 'Reject archived accounts', type: 'toggle' },
      xm_require_balance: { label: 'Require balance above threshold', type: 'toggle' },
    },
  },
  {
    id: 'questionnaire',
    page: 'settings',
    title: 'Start questionnaire',
    description: 'When users start the bot, ask for their name and phone number first. The phone is confirmed with a code sent through Telegram Gateway.',
    fields: {
      questionnaire_enabled: { label: 'Enabled', type: 'toggle' },
      telegram_gateway_token: { label: 'Telegram Gateway token', placeholder: 'Paste the token from gateway.telegram.org' },
    },
  },
  {
    id: 'bot',
    page: 'settings',
    title: 'Telegram bot',
    description: 'Limits for the verification flow.',
    fields: {
      discord_connect_link_ttl_minutes: { label: 'Join link lifetime', type: 'number', suffix: 'minutes' },
      max_verification_attempts_per_hour: { label: 'Email checks per user', type: 'number', suffix: 'per hour' },
    },
  },
];

/** The page a settings key is edited on (used by the Setup page's "Fix now" links). */
export function settingsPageFor(key) {
  if (key === 'conditions') return PAGES.brokers;
  const section = SECTIONS.find((s) => key in s.fields);
  return PAGES[section?.page ?? 'settings'];
}

/** The settings rows for one page, split into its sections (plus "Other" on the Settings page). */
export function groupSettings(settings, page) {
  const byKey = new Map(settings.map((s) => [s.key, s]));
  const groups = SECTIONS.filter((s) => s.page === page).map((section) => ({
    ...section,
    rows: Object.keys(section.fields)
      .filter((key) => byKey.has(key))
      .map((key) => ({ ...byKey.get(key), meta: section.fields[key] })),
  }));
  if (page === 'settings') {
    const known = new Set(SECTIONS.flatMap((s) => Object.keys(s.fields)));
    const other = settings.filter((s) => !known.has(s.key)).map((s) => ({ ...s, meta: { label: s.key } }));
    if (other.length) groups.push({ id: 'other', title: 'Other', fields: {}, rows: other });
  }
  return groups.filter((g) => g.rows.length);
}
