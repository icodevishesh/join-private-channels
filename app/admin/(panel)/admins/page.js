import AdminsView from '@/components/admins/AdminsView';
import PageHeader from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { requireAdminPage } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const metadata = { title: 'Admins · Spaceship' };

export default async function AdminsPage() {
  const admin = await requireAdminPage();
  if (!can(admin, 'admins.manage')) {
    return (
      <>
        <PageHeader title="Admins" />
        <Card className="px-6 py-10 text-center text-sm text-zinc-500">Only super admins can manage admins.</Card>
      </>
    );
  }
  return <AdminsView />;
}
