'use client';

import { useEffect, useState } from 'react';
import styles from './TelegramSettings.module.css';
import type { TelegramBotView } from '@/types/api';
import { apiErrorMessage, clearTelegramBotToken, getTelegramBot, setTelegramBotToken } from '@/lib/api';

export default function TelegramBotTab() {
  const [bot, setBot] = useState<TelegramBotView | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTelegramBot().then(setBot).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  async function save() {
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setBot(await setTelegramBotToken(token.trim()));
      setToken('');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      setBot(await clearTelegramBotToken());
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.body}>
      <div className={styles.status}>
        {!bot && 'загрузка…'}
        {bot && !bot.configured && 'Бот не подключён — сводки в Telegram не отправляются.'}
        {bot?.configured && (
          <>
            Подключён {bot.username ? <b>@{bot.username}</b> : 'бот (Telegram сейчас не ответил)'} · токен {bot.tokenHint}
            {bot.source === 'env' && ' · из .env'}
          </>
        )}
      </div>

      <ol className={styles.help}>
        <li>Открой в Telegram <b>@BotFather</b>, отправь <code>/newbot</code> и следуй подсказкам.</li>
        <li>Скопируй токен вида <code>123456789:AA…</code> и вставь ниже.</li>
        <li>Потом во вкладке «Чаты» выбери, куда слать сводки.</li>
      </ol>

      <div className={styles.row}>
        <input
          type="password"
          autoComplete="off"
          placeholder="Токен бота"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <button type="button" onClick={save} disabled={busy || !token.trim()}>
          {bot?.configured ? 'заменить' : 'подключить'}
        </button>
        {bot?.source === 'db' && (
          <button type="button" onClick={disconnect} disabled={busy}>
            отключить
          </button>
        )}
      </div>
      {bot?.source === 'env' && (
        <div className={styles.hint}>Токен из .env используется, пока здесь не задан свой.</div>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
