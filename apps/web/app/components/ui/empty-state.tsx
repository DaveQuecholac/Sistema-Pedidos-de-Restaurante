import styles from './empty-state.module.css';

export function EmptyState({ text }: { text: string }) {
  return (
    <div className={styles.empty}>
      <svg className={styles.icon} viewBox="0 0 64 64" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 28a14 11 0 0 1 28 0z" />
          <rect x="5" y="34" width="30" height="5" rx="2.5" />
          <path d="M6 44h28v2a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5z" />
          <path d="M40 26h16l-2.5 25H42.5z" />
          <path d="M38 26h20" />
          <path d="M50 26l2-9h5" />
        </g>
      </svg>
      <p className={styles.text}>{text}</p>
    </div>
  );
}