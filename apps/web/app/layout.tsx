import type { ReactNode } from 'react';

export const metadata = {
  title: 'Restaurante — Pedidos',
  description: 'Sistema de pedidos (adaptador web)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
