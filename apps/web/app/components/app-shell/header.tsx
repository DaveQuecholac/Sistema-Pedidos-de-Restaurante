'use client';

import { useEffect, useState } from 'react';
import styles from './app-shell.module.css';
import { useShell } from './shell-context';

export function Header() {
  const { searchQuery, setSearchQuery, openAddOrder } = useShell();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clockLabel =
    now === null
      ? '\u00a0'
      : new Intl.DateTimeFormat('es-MX', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        }).format(now);

  return (
    <header className={styles.header}>
      <label className={styles.search}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <input
          type="search"
          value={searchQuery}
          placeholder="Buscar mesa u orden…"
          aria-label="Buscar"
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </label>
      <p className={styles.clock} aria-live="polite" suppressHydrationWarning>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16M9 3v4M15 3v4" />
        </svg>
        {clockLabel}
      </p>
      <button type="button" className={styles.addOrder} onClick={openAddOrder}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
        Nueva orden
      </button>
    </header>
  );
}
