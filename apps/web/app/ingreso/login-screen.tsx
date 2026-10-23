'use client';

import { useStaffRole } from '../session/role-context';
import { STAFF_AREAS } from '../session/staff-role';
import styles from './login-screen.module.css';

export function LoginScreen() {
  const { enter } = useStaffRole();

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
              onClick={() => enter(area.role)}
            >
              <span className={styles.choiceLabel}>{area.label}</span>
              <span className={styles.choiceDetail}>{area.detail}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
