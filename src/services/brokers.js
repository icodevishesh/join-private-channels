import { getSettings } from '../db/repo.js';
import { BROKERS } from '../../lib/brokers.js';

/** Brokers users can verify with right now, in display order, with their sign-up links. */
export async function getEnabledBrokers() {
  const s = await getSettings(['elefin_enabled', 'xm_enabled', 'referral_link', 'xm_signup_url']);
  return Object.values(BROKERS)
    .filter((b) => (s[`${b.id}_enabled`] ?? (b.id === 'elefin' ? '1' : '0')) === '1')
    .map((b) => ({ ...b, signupUrl: s[b.signupKey] || null }));
}

export async function isBrokerEnabled(id) {
  return (await getEnabledBrokers()).some((b) => b.id === id);
}
