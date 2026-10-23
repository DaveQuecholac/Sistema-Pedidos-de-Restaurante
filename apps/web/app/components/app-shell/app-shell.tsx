'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { LoginScreen } from '../../ingreso/login-screen';
import { RoleProvider, useStaffRole } from '../../session/role-context';
import { roleAllowsPath, roleHome, type StaffRole } from '../../session/staff-role';
import { AddOrderDialog } from './add-order-dialog';
import styles from './app-shell.module.css';
import { Header } from './header';
import { SelectionInspector } from './selection-inspector';
import { ShellProvider } from './shell-context';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <RoleGate>{children}</RoleGate>
    </RoleProvider>
  );
}

function RoleGate({ children }: { children: ReactNode }) {
  const { role, ready } = useStaffRole();

  if (!ready) {
    return <div className={styles.boot} aria-hidden="true" />;
  }

  if (role === null) {
    return <LoginScreen />;
  }

  return (
    <ShellProvider>
      <ServiceShell role={role}>{children}</ServiceShell>
    </ShellProvider>
  );
}

function ServiceShell({ role, children }: { role: StaffRole; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const allowed = roleAllowsPath(role, pathname);
  const menuPanel = pathname === '/menu' || pathname.startsWith('/menu/');

  useEffect(() => {
    if (!allowed) {
      router.replace(roleHome(role));
    }
  }, [allowed, role, router]);

  return (
    <>
      <div className={styles.shell}>
        <Sidebar />
        <div className={styles.column}>
          <Header />
          <div className={styles.body}>
            <main className={styles.main}>{allowed ? children : null}</main>
            {menuPanel ? (
              <aside
                id="shell-panel-slot"
                className={styles.summary}
                aria-label="Formulario de plato"
              />
            ) : (
              <SelectionInspector />
            )}
          </div>
        </div>
      </div>
      <AddOrderDialog />
    </>
  );
}