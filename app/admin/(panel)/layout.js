import AdminShell from '@/components/layout/AdminShell';
import { requireAdminPage, publicAdmin } from '@/lib/auth';
import { countOpenIncidents } from '@/src/db/incidentsRepo.js';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }) {
  const admin = await requireAdminPage();
  const openIncidents = await countOpenIncidents().catch(() => 0);
  return (
    <AdminShell admin={publicAdmin(admin)} badges={{ '/admin/incidents': openIncidents }}>
      {children}
    </AdminShell>
  );
}
