'use client';

import { useEffect, useState } from 'react';
import styles from './app-shell.module.css';
import { useShell } from './shell-context';

export function Header() {
  const { searchQuery, setSearchQuery, openAddOrder } = useShell();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clockLabel = new Intl.DateTimeFormat('es-MX', {
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
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={searchQuery}
          placeholder="Buscar mesa u orden…"
          aria-label="Buscar"
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>
      <p className={styles.clock} aria-live="polite">
        {clockLabel}
      </p>
      <button type="button" className={styles.addOrder} onClick={openAddOrder}>
        Nueva orden
      </button>
    </header>
  );
}
