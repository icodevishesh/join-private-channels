'use client';

import { runBulkAction } from './runBulkAction';

/**
 * Kick / ban / allow a person everywhere it applies (Discord server and/or
 * Telegram channel), based on where they currently are.
 */
function targets(action, people, places) {
  const discord = [];
  const telegram = [];
  for (const p of people) {
    if (places.discord && p.discord_user_id) {
      const s = p.discord_status;
      if ((action === 'kick' && s === 'member') || (action === 'ban' && s !== 'banned') || (action === 'allow' && ['kicked', 'banned'].includes(s))) {
        discord.push(String(p.discord_user_id));
      }
    }
    if (places.channel) {
      const s = p.channel_status;
      // Banning works even if they never joined, so a later join request is declined.
      if ((action === 'kick' && s === 'member') || (action === 'ban' && s !== 'banned') || (action === 'allow' && ['kicked', 'banned'].includes(s))) {
        telegram.push(String(p.telegram_id));
      }
    }
  }
  return { discord, telegram };
}

/** @returns {{ total: number, failed: Array<{ id, error, where }>, stopped?: string }} */
export async function runPersonAction({ action, people, places, reason, onProgress }) {
  const { discord, telegram } = targets(action, people, places);
  const total = discord.length + telegram.length;
  onProgress?.({ done: 0, total });

  const d = await runBulkAction({ platform: 'discord', action, ids: discord, reason, onProgress: (n) => onProgress?.({ done: n, total }) });
  const t = await runBulkAction({ platform: 'telegram', action, ids: telegram, reason, onProgress: (n) => onProgress?.({ done: discord.length + n, total }) });

  return {
    total,
    stopped: d.error || t.error,
    failed: [...d.failed.map((f) => ({ ...f, where: 'Discord' })), ...t.failed.map((f) => ({ ...f, where: 'Telegram' }))],
  };
}
