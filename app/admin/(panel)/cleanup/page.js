import InactiveCleanupView from '@/components/members/InactiveCleanupView';
import { countLinkedActiveMembers, getJoinPlaces } from '@/src/db/adminRepo.js';

export const metadata = { title: 'Inactivity cleanup · Spaceship' };

export default async function CleanupPage() {
  const [places, xmMembers] = await Promise.all([getJoinPlaces(), countLinkedActiveMembers('xm')]);
  // A broker shows up when it's on, or when people who joined with it are still in.
  const brokers = ['elefin', ...(places.xm || xmMembers > 0 ? ['xm'] : [])];
  return <InactiveCleanupView brokers={brokers} />;
}
