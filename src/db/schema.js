// Declarative schema. On startup, migrate.js creates any missing table,
// column or index listed here. Existing columns are never dropped or altered.

export const tables = {
  // People who can sign in to the admin panel. Passwords are scrypt hashes.
  // session_version goes up when the password changes, which signs out old sessions.
  admins: {
    columns: {
      id: 'INT UNSIGNED NOT NULL AUTO_INCREMENT',
      username: 'VARCHAR(64) NOT NULL',
      password_hash: 'VARCHAR(255) NOT NULL',
      role: "VARCHAR(20) NOT NULL DEFAULT 'readonly'", // super | readonly | custom
      permissions: 'JSON NULL',
      session_version: 'INT NOT NULL DEFAULT 0',
      created_by: 'INT UNSIGNED NULL',
      last_login_at: 'DATETIME NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    },
    primaryKey: ['id'],
    indexes: {
      uq_admins_username: { columns: ['username'], unique: true },
    },
  },

  settings: {
    columns: {
      key: 'VARCHAR(100) NOT NULL',
      value: 'TEXT NULL',
      description: 'VARCHAR(255) NULL',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    },
    primaryKey: ['key'],
  },

  conditions: {
    columns: {
      id: 'INT UNSIGNED NOT NULL AUTO_INCREMENT',
      condition_key: 'VARCHAR(50) NOT NULL',
      label: 'VARCHAR(150) NOT NULL',
      threshold: 'DECIMAL(18,2) NOT NULL DEFAULT 0',
      is_active: 'TINYINT(1) NOT NULL DEFAULT 0',
      sort_order: 'INT NOT NULL DEFAULT 0',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    },
    primaryKey: ['id'],
    indexes: {
      uq_conditions_key: { columns: ['condition_key'], unique: true },
    },
  },

  tg_users: {
    columns: {
      telegram_id: 'BIGINT NOT NULL',
      username: 'VARCHAR(64) NULL',
      first_name: 'VARCHAR(128) NULL',
      last_name: 'VARCHAR(128) NULL',
      // Start questionnaire: the name they typed and their phone, verified through Telegram Gateway.
      full_name: 'VARCHAR(128) NULL',
      phone: 'VARCHAR(20) NULL',
      phone_verified_at: 'DATETIME NULL',
      // A phone check in progress: the number, Gateway's request ID and when the code was sent.
      pending_phone: 'VARCHAR(20) NULL',
      phone_request_id: 'VARCHAR(64) NULL',
      phone_code_sent_at: 'DATETIME NULL',
      state: 'VARCHAR(30) NULL',
      // Last account the user tried: an Elefin email or an XM MT5 account ID.
      last_checked_email: 'VARCHAR(191) NULL',
      // Broker the user verified with (elefin | xm). NULL = not verified.
      broker: 'VARCHAR(20) NULL',
      verified_email: 'VARCHAR(191) NULL', // Elefin only
      elefin_client_id: 'BIGINT NULL',
      xm_login_id: 'VARCHAR(20) NULL', // XM MT5 account ID (XM's API has no emails)
      verified_at: 'DATETIME NULL',
      discord_user_id: 'VARCHAR(32) NULL',
      channel_invite_link: 'VARCHAR(255) NULL',
      channel_invite_expires_at: 'DATETIME NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    },
    primaryKey: ['telegram_id'],
    indexes: {
      // One Elefin email can only be claimed by one Telegram account.
      uq_tg_users_verified_email: { columns: ['verified_email'], unique: true },
      // Same for an XM account.
      uq_tg_users_xm_login: { columns: ['xm_login_id'], unique: true },
      // One Discord account per verified Telegram user.
      uq_tg_users_discord: { columns: ['discord_user_id'], unique: true },
    },
  },

  verification_logs: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      telegram_id: 'BIGINT NOT NULL',
      broker: "VARCHAR(20) NOT NULL DEFAULT 'elefin'",
      email: 'VARCHAR(191) NOT NULL', // the account checked: Elefin email or XM MT5 account ID
      elefin_client_id: 'BIGINT NULL',
      result: 'VARCHAR(20) NOT NULL', // not_found | failed | passed | taken | error
      details: 'JSON NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
    },
    primaryKey: ['id'],
    indexes: {
      idx_vlogs_telegram: { columns: ['telegram_id'] },
      idx_vlogs_email: { columns: ['email'] },
      idx_vlogs_broker: { columns: ['broker', 'created_at'] },
    },
  },

  // Local copy of the Elefin client list, refreshed by src/services/elefinSync.js.
  elefin_clients: {
    columns: {
      client_id: 'BIGINT NOT NULL',
      email: 'VARCHAR(191) NULL',
      name: 'VARCHAR(191) NULL',
      country: 'VARCHAR(100) NULL',
      status: 'VARCHAR(20) NULL',
      registered_at: 'DATETIME NULL',
      deposits: 'DECIMAL(18,2) NULL',
      net_deposit: 'DECIMAL(18,2) NULL',
      balance: 'DECIMAL(18,2) NULL',
      equity: 'DECIMAL(18,2) NULL',
      lots: 'DECIMAL(18,2) NULL',
      trades: 'INT NULL',
      last_trade_at: 'DATETIME NULL',
      is_funded: 'TINYINT(1) NULL',
      data: 'JSON NULL',
      synced_at: 'DATETIME NOT NULL',
    },
    primaryKey: ['client_id'],
    indexes: {
      idx_eclients_email: { columns: ['email'] },
      idx_eclients_synced: { columns: ['synced_at'] },
    },
  },

  // One-time "Connect with Discord" links. `state` is sent through Discord OAuth2
  // and tells us which verified Telegram user is logging in.
  discord_oauth_states: {
    columns: {
      state: 'VARCHAR(64) NOT NULL',
      telegram_id: 'BIGINT NOT NULL',
      expires_at: 'DATETIME NOT NULL',
      used_at: 'DATETIME NULL',
      discord_user_id: 'VARCHAR(32) NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
    },
    primaryKey: ['state'],
    indexes: {
      idx_oauth_telegram: { columns: ['telegram_id'] },
    },
  },

  // People in the private Telegram channel (joined through the bot's join requests,
  // or seen joining/leaving). One row per Telegram user.
  channel_members: {
    columns: {
      telegram_id: 'BIGINT NOT NULL',
      channel_id: 'VARCHAR(32) NOT NULL',
      // Set for people who joined through the bot: their broker and account.
      broker: 'VARCHAR(20) NULL',
      email: 'VARCHAR(191) NULL',
      elefin_client_id: 'BIGINT NULL',
      xm_login_id: 'VARCHAR(20) NULL',
      status: "VARCHAR(20) NOT NULL DEFAULT 'member'", // member | left | kicked | banned
      joined_at: 'DATETIME NULL',
      left_at: 'DATETIME NULL',
      action_reason: 'VARCHAR(255) NULL',
      action_at: 'DATETIME NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    },
    primaryKey: ['telegram_id'],
    indexes: {
      idx_cmembers_client: { columns: ['elefin_client_id'] },
      idx_cmembers_xm: { columns: ['xm_login_id'] },
      idx_cmembers_status: { columns: ['status'] },
    },
  },

  // Channels/groups the Telegram bot has been added to (from my_chat_member updates),
  // so the admin panel can offer them with one click instead of asking for a chat ID.
  bot_chats: {
    columns: {
      chat_id: 'VARCHAR(32) NOT NULL',
      title: 'VARCHAR(255) NULL',
      type: 'VARCHAR(20) NULL',
      username: 'VARCHAR(64) NULL',
      bot_status: 'VARCHAR(20) NULL',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    },
    primaryKey: ['chat_id'],
  },

  // Problems the bot or server ran into, as a to-do list for admins (Incidents page).
  // An identical open incident (same user, type and reason) is counted, not duplicated.
  incidents: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      telegram_id: 'BIGINT NULL',
      type: 'VARCHAR(40) NOT NULL',
      severity: "VARCHAR(10) NOT NULL DEFAULT 'warning'", // info | warning | error
      reason: 'VARCHAR(255) NULL',
      details: 'JSON NULL',
      occurrences: 'INT UNSIGNED NOT NULL DEFAULT 1',
      last_seen_at: 'DATETIME NULL',
      status: "VARCHAR(10) NOT NULL DEFAULT 'open'", // open | resolved | ignored
      resolved_by: 'VARCHAR(64) NULL',
      resolution_note: 'VARCHAR(2000) NULL',
      resolved_at: 'DATETIME NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
    },
    primaryKey: ['id'],
    indexes: {
      idx_incidents_status: { columns: ['status'] },
      idx_incidents_user: { columns: ['telegram_id'] },
      idx_incidents_type: { columns: ['type'] },
    },
  },

  // Every member of the Discord server. Members added through "Connect with Discord"
  // are linked to their Telegram account and Elefin client.
  discord_members: {
    columns: {
      discord_user_id: 'VARCHAR(32) NOT NULL',
      username: 'VARCHAR(64) NULL',
      display_name: 'VARCHAR(128) NULL',
      telegram_id: 'BIGINT NULL',
      broker: 'VARCHAR(20) NULL',
      email: 'VARCHAR(191) NULL',
      elefin_client_id: 'BIGINT NULL',
      xm_login_id: 'VARCHAR(20) NULL',
      status: "VARCHAR(20) NOT NULL DEFAULT 'member'", // member | left | kicked | banned
      joined_at: 'DATETIME NULL',
      left_at: 'DATETIME NULL',
      action_reason: 'VARCHAR(255) NULL',
      action_at: 'DATETIME NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    },
    primaryKey: ['discord_user_id'],
    indexes: {
      idx_dmembers_telegram: { columns: ['telegram_id'] },
      idx_dmembers_client: { columns: ['elefin_client_id'] },
      idx_dmembers_xm: { columns: ['xm_login_id'] },
      idx_dmembers_status: { columns: ['status'] },
    },
  },
};

