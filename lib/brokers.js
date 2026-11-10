// Brokers users can verify with, shared by the bot, the server and the admin panel.
export const BROKERS = {
  elefin: { id: 'elefin', label: 'Elefin', account: 'Email', signupKey: 'referral_link' },
  xm: { id: 'xm', label: 'XM', account: 'MT5 account ID', signupKey: 'xm_signup_url' },
};

export const BROKER_IDS = Object.keys(BROKERS);

export const brokerLabel = (id) => BROKERS[id]?.label ?? id ?? '—';

/** The account a person verified with, for display: their email or "XM #12345678". */
export function accountLabel({ broker, email, xm_login_id }) {
  if (broker === 'xm' || (!email && xm_login_id)) return xm_login_id ? `MT5 #${xm_login_id}` : '—';
  return email || '—';
}
