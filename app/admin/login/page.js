import { redirect } from 'next/navigation';
import LoginForm from '@/components/auth/LoginForm';
import Icon from '@/components/ui/Icon';
import { getSession } from '@/lib/auth';
import { countAdmins } from '@/lib/admins';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · Spaceship' };

export default async function LoginPage({ searchParams }) {
  const { error, message } = await searchParams;
  if (await getSession()) redirect('/admin');
  // First run: no admins yet, so offer to create the super admin account.
  const setup = (await countAdmins()) === 0;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Icon name="bot" className="size-5.5" />
          </span>
          <h1 className="text-xl font-semibold text-zinc-900">{setup ? 'Welcome to Spaceship' : 'Spaceship'}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {setup ? 'Create your super admin account to get started.' : 'Sign in to manage members and settings'}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <LoginForm
            setup={setup}
            error={typeof error === 'string' ? error : undefined}
            message={typeof message === 'string' ? message : undefined}
          />
        </div>
      </div>
    </div>
  );
}
