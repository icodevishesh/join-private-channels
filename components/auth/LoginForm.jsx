'use client';

import { useState } from 'react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { Input, Label } from '../ui/Field';

const ERRORS = {
  invalid: 'Wrong username or password.',
  throttled: 'Too many attempts. Try again in 15 minutes.',
  mismatch: 'The two passwords don’t match.',
};

// A plain form post: the server sets the session cookie and redirects to /admin.
// It works even if JavaScript fails to load; JS only adds the loading spinner.
// With `setup`, it creates the first super admin account instead.
export default function LoginForm({ setup = false, error, message }) {
  const [loading, setLoading] = useState(false);
  const errorText = message ?? ERRORS[error] ?? (error ? 'Could not sign in. Please try again.' : '');

  return (
    <form action="/api/admin/auth/login" method="post" onSubmit={() => setLoading(true)} className="space-y-4">
      {setup && <input type="hidden" name="mode" value="setup" />}
      <Alert tone="error">{errorText}</Alert>
      <div>
        <Label htmlFor="username" hint={setup ? '3–32 characters: letters, numbers, dot, dash or underscore.' : undefined}>
          Username
        </Label>
        <Input id="username" name="username" autoComplete="username" required autoFocus />
      </div>
      <div>
        <Label htmlFor="password" hint={setup ? 'At least 8 characters.' : undefined}>
          Password
        </Label>
        <Input id="password" name="password" type="password" autoComplete={setup ? 'new-password' : 'current-password'} required minLength={setup ? 8 : undefined} />
      </div>
      {setup && (
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </div>
      )}
      <Button type="submit" className="w-full" loading={loading}>
        {setup ? 'Create super admin & sign in' : 'Sign in'}
      </Button>
    </form>
  );
}
