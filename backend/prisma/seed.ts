import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEFAULT_CATEGORIES } from '../src/auth/default-categories';

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

// Seed для локального dev: создаёт dev-пользователя с дефолтными сферами и
// настройками, если пользователей ещё нет. Никаких глобальных сфер больше нет —
// дефолтные сферы создаются вместе с учёткой (UserBootstrapService).
const DEFAULT_DISTRACTION_BUDGET = parseInt(process.env.DISTRACTION_BUDGET_DEFAULT ?? '60', 10);

async function main() {
  const users = await prisma.user.count();
  if (users > 0) return;

  const user = await prisma.user.create({ data: { email: 'dev@localhost.invalid' } });
  await prisma.settings.create({
    data: { userId: user.id, distractionBudget: Number.isFinite(DEFAULT_DISTRACTION_BUDGET) ? DEFAULT_DISTRACTION_BUDGET : 60 },
  });
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id })),
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
