// Single entry point. Runs on WEB_PORT:
//   /discord/callback  Discord OAuth2 redirect ("Login with Discord")
//   /admin             Next.js admin panel
//   /health            health check
// and also starts the Telegram bot (long polling) and the Discord gateway.
//
//   npm run dev     development (hot reload for the admin panel)
//   npm start       production (run `npm run build` first)

import dns from 'node:dns';

// Force DNS resolution to prefer IPv4 first so outgoing requests leave from the allowlisted IPv4 address (e.g. Elefin API).
dns.setDefaultResultOrder('ipv4first');

const dev = process.argv.includes('--dev');
process.env.NODE_ENV ??= dev ? 'development' : 'production';

const http = await import('node:http');
const { default: next } = await import('next');
const { config } = await import('./src/config.js');
const { pool } = await import('./src/db/pool.js');
const { migrate } = await import('./src/db/migrate.js');
const { runtime } = await import('./src/runtime.js');
const { createBot } = await import('./src/bot/createBot.js');
const { startDiscordGateway, stopDiscordGateway } = await import('./src/services/discordGateway.js');
const { handleDiscordCallback } = await import('./src/web/discordCallback.js');

await migrate();

// 1. Web server first, so the admin panel is reachable even if a bot fails to start.
const app = next({ dev, dir: import.meta.dirname, port: config.web.port });
const handle = app.getRequestHandler();
await app.prepare();

let bot = null;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // The site root is the admin panel.
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/admin' });
      return res.end();
    }
    if (url.pathname === '/discord/callback') return await handleDiscordCallback(req, res, url, bot?.api);
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, app: 'tg-discord-automation' }));
    }
    return await handle(req, res);
  } catch (err) {
    console.error('[web]', err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Internal error');
  }
});

await new Promise((resolve) => server.listen(config.web.port, resolve));
console.log(`[web] listening on http://localhost:${config.web.port}`);
console.log(`[web] admin panel: http://localhost:${config.web.port}/admin  ·  setup checks: /admin/setup`);

// 2. Telegram bot.
try {
  bot = await createBot();
  bot
    .start({
      // chat_member must be asked for explicitly; join requests and my_chat_member drive the Telegram channel.
      allowed_updates: ['message', 'callback_query', 'chat_join_request', 'chat_member', 'my_chat_member'],
      onStart: (me) => {
        Object.assign(runtime.bot, { state: 'running', username: me.username, error: null });
        console.log(`[bot] @${me.username} is running`);
      },
    })
    .catch((err) => {
      Object.assign(runtime.bot, { state: 'error', error: err.message });
      console.error('[bot] stopped:', err.message);
    });
} catch (err) {
  Object.assign(runtime.bot, { state: 'error', error: err.message });
  console.error('[bot] failed to start:', err.message);
}

// 3. Discord gateway (member join/leave tracking).
startDiscordGateway().catch((err) => console.error('[discord-gw]', err));
// Lets the admin panel reconnect the gateway, e.g. right after enabling the members intent.
runtime.restartGateway = async () => {
  await stopDiscordGateway();
  Object.assign(runtime.gateway, { state: 'starting', error: null });
  await startDiscordGateway();
};

const shutdown = async () => {
  server.close();
  await bot?.stop().catch(() => {});
  await stopDiscordGateway();
  await pool.end();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
