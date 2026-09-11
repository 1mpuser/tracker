import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CATEGORIES } from './default-categories';

// Единственный путь создания пользователя и всего, что с ним рождается:
// его используют и тесты (loginAs), и seed.ts, и администратор в следующей
// задаче. Всё в одной транзакции — не может остаться пользователь без
// дефолтных сфер или настроек.
@Injectable()
export class UserBootstrapService {
  constructor(private prisma: PrismaService) {}

  async createUser(data: { email: string; passwordHash?: string | null; timezone?: string }) {
    const budgetDefault = parseInt(process.env.DISTRACTION_BUDGET_DEFAULT ?? '60', 10);
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash ?? null,
        timezone: data.timezone ?? 'UTC',
      },
    });

    await this.prisma.settings.create({
      data: { userId: user.id, distractionBudget: Number.isFinite(budgetDefault) ? budgetDefault : 60 },
    });

    await this.prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id })),
    });

    return user;
  }
}
