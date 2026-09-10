'use client';

import { useEffect, useState } from 'react';
import styles from './TelegramSettings.module.css';
import type { TelegramBotView, TelegramChatInfo, TelegramChatList } from '@/types/api';
import {
  apiErrorMessage,
  createTelegramChat,
  deleteTelegramChat,
  discoverTelegramChats,
  getTelegramBot,
  getTelegramChats,
  testTelegramChat,
  updateTelegramChat,
} from '@/lib/api';

export default function TelegramChatsTab() {
  const [list, setList] = useState<TelegramChatList | null>(null);
  const [bot, setBot] = useState<TelegramBotView | null>(null);
  const [title, setTitle] = useState('');
  const [chatId, setChatId] = useState('');
  const [found, setFound] = useState<TelegramChatInfo[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [chats, b] = await Promise.all([getTelegramChats(), getTelegramBot()]);
    setList(chats);
    setBot(b);
  }

  useEffect(() => {
    load().catch((e) => setError(apiErrorMessage(e)));
  }, []);

  if (!bot) return <div className={styles.body}>загрузка…</div>;

  if (!bot.configured) {
    return <div className={styles.body}>Сначала подключи бота во вкладке «Telegram-бот».</div>;
  }

  async function addChat() {
    if (!title.trim() || !chatId.trim()) return;
    setError(null);
    try {
      await createTelegramChat({ title: title.trim(), chatId: chatId.trim() });
      setTitle('');
      setChatId('');
      setFound(null);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  async function patchChat(id: number, patch: Parameters<typeof updateTelegramChat>[1]) {
    setError(null);
    try {
      await updateTelegramChat(id, patch);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  async function removeChat(id: number, chatTitle: string) {
    if (!window.confirm(`Удалить чат «${chatTitle}»? Сводки туда больше не пойдут.`)) return;
    setError(null);
    try {
      await deleteTelegramChat(id);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  async function sendTest(id: number, chatTitle: string) {
    setError(null);
    setNotice(null);
    try {
      await testTelegramChat(id);
      setNotice(`Отправлено в «${chatTitle}»`);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  async function discover() {
    setDiscovering(true);
    setError(null);
    setNotice(null);
    try {
      setFound(await discoverTelegramChats());
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className={styles.body}>
      {list?.envFallback && (
        <div className={styles.banner}>
          Сейчас сводки уходят в чат из .env: <code>{list.envFallback}</code>. Как только добавишь чат здесь, .env
          перестанет использоваться.
        </div>
      )}

      {list?.chats.map((c) => (
        <div key={c.id} className={styles.chatRow}>
          <input
            value={c.title}
            onChange={(e) =>
              setList((prev) =>
                prev ? { ...prev, chats: prev.chats.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)) } : prev,
              )
            }
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value && value !== c.title) patchChat(c.id, { title: value });
            }}
          />
          <span className={styles.chatId}>{c.chatId}</span>
          <label>
            <input
              type="checkbox"
              checked={c.daily}
              onChange={(e) => patchChat(c.id, { daily: e.target.checked })}
            />{' '}
            день
          </label>
          <label>
            <input
              type="checkbox"
              checked={c.weekly}
              onChange={(e) => patchChat(c.id, { weekly: e.target.checked })}
            />{' '}
            неделя
          </label>
          <button type="button" onClick={() => sendTest(c.id, c.title)}>
            тест
          </button>
          <button type="button" onClick={() => removeChat(c.id, c.title)}>
            удалить
          </button>
        </div>
      ))}

      <div className={styles.row}>
        <input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input
          placeholder="ID чата или @канал"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addChat();
          }}
        />
        <button type="button" onClick={addChat} disabled={!title.trim() || !chatId.trim()}>
          добавить
        </button>
      </div>

      <button type="button" onClick={discover} disabled={discovering}>
        {discovering ? 'ищу…' : 'Найти чаты'}
      </button>
      {found !== null &&
        (found.length === 0 ? (
          <div className={styles.hint}>
            Бот пока ничего не видел. Добавь его в чат, напиши там сообщение (в канале — сделай бота админом) и нажми
            ещё раз.
          </div>
        ) : (
          <div>
            {found.map((f) => (
              <div key={f.chatId} className={styles.found}>
                <span>
                  {f.title} · {f.type} · <span className={styles.chatId}>{f.chatId}</span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await createTelegramChat({ title: f.title, chatId: f.chatId });
                      setFound(null);
                      await load();
                    } catch (e) {
                      setError(apiErrorMessage(e));
                    }
                  }}
                >
                  добавить
                </button>
              </div>
            ))}
          </div>
        ))}

      <div className={styles.hint}>
        Группа — id отрицательный (<code>-123…</code>), супергруппа и канал — <code>-100…</code>, публичный канал можно
        указать как <code>@username</code>. Личный чат с ботом — напиши ему /start, он появится в «Найти чаты».
      </div>

      {notice && <div className={styles.status}>{notice}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
