import styles from './Header.module.css';

interface HeaderProps {
  dateLabel: string;
  streak: number;
  notificationsEnabled: boolean;
  onEnableNotifications: () => void;
  onOpenSettings: () => void;
}

export default function Header({
  dateLabel,
  streak,
  notificationsEnabled,
  onEnableNotifications,
  onOpenSettings,
}: HeaderProps) {
  return (
    <div className={styles.topbar}>
      <div>
        <h1 className={styles.title}>Панель дня</h1>
        <div className={styles.date}>{dateLabel}</div>
      </div>
      <div className={styles.actions}>
        {!notificationsEnabled && (
          <button type="button" className={styles.iconBtn} onClick={onEnableNotifications}>
            Включить уведомления
          </button>
        )}
        <div className={styles.streakbox}>
          <div className={styles.streakNum}>{streak}</div>
          <div className={styles.streakLbl}>дней подряд, все сферы</div>
        </div>
        <button type="button" className={styles.gearBtn} onClick={onOpenSettings} aria-label="Настройки">
          ⚙
        </button>
      </div>
    </div>
  );
}