// Default rows inserted only when the key is missing (never overwrites).
export const defaultSettings = [
  { key: 'elefin_enabled', value: '1', description: 'Let Elefin clients verify with their email' },
  { key: 'elefin_token', value: '', description: 'Bearer token for the Elefin CRM API' },
  { key: 'elefin_api_base', value: '', description: 'Elefin partner API base URL (ends in /api/v1)' },
  { key: 'referral_link', value: '', description: 'Elefin partner/referral signup link shown to non-affiliated users' },
  { key: 'xm_enabled', value: '0', description: 'Let XM clients verify with their MT5 account ID' },
  { key: 'xm_api_token', value: '', description: 'XM partners API token (sent as a Bearer token)' },
  { key: 'xm_api_base', value: 'https://mypartners.xm.com/api', description: 'XM partners API base URL' },
  { key: 'xm_signup_url', value: '', description: 'XM partner sign-up link, shown to users who aren’t under your link or don’t qualify yet' },
  { key: 'xm_min_lots', value: '1', description: 'Lots the account must have traded in the window below (0 = no minimum)' },
  { key: 'xm_lots_window_days', value: '90', description: 'Count lots traded in the last N days (1–365)' },
  { key: 'xm_reject_archived', value: '1', description: 'Turn away accounts XM has archived' },
  { key: 'xm_require_balance', value: '0', description: 'Require a balance above the threshold agreed with XM' },
  { key: 'questionnaire_enabled', value: '1', description: 'Ask new and returning users for their name and phone number (verified by Telegram) before anything else' },
  { key: 'telegram_gateway_token', value: '', description: 'Telegram Gateway API token (gateway.telegram.org → API) used to send phone verification codes' },
  { key: 'discord_enabled', value: '1', description: 'Send verified users a Discord server join button' },
  { key: 'telegram_channel_enabled', value: '0', description: 'Send verified users a Telegram channel join link' },
  { key: 'telegram_channel_id', value: '', description: 'The private channel the bot invites users to (add the bot as admin and pick it from the list)' },
  { key: 'public_url', value: '', description: 'Public HTTPS address of this server (no trailing slash). Discord sends users back to <public URL>/discord/callback' },
  { key: 'discord_bot_token', value: '', description: 'Developer Portal → your app → Bot → Reset Token' },
  { key: 'discord_guild_id', value: '', description: 'Right-click your server in Discord → Copy Server ID (turn on Developer Mode first)' },
  { key: 'discord_client_secret', value: '', description: 'Developer Portal → your app → OAuth2 → Client Secret (Reset Secret)' },
  { key: 'discord_client_id', value: '', description: 'Optional. Detected automatically from the bot token' },
  { key: 'discord_member_role_id', value: '', description: 'Optional. Role given to members added by the bot (right-click role → Copy Role ID)' },
  { key: 'discord_connect_link_ttl_minutes', value: '60', description: 'How long join links (Discord and Telegram) stay valid' },
  { key: 'max_verification_attempts_per_hour', value: '10', description: 'Rate limit for email checks per Telegram user' },
];

// Settings from older versions that are no longer used; removed on startup.
export const obsoleteSettings = ['discord_invite_max_age_seconds'];

// All supported condition types. Seeded DISABLED; set is_active = 1 and threshold in the DB.
// {{value}} in the label is replaced with the threshold.
export const defaultConditions = [
  { condition_key: 'min_deposit', label: 'Total deposits of at least ${{value}}', threshold: 100, sort_order: 1 },
  { condition_key: 'min_balance', label: 'Account balance of at least ${{value}}', threshold: 50, sort_order: 2 },
  { condition_key: 'min_lots', label: 'At least {{value}} lots traded', threshold: 1, sort_order: 3 },
  { condition_key: 'min_trades', label: 'At least {{value}} trades placed', threshold: 5, sort_order: 4 },
  { condition_key: 'last_trade_within_days', label: 'Last trade within the past {{value}} days', threshold: 30, sort_order: 5 },
];
