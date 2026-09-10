// Единственное место, где распознаётся ошибка уникальности Prisma (P2002).
// Используется и в TelegramConfigService (дубликат чата), и в
// TelegramDeliveryService (захват слота публикации).
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002';
}
