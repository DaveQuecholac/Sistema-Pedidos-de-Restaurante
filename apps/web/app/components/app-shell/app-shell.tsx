'use client';

import type { ReactNode } from 'react';
import { AddOrderDialog } from './add-order-dialog';
import styles from './app-shell.module.css';
import { Header } from './header';
import { SelectionInspector } from './selection-inspector';
import { ShellProvider } from './shell-context';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ShellProvider>
      <div className={styles.shell}>
        <Sidebar />
        <div className={styles.column}>
          <Header />
          <div className={styles.body}>
            <main className={styles.main}>{children}</main>
            <SelectionInspector />
          </div>
        </div>
      </div>
      <AddOrderDialog />
    </ShellProvider>
  );
}
