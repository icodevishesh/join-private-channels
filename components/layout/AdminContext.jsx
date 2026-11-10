'use client';

import { createContext, useContext } from 'react';
import { can } from '@/lib/permissions';

const AdminContext = createContext(null);

export function AdminProvider({ admin, children }) {
  return <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>;
}

/** The signed-in admin and a `can(permission)` helper for hiding/disabling buttons. */
export function useAdmin() {
  const admin = useContext(AdminContext);
  return { admin, can: (permission) => can(admin, permission) };
}
