import { Bot, GrammyError, HttpError } from 'grammy';
import { config } from '../config.js';
import { registerHandlers } from './handlers.js';
import { genericError } from './messages.js';
import { recordIncident } from '../services/incidents.js';

export async function createBot() {
  const bot = new Bot(config.telegramToken);
  registerHandlers(bot);

  bot.catch(async (err) => {
    const e = err.error;
    if (e instanceof GrammyError) console.error('[telegram] request error:', e.description);
    else if (e instanceof HttpError) console.error('[telegram] network error:', e);
    else console.error('[bot] unhandled error:', e);
    await recordIncident({
      type: 'bot_error',
      reason: (e?.description ?? e?.message ?? String(e)).slice(0, 255),
      telegramId: err.ctx?.from?.id,
      details: { update: err.ctx?.update ? Object.keys(err.ctx.update).filter((k) => k !== 'update_id') : null },
    });
    await err.ctx.reply(genericError).catch(() => {});
  });

  await bot.api.setMyCommands([
    { command: 'start', description: 'Welcome & overview' },
    { command: 'verify', description: 'Verify your Elefin email' },
    { command: 'link', description: 'Join the Discord server' },
    { command: 'help', description: 'Show help' },
  ]);

  return bot;
}
