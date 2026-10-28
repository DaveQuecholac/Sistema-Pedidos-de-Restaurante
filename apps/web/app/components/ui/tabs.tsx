import styles from './tabs.module.css'; 

export type TabItem<T extends string> = {
    value: T; 
    lable: string; 
    count?: number | null; 
}; 

export function Tabs<T extends string>({
    items, 
    value, 
    onChange, 
    label,
}: {
    items: TabItem<T>[]; 
    value: T; 
    onChange: (value: T) => void; 
    label: string; 
}) {
    return (
        <div className={styles.tabs} role="group" aria-label={label}>
            {items.map((item) => (
                <button
                    key={item.value}
                    type="button"
                    className={item.value === value ? styles.tabActive : styles.tab}
                    aria-pressed={item.value === value}
                    onClick={() => onChange(item.value)}
                    >
                    {item.label}
                    {item.count != null ? ` (${item.count})` : ''}
                </button>
            ))}
        </div>
    ); 
}