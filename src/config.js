import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}`);
  return value;
}

const webPort = Number(process.env.WEB_PORT || 3000);

export const config = {
  telegramToken: required('TELEGRAM_BOT_TOKEN'),
  db: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD ?? '',
  },
  web: {
    port: webPort,
    // Fallback only: the public URL is managed in the admin panel (settings.public_url).
    publicUrl: (process.env.PUBLIC_URL || `http://localhost:${webPort}`).replace(/\/+$/, ''),
  },
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    // Optional role given to members added by the bot.
    memberRoleId: process.env.DISCORD_MEMBER_ROLE_ID || '',
  },
  // Admin accounts live in the database (created in the admin panel).
  admin: {
    sessionSecret: process.env.ADMIN_SESSION_SECRET || '',
  },
  elefinTokenSeed: process.env.ELEFIN_TOKEN_SEED || '',
};

