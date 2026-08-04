// Общий хелпер редакции секретов в логах: текст ошибки от внешних библиотек
// (tsdav, fetch) иногда включает URL или сообщение целиком, и секрет может
// туда попасть — вырезаем его перед логированием.
export function redactSecret(message: string, secret: string | undefined | null): string {
  return secret ? message.split(secret).join('<redacted>') : message;
}
