'use client';

import { useState } from 'react';
import { issueAccessToken, writeStoredToken } from '../session/access-token';
import { useStaffRole } from '../session/role-context';
import { STAFF_AREAS, type StaffRole } from '../session/staff-role';
import styles from './login-screen.module.css';

export function LoginScreen() {
  const { enter } = useStaffRole();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function choose(role: StaffRole) {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const token = await issueAccessToken(role);
      writeStoredToken(window.sessionStorage, token);
      enter(role);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo entrar.');
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <p className={styles.brand}>Restaurante</p>
        <h1 id="login-title">Elige tu área</h1>
        <p className={styles.lead}>Entras directo al trabajo de esa área.</p>
        <div className={styles.choices}>
          {STAFF_AREAS.map((area) => (
            <button
              key={area.role}
              type="button"
              className={styles.choice}
              disabled={pending}
              onClick={() => void choose(area.role)}
            >
              <span className={styles.choiceLabel}>{area.label}</span>
              <span className={styles.choiceDetail}>{area.detail}</span>
            </button>
          ))}
        </div>
        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
