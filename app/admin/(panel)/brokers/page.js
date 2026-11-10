import PageHeader from '@/components/ui/PageHeader';
import SettingsSection from '@/components/settings/SettingsSection';
import ConditionsForm from '@/components/settings/ConditionsForm';
import HashHighlighter from '@/components/settings/HashHighlighter';
import BrokerTestButton from '@/components/brokers/BrokerTestButton';
import { groupSettings } from '@/components/settings/settingsMeta';
import { getSettingsForAdmin, getAllConditions } from '@/src/db/adminRepo.js';

export const metadata = { title: 'Brokers · Spaceship' };

export default async function BrokersPage() {
  const [settings, conditions] = await Promise.all([getSettingsForAdmin(), getAllConditions()]);
  const plainConditions = conditions.map(({ id, condition_key, label, threshold, is_active }) => ({
    id,
    condition_key,
    label,
    threshold: Number(threshold),
    is_active: Number(is_active),
  }));
  const sections = Object.fromEntries(groupSettings(settings, 'brokers').map((s) => [s.id, s]));

  return (
    <>
      <PageHeader title="Brokers" description="Which brokers users can verify with, their API access and join requirements." />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          {sections.elefin && <SettingsSection section={sections.elefin} stacked actions={<BrokerTestButton broker="elefin" label="Elefin" />} />}
          <ConditionsForm initial={plainConditions} stacked />
        </div>
        <div className="space-y-4">
          {sections.xm && <SettingsSection section={sections.xm} stacked actions={<BrokerTestButton broker="xm" label="XM" />} />}
          {sections.xm_requirements && <SettingsSection section={sections.xm_requirements} stacked />}
        </div>
      </div>
      <HashHighlighter />
    </>
  );
}
