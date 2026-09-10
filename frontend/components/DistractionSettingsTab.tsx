'use client';

import { useEffect, useState } from 'react';
import styles from './SettingsModal.module.css';
import type { Settings } from '@/types/api';
import { getSettings, updateSettings } from '@/lib/api';

const LABEL_MAX = 32;

interface DistractionSettingsTabProps {
  onSettingsChanged: (settings: Settings) => void;
}

export default function DistractionSettingsTab({ onSettingsChanged }: DistractionSettingsTabProps) {
  const [label, setLabel] = useState('');
  const [budget, setBudget] = useState(0);

  useEffect(() => {
    getSettings().then((s) => {
      setLabel(s.distractionLabel);
      setBudget(s.distractionBudget);
    });
  }, []);

  async function saveLabel() {
    const trimmed = label.trim();
    if (!trimmed) return;
    onSettingsChanged(await updateSettings({ distractionLabel: trimmed.slice(0, LABEL_MAX) }));
  }

  async function saveBudget(value: number) {
    setBudget(value);
    onSettingsChanged(await updateSettings({ distractionBudget: value }));
  }

  return (
    <div className={styles.tabBody}>
      <p>
        Во что утекает время: YouTube, шортсы, Reels, TikTok — назови как удобно. Название появится на панели, в
        графиках и в недельной сводке в Telegram.
      </p>
      <div className={styles.addRow}>
        <input
          value={label}
          maxLength={LABEL_MAX}
          placeholder="Например, Шортсы"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={saveLabel}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveLabel();
          }}
        />
      </div>
      <div className={styles.addRow}>
        <span>Бюджет в день, мин</span>
        <input
          type="number"
          min={0}
          value={budget}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            saveBudget(Number.isNaN(v) ? 0 : Math.max(0, v));
          }}
        />
      </div>
    </div>
  );
}
