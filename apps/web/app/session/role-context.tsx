'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { clearStoredToken, readStoredToken } from './access-token';
import {
  clearStoredRole,
  readStoredRole,
  roleHome,
  writeStoredRole,
  type StaffRole,
} from './staff-role';

type StaffRoleContextValue = {
  role: StaffRole | null;
  ready: boolean;
  enter: (role: StaffRole) => void;
  leave: () => void;
};

const StaffRoleContext = createContext<StaffRoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<StaffRole | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedRole = readStoredRole(window.sessionStorage);
    const token = readStoredToken(window.sessionStorage);
    if (storedRole !== null && token !== null) {
      setRole(storedRole);
    } else {
      clearStoredRole(window.sessionStorage);
      clearStoredToken(window.sessionStorage);
    }
    setReady(true);
  }, []);

  const enter = useCallback(
    (next: StaffRole) => {
      writeStoredRole(window.sessionStorage, next);
      setRole(next);
      router.replace(roleHome(next));
    },
    [router],
  );

  const leave = useCallback(() => {
    clearStoredRole(window.sessionStorage);
    clearStoredToken(window.sessionStorage);
    setRole(null);
  }, []);

  const value = useMemo(
    () => ({ role, ready, enter, leave }),
    [role, ready, enter, leave],
  );

  return <StaffRoleContext.Provider value={value}>{children}</StaffRoleContext.Provider>;
}

export function useStaffRole(): StaffRoleContextValue {
  const value = useContext(StaffRoleContext);
  if (value === null) {
    throw new Error('useStaffRole must be used within RoleProvider');
  }
  return value;
}
