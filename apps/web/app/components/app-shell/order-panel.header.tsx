import styles from './app-shell.module.css';

export function OrderPanelHeader({
  title,
  origin,
  status,
}: {
  title: string;
  origin: string;
  status: string;
}) {
  return (
    <div className={styles.summaryHead}>
      <h2>{title}</h2>
      <div className={styles.metaRow}>
        <div className={styles.metaItem}>
          <IconPeople />
          <span className={styles.metaText}>
            <span className={styles.metaLabel}>Origen:</span>
            <span className={styles.metaValue}>{origin || '\u00a0'}</span>
          </span>
        </div>
        <div className={styles.metaItem}>
          <IconStatus />
          <span className={styles.metaText}>
            <span className={styles.metaLabel}>Estado:</span>
            <span className={styles.metaValue}>{status || '\u00a0'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function IconPeople() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5M18 13.5c2 .7 3 2.6 3 5.5" />
    </svg>
  );
}

function IconStatus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="3 3" />
    </svg>
  );
}