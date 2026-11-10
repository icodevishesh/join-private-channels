import PageHeader from '@/components/ui/PageHeader';
import SettingsSection from '@/components/settings/SettingsSection';
import HashHighlighter from '@/components/settings/HashHighlighter';
import { groupSettings } from '@/components/settings/settingsMeta';
import { getSettingsForAdmin } from '@/src/db/adminRepo.js';

export const metadata = { title: 'Settings · Spaceship' };

export default async function SettingsPage() {
  const settings = await getSettingsForAdmin();

  return (
    <>
      <PageHeader title="Settings" description="Start questionnaire and bot limits. Brokers, the Discord server and the Telegram channel have their own pages." />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {groupSettings(settings, 'settings').map((section) => (
          <SettingsSection key={section.id} section={section} stacked />
        ))}
      </div>
      <HashHighlighter />
    </>
  );
}
