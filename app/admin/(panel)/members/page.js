import MembersView from '@/components/members/MembersView';

export const metadata = { title: 'Members · Spaceship' };

const SHOW = ['in_discord', 'not_in_discord', 'in_channel', 'not_in_channel', 'removed', 'unverified', 'elefin', 'xm'];

export default async function MembersPage({ searchParams }) {
  const { show } = await searchParams;
  return <MembersView initialShow={SHOW.includes(show) ? show : ''} />;
}
