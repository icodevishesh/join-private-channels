import Link from 'next/link';
import { buttonClass } from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import SettingsSection from '@/components/settings/SettingsSection';
import HashHighlighter from '@/components/settings/HashHighlighter';
import { groupSettings } from '@/components/settings/settingsMeta';
import { getSettingsForAdmin } from '@/src/db/adminRepo.js';

export const metadata = { title: 'Discord Server · Spaceship' };

export default async function DiscordSetupPage() {
  const settings = await getSettingsForAdmin();

  return (
    <>
      <PageHeader
        title="Discord Server"
        description="Verified users get a “Login with Discord” button and are added to your server automatically."
        actions={
          <Link
            href="/admin/setup"
            className={buttonClass({ variant: 'soft' })}
          >
            Check status →
          </Link>
        }
      />
      <div className="space-y-4">
        {groupSettings(settings, 'discord').map((section) => (
          <SettingsSection key={section.id} section={section} />
        ))}
      </div>
      <HashHighlighter />
    </>
  );
}
