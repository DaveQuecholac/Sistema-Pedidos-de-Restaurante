'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AddOrderDialog } from './add-order-dialog';
import styles from './app-shell.module.css';
import { Header } from './header';
import { SelectionInspector } from './selection-inspector';
import { ShellProvider } from './shell-context';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const menuPanel = pathname === '/menu' || pathname.startsWith('/menu/');

  return (
    <ShellProvider>
      <div className={styles.shell}>
        <Sidebar />
        <div className={styles.column}>
          <Header />
          <div className={styles.body}>
            <main className={styles.main}>{children}</main>
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
    </ShellProvider>
  );
}