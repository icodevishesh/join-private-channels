import Link from 'next/link';
import { buttonClass } from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import SettingsSection from '@/components/settings/SettingsSection';
import HashHighlighter from '@/components/settings/HashHighlighter';
import DetectedChannels from '@/components/telegram/DetectedChannels';
import { groupSettings } from '@/components/settings/settingsMeta';
import { getSettingsForAdmin } from '@/src/db/adminRepo.js';
import { listBotChats } from '@/src/db/repo.js';
import { getAddToChannelUrl, getBotInfo } from '@/src/services/telegramChannel.js';

export const metadata = { title: 'Telegram Channel · Spaceship' };

export default async function TelegramChannelPage() {
  const [settings, chats, addUrl, bot] = await Promise.all([
    getSettingsForAdmin(),
    listBotChats(),
    getAddToChannelUrl().catch(() => null),
    getBotInfo().catch(() => null),
  ]);
  const currentId = settings.find((s) => s.key === 'telegram_channel_id')?.value ?? '';
  const plainChats = chats.map(({ chat_id, title, type, username }) => ({ chat_id, title, type, username }));

  return (
    <>
      <PageHeader
        title="Telegram Channel"
        description="Verified users get a personal link to request to join your private channel. The bot approves only them."
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
        <DetectedChannels chats={plainChats} currentId={currentId} addUrl={addUrl} botUsername={bot?.username} />
        {groupSettings(settings, 'telegram').map((section) => (
          <SettingsSection key={section.id} section={section} />
        ))}
      </div>
      <HashHighlighter />
    </>
  );
}
