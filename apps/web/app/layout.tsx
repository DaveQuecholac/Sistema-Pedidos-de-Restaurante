import type { ReactNode } from 'react';
import { DM_Sans, Fraunces } from 'next/font/google';
import { AppShell } from './components/app-shell/app-shell';
import './globals.css';

const bodyFont = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
});

const titleFont = Fraunces({
  subsets: ['latin'],
  variable: '--font-title',
});

export const metadata = {
  title: 'Restaurante — Pedidos',
  description: 'Sistema de pedidos (adaptador web)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${bodyFont.variable} ${titleFont.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
