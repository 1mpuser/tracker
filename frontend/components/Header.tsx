import type { CSSProperties, ReactNode } from 'react';
import styles from './Header.module.css';
import { flameTier } from '@/lib/flame';
import { FlameIcon, GearIcon, TomatoIcon } from './icons';

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
  label: ReactNode;
  tone: 'gold' | 'red';
  hot?: boolean;
  delay: string;
}

function StreakFlame({ value, label, tone, hot, delay }: StreakFlameProps) {
  const tier = flameTier(value);
  return (
    <div
      className={`${styles.cell} ${styles[tone]} ${styles[`tier${tier}`]} ${hot ? styles.hot : ''}`}
      style={{ '--delay': delay } as CSSProperties}
    >
      <div className={styles.glyph}>{tier > 0 && <FlameIcon className={styles.flame} />}</div>
      <div className={styles.num}>{value}</div>
      <div className={styles.lbl}>{label}</div>
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
    <div className={styles.header}>
      <div className={styles.titlebar}>
        <div className={styles.titleblock}>
          <h1 className={styles.title}>Панель дня</h1>
          <div className={styles.date}>{dateLabel}</div>
        </div>
        <div className={styles.actions}>
          {!notificationsEnabled && (
            <button type="button" className={styles.iconBtn} onClick={onEnableNotifications}>
              Включить уведомления
            </button>
          )}
          <button type="button" className={styles.gearBtn} onClick={onOpenSettings} aria-label="Настройки">
            <GearIcon className={styles.gearIcon} />
          </button>
        </div>
      </div>
      <div className={styles.heroRail}>
        <StreakFlame value={streak} label="дней 2+ сферы" tone="gold" delay="0s" />
        <StreakFlame
          value={pomodoroStreakMin}
          tone="red"
          delay="0.35s"
          label={
            <>
              <TomatoIcon className={styles.tmark} /> минимум ≥4
            </>
          }
        />
        <StreakFlame
          value={pomodoroStreakOpt}
          tone="red"
          hot
          delay="0.7s"
          label={
            <>
              <TomatoIcon className={styles.tmark} /> оптимум ≥8
            </>
          }
        />
      </div>
    </div>
  );
}
