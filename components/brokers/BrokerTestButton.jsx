'use client';

import { useState } from 'react';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

/** "Test connection": checks the saved API token with one small request and shows the answer as a toast. */
export default function BrokerTestButton({ broker, label }) {
  const [loading, setLoading] = useState(false);

  async function test() {
    setLoading(true);
    const res = await fetch('/api/admin/brokers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broker }),
    }).catch(() => null);
    setLoading(false);
    if (res?.status === 401) return window.location.assign('/admin/login');
    const data = await res?.json().catch(() => null);
    if (data?.ok) toast.success(`${label}: ${data.message}`);
    else toast.error(`${label}: ${data?.error ?? 'Couldn’t reach the server.'}`);
  }

  return (
    <Button size="sm" variant="secondary" loading={loading} onClick={test} className="shrink-0">
      Test connection
    </Button>
  );
}
