import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserBootstrapService } from '../auth/user-bootstrap.service';
import { hashPassword } from '../auth/password.util';
import { isUniqueViolation } from '../common/prisma-errors';

export interface AdminUserView {
  id: number;
  email: string;
  timezone: string;
  isAdmin: boolean;
  blockedAt: Date | null;
  createdAt: Date;
}

// Управление учётками администратором: почта (она же логин) и пароль раздаёт
// админ людям, самостоятельной регистрации нет. Ни один метод не раскрывает,
// существует ли пользователь мимо себя: несуществующий id → 404.
@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private bootstrap: UserBootstrapService,
  ) {}

  async isAdmin(userId: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user?.isAdmin ?? false;
  }

  private toView(user: {
    id: number;
    email: string;
    timezone: string;
    isAdmin: boolean;
    blockedAt: Date | null;
    createdAt: Date;
  }): AdminUserView {
    return {
      id: user.id,
      email: user.email,
      timezone: user.timezone,
      isAdmin: user.isAdmin,
      blockedAt: user.blockedAt,
      createdAt: user.createdAt,
    };
  }

  async list(): Promise<AdminUserView[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => this.toView(u));
  }

  async create(dto: { email: string; password: string; timezone?: string }): Promise<AdminUserView> {
    const email = dto.email.trim().toLowerCase();
    // Пояс новой учётки по умолчанию — явный дефолт админки, общий дефолт
    // createUser (UTC) не меняем.
    const timezone = dto.timezone ?? 'Europe/Moscow';
    this.assertTimezone(timezone);
    try {
      const user = await this.bootstrap.createUser({
        email,
        passwordHash: await hashPassword(dto.password),
        timezone,
      });
      return this.toView(user);
    } catch (e) {
      // Уникальность может сработать и на уровне БД (P2002 внутри транзакции).
      if (isUniqueViolation(e)) throw new ConflictException('Эта почта уже занята');
      throw e;
    }
  }

  async changePassword(userId: number, password: string): Promise<void> {
    await this.findUser(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(password) },
    });
    // Смена пароля админом закрывает все сессии учётки.
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async block(adminId: number, userId: number): Promise<void> {
    await this.findUser(userId);
    if (adminId === userId) throw new BadRequestException('Нельзя заблокировать себя');
    await this.prisma.user.update({ where: { id: userId }, data: { blockedAt: new Date() } });
    // Блокировка закрывает все живые сессии учётки сразу.
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async unblock(userId: number): Promise<void> {
    await this.findUser(userId);
    await this.prisma.user.update({ where: { id: userId }, data: { blockedAt: null } });
  }

  async remove(adminId: number, userId: number): Promise<void> {
    await this.findUser(userId);
    if (adminId === userId) throw new BadRequestException('Нельзя удалить себя');
    // Все пользовательские таблицы уже onDelete: Cascade.
    await this.prisma.user.delete({ where: { id: userId } });
  }

  private async findUser(id: number): Promise<{ id: number }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  // Проверка пояса ровно как в updateTimezone: неизвестный → 400.
  private assertTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException('Неизвестный часовой пояс');
    }
  }
}
