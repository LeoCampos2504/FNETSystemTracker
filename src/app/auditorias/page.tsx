import { redirect } from 'next/navigation';
import { getCurrentSessionUser } from '@/server/services/auth-sessions';
import { PhysicalAudits } from '@/components/physical-audits';
export const dynamic = 'force-dynamic';
export default async function AuditsPage() {
  const user = await getCurrentSessionUser(); if (!user?.active) redirect('/');
  return <PhysicalAudits canEdit={user.role === 'ADMIN'} />;
}
