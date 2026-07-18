import type { CSSProperties } from 'react';
import styles from './Header.module.css';
import { flameTier } from '@/lib/flame';

interface HeaderProps {
  dateLabel: string;
  streak: number;
  pomodoroStreakMin: number;
  pomodoroStreakOpt: number;
  notificationsEnabled: boolean;
  onEnableNotifications: () => void;
  onOpenSettings: () => void;
}

interface StreakFlameProps {
  value: number;
  label: string;
  hot?: boolean;
  delay: string;
}

function StreakFlame({ value, label, hot, delay }: StreakFlameProps) {
  const tier = flameTier(value);
  return (
    <div className={styles.streakUnit}>
      <div
        className={`${styles.flameWrap} ${styles[`tier${tier}`]} ${hot ? styles.hot : ''}`}
        style={{ '--delay': delay } as CSSProperties}
      >
        <span className={styles.streakNum}>{value}</span>
        {tier > 0 && (
          <span className={styles.flame} aria-hidden="true">
            🔥
          </span>
        )}
      </div>
      <div className={styles.streakLbl}>{label}</div>
    </div>
  );
}

export default function Header({
  dateLabel,
  streak,
  pomodoroStreakMin,
  pomodoroStreakOpt,
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
        <div className={styles.streakRail}>
          <StreakFlame value={streak} label="дней 2+ сферы" delay="0s" />
          <StreakFlame value={pomodoroStreakMin} label="🍅 минимум ≥4" delay="0.4s" />
          <StreakFlame value={pomodoroStreakOpt} label="🍅 оптимум ≥8" hot delay="0.8s" />
        </div>
        <button type="button" className={styles.gearBtn} onClick={onOpenSettings} aria-label="Настройки">
          ⚙
        </button>
      </div>
    </div>
  );
}
