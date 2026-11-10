// Admin roles and permissions, shared by the server (enforcement) and the UI (hiding buttons).

export const ROLES = {
  super: { label: 'Super admin', description: 'Can do everything, including managing admins.' },
  readonly: { label: 'Read-only', description: 'Can see everything, but can’t change anything.' },
  custom: { label: 'Custom', description: 'Can see everything, and do only what’s ticked below.' },
};

export const PERMISSIONS = [
  { id: 'members.manage', label: 'Kick, ban and allow members', hint: 'Actions on the Members page' },
  { id: 'incidents.manage', label: 'Resolve incidents', hint: 'Resolve, ignore and reopen on the Incidents page' },
  { id: 'cleanup.run', label: 'Bulk-remove inactive members', hint: 'Kick from the Inactivity cleanup page' },
  { id: 'brokers.edit', label: 'Edit brokers', hint: 'Turn Elefin/XM on or off, API access, join requirements' },
  { id: 'settings.edit', label: 'Edit settings', hint: 'Start questionnaire and Telegram bot limits' },
  { id: 'discord.edit', label: 'Edit Discord server settings', hint: 'Discord credentials, public URL, Discord fixes on Setup' },
  { id: 'telegram.edit', label: 'Edit Telegram channel settings', hint: 'Turn the channel on/off and pick the channel' },
];

export const PERMISSION_IDS = PERMISSIONS.map((p) => p.id);

/** Can this admin do `permission`? Only super admins can manage admins. */
export function can(admin, permission) {
  if (!admin) return false;
  if (admin.role === 'super') return true;
  if (admin.role !== 'custom' || permission === 'admins.manage') return false;
  return Array.isArray(admin.permissions) && admin.permissions.includes(permission);
}

// Which permission edits the settings on each admin page.
export const PAGE_PERMISSION = { settings: 'settings.edit', brokers: 'brokers.edit', discord: 'discord.edit', telegram: 'telegram.edit' };
