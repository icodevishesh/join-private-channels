// Incident types, shared by the server (recording) and the admin panel (labels, filters).
export const INCIDENT_TYPES = {
  elefin_api_error: { label: 'Elefin API error', severity: 'error', hint: 'Checking a user’s email with Elefin failed. Check Brokers → Elefin and the Setup page.' },
  xm_api_error: { label: 'XM API error', severity: 'error', hint: 'Checking a user’s XM account failed. Check Brokers → XM and test the connection there.' },
  elefin_sync_failed: { label: 'Elefin sync failed', severity: 'error', hint: 'Downloading the client list for Inactivity cleanup failed.' },
  not_affiliated: { label: 'Not affiliated', severity: 'info', hint: 'The Elefin email or XM account isn’t under your partner link. The user was shown the sign-up link.' },
  requirements_failed: { label: 'Requirements not met', severity: 'info', hint: 'The user is under your partner link but didn’t pass the join requirements yet.' },
  referral_link_missing: { label: 'Referral link not set', severity: 'warning', hint: 'A user who isn’t affiliated got no sign-up link. Set it on the Brokers page.' },
  email_taken: { label: 'Account already linked', severity: 'warning', hint: 'Someone tried an Elefin email or XM account that another Telegram account already verified.' },
  discord_unavailable: { label: 'Discord link unavailable', severity: 'error', hint: 'The bot couldn’t create a Discord join button. Check the Discord Server settings.' },
  discord_join_failed: { label: 'Discord join failed', severity: 'error', hint: 'Adding a user to the server after “Authorize” failed.' },
  discord_login_rejected: { label: 'Discord login rejected', severity: 'warning', hint: 'A Discord login was refused (wrong account, already linked, or banned).' },
  discord_connection_error: { label: 'Discord connection error', severity: 'error', hint: 'The bot couldn’t connect to Discord, e.g. an invalid bot token.' },
  channel_unavailable: { label: 'Channel link unavailable', severity: 'error', hint: 'The bot couldn’t create a Telegram channel link. Check the Telegram Channel setup.' },
  channel_join_declined: { label: 'Channel join declined', severity: 'info', hint: 'Someone who isn’t verified (or is banned) asked to join the channel.' },
  channel_approve_failed: { label: 'Channel approval failed', severity: 'error', hint: 'Approving a verified user’s join request failed.' },
  removal_failed: { label: 'Kick/ban failed', severity: 'error', hint: 'A kick, ban or allow-rejoin from the admin panel failed.' },
  notify_failed: { label: 'Telegram message failed', severity: 'info', hint: 'The bot couldn’t message a user, usually because they blocked it.' },
  phone_verification_failed: { label: 'Phone verification failed', severity: 'error', hint: 'Sending or checking a phone code through Telegram Gateway failed. Check the Gateway token in Settings → Start questionnaire.' },
  bot_error: { label: 'Bot error', severity: 'error', hint: 'Something unexpected went wrong in the Telegram bot.' },
};

export const INCIDENT_STATUSES = ['open', 'resolved', 'ignored'];
export const INCIDENT_SEVERITIES = ['info', 'warning', 'error'];
