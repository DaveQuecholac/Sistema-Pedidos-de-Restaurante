'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './app-shell.module.css';

const LINKS = [
  { href: '/', label: 'Mesas', match: (path: string) => path === '/', Icon: IconHome },
  {
    href: '/menu',
    label: 'Menú',
    match: (path: string) => path.startsWith('/menu'),
    Icon: IconMenu,
  },
  {
    href: '/ordenes',
    label: 'Órdenes',
    match: (path: string) => path.startsWith('/ordenes'),
    Icon: IconOrders,
  },
  {
    href: '/cocina',
    label: 'Cocina',
    match: (path: string) => path.startsWith('/cocina'),
    Icon: IconKitchen,
  },
  {
    href: '/pago',
    label: 'Pago',
    match: (path: string) => path.startsWith('/pago'),
    Icon: IconPay,
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar} aria-label="Navegación principal">
      <div className={styles.brandMark} aria-hidden="true">
        R
      </div>
      <nav className={styles.nav}>
        {LINKS.map(({ href, label, match, Icon }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
              aria-current={active ? 'page' : undefined}
            >
              <Icon />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <p className={styles.version}>V.1.0</p>
    </aside>
  );
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h10" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4h8a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z" />
      <path d="M9 9h6M9 13h6" />
    </svg>
  );
}

function IconKitchen() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3v7a3 3 0 0 0 3 3v8" />
      <path d="M12 3v18" />
      <path d="M18 3v4a3 3 0 0 1-3 3h0v11" />
    </svg>
  );
}

function IconPay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  );
}
