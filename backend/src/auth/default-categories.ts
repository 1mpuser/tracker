// Дефолтные сферы для новой учётки. Раньше жили в prisma/seed.ts; теперь
// создаются для каждого пользователя через UserBootstrapService.
export const DEFAULT_CATEGORIES = [
  { key: 'sport', label: 'Спорт', order: 0 },
  { key: 'personal', label: 'Общение / свидания', order: 1 },
  { key: 'family', label: 'Семья', order: 2 },
  { key: 'learning', label: 'Обучение', order: 3 },
  { key: 'work', label: 'Работа / финансы', order: 4 },
];
