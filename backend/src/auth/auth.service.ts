import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_CONFIG, AuthConfig } from './auth.config';
import { DUMMY_HASH, hashPassword, needsRehash, verifyPassword } from './password.util';
import { AuthUser } from './auth-user';

export interface SessionResult {
  sessionToken: string;
  user: AuthUser;
}

export interface ResolvedSession {
  user: AuthUser;
  /** true, если в этом вызове срок сессии продлён — гард перевыставит cookie. */
  renewExpiresAt: boolean;
}

interface Meta {
  userAgent?: string;
}

const SESSION_REFRESH_MS = 24 * 3600 * 1000;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function isExpired(date: Date): boolean {
  return date.getTime() < Date.now();
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionLifetimeMs: number;

  constructor(
    private prisma: PrismaService,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {
    this.sessionLifetimeMs = cfg.sessionDays * 24 * 3600 * 1000;
  }

  async onModuleInit() {
    // Чистка просроченных сессий при старте и раз в сутки.
    await this.cleanupExpired();
    const timer = setInterval(() => void this.cleanupExpired(), 24 * 3600 * 1000);
    timer.unref();
  }

  private async cleanupExpired() {
    const now = new Date();
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async login(email: string, password: string, meta: Meta): Promise<SessionResult> {
    const normalized = this.normalizeEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });

    // Одинаковое 401 независимо от причины, а verifyPassword вызывается всегда —
    // по времени ответа нельзя понять, существует ли адрес.
    const storedHash = user?.passwordHash ?? DUMMY_HASH;
    const ok = await verifyPassword(password, storedHash);
    if (!user || !ok || user.passwordHash === null) {
      throw new UnauthorizedException('Неверная почта или пароль');
    }

    // Блокировку проверяем только после verifyPassword — по времени ответа
    // нельзя понять, заблокирована ли учётка, и 401 тот же, что на пароль.
    if (user.blockedAt) {
      throw new UnauthorizedException('Неверная почта или пароль');
    }

    if (needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    }

    return this.createSession(user.id, meta);
  }

  async changePassword(
    userId: number,
    current: string,
    next: string,
    currentSessionToken: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const storedHash = user?.passwordHash ?? DUMMY_HASH;
    if (!user || user.passwordHash === null || !(await verifyPassword(current, storedHash))) {
      throw new BadRequestException('Текущий пароль неверный');
    }
    const nextHash = await hashPassword(next);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: nextHash } });
    // Все сессии, кроме текущей, закрываются.
    await this.prisma.session.deleteMany({ where: { userId, NOT: { tokenHash: sha256(currentSessionToken) } } });
  }

  private async createSession(userId: number, meta: Meta): Promise<SessionResult> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + this.sessionLifetimeMs),
        userAgent: meta.userAgent ?? null,
      },
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const current: AuthUser = { id: user.id, email: user.email, timezone: user.timezone };
    return { sessionToken: token, user: current };
  }

  async resolveSession(sessionToken: string): Promise<ResolvedSession | null> {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(sessionToken) } });
    if (!session || isExpired(session.expiresAt)) {
      return null;
    }
    // Продление не чаще раза в сутки — иначе каждая активность писала бы в БД.
    // Активному пользователю сессия живёт ещё sessionDays от момента активности,
    // а не от создания: иначе регулярный юзер вылетал бы через sessionDays дней.
    const renewExpiresAt = Date.now() - session.lastSeenAt.getTime() > SESSION_REFRESH_MS;
    if (renewExpiresAt) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(),
          expiresAt: new Date(Date.now() + this.sessionLifetimeMs),
        },
      });
    }
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    // Заблокированная учётка: даже живая сессия перестаёт работать сразу.
    if (!user || user.blockedAt) return null;
    return { user: { id: user.id, email: user.email, timezone: user.timezone }, renewExpiresAt };
  }

  // Полная идентичность пользователя: помимо данных сессии фронтенду нужен
  // признак админа (GET /auth/me). AuthUser не расширяем — его собирают в
  // десятках мест, isAdmin берётся из базы отдельно.
  async me(userId: number): Promise<{ id: number; email: string; timezone: string; isAdmin: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { id: user.id, email: user.email, timezone: user.timezone, isAdmin: user.isAdmin };
  }

  async logout(sessionToken: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: sha256(sessionToken) } });
  }

  async logoutAll(userId: number): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async updateTimezone(userId: number, timezone: string): Promise<AuthUser> {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException('Неизвестный часовой пояс');
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data: { timezone } });
    return { id: user.id, email: user.email, timezone: user.timezone };
  }
}
