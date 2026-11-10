// Live status of the long-running parts (Telegram bot, Discord gateway), shared via
// globalThis so the admin panel's API routes — bundled separately by Next.js but
// running in the same process — can read it.
export const runtime = (globalThis.__tgdcRuntime ??= {
  startedAt: new Date(),
  bot: { state: 'starting', username: null, error: null },
  gateway: { state: 'starting', tag: null, error: null },
});
