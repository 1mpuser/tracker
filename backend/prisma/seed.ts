import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

const DEFAULT_CATEGORIES = [
  { key: 'sport', label: 'Спорт', order: 0 },
  { key: 'personal', label: 'Общение / свидания', order: 1 },
  { key: 'family', label: 'Семья', order: 2 },
  { key: 'learning', label: 'Обучение', order: 3 },
  { key: 'work', label: 'Работа / финансы', order: 4 },
];

const DEFAULT_YOUTUBE_BUDGET = parseInt(process.env.YOUTUBE_BUDGET_DEFAULT ?? '60', 10);

async function main() {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { key: cat.key },
      update: {},
      create: cat,
    });
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, youtubeBudget: DEFAULT_YOUTUBE_BUDGET },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
