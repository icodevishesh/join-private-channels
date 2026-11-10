import { config } from '../config.js';
import { recordIncident } from './incidents.js';

/**
 * Sends a Telegram message from the bot. Works from anywhere (including the admin
 * panel's API routes), since it calls the Bot API directly. Never throws: a user who
 * blocked the bot shouldn't make a kick fail.
 */
export async function notifyTelegramUser(telegramId, html) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    if (!body?.ok) {
      console.warn(`[telegram] could not notify ${telegramId}: ${body?.description ?? res.status}`);
      await recordIncident({ type: 'notify_failed', reason: body?.description ?? `HTTP ${res.status}`, telegramId });
    }
    return Boolean(body?.ok);
  } catch (err) {
    console.warn(`[telegram] could not notify ${telegramId}: ${err.message}`);
    return false;
  }
}
