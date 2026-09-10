import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UserBootstrapService } from './user-bootstrap.service';
import { MailerService } from './mailer.service';
import { AUTH_CONFIG, AuthConfig } from './auth.config';
import { DUMMY_HASH, hashPassword, needsRehash, verifyPassword } from './password.util';
import {
  alreadyRegisteredMail,
  passwordResetMail,
  signupConfirmMail,
} from './mail-templates';
import { AuthUser } from './auth-user';

export interface SessionResult {
  sessionToken: string;
  user: AuthUser;
}

interface Meta {
  userAgent?: string;
}

const CODE_LIFETIME_MS = 24 * 3600 * 1000;
const RESET_LIFETIME_MS = 30 * 60 * 1000;
const SESSION_REFRESH_MS = 24 * 3600 * 1000;
const MAIL_WINDOW_MS = 3600 * 1000;
const MAIL_PER_HOUR = 5;

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
    private userBootstrap: UserBootstrapService,
    private mailer: MailerService,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {
    this.sessionLifetimeMs = cfg.sessionDays * 24 * 3600 * 1000;
  }

  async onModuleInit() {
    // Чистка просроченных записей при старте и раз в сутки.
    await this.cleanupExpired();
    const timer = setInterval(() => void this.cleanupExpired(), 24 * 3600 * 1000);
    timer.unref();
  }

  private async cleanupExpired() {
    const now = new Date();
    await this.prisma.pendingSignup.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.prisma.passwordReset.deleteMany({
      where: { expiresAt: { lt: now }, usedAt: null },
    });
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  // Защита квоты Resend: не больше MAIL_PER_HOUR писем на адрес в час.
  private async underMailBudget(email: string): Promise<boolean> {
    const since = new Date(Date.now() - MAIL_WINDOW_MS);
    const [signups, resets] = await Promise.all([
      this.prisma.pendingSignup.count({ where: { email, createdAt: { gte: since } } }),
      this.prisma.passwordReset.count({ where: { user: { email }, createdAt: { gte: since } } }),
      this.prisma.user.findFirst({ where: { email } }),
    ]);
    return signups + resets < MAIL_PER_HOUR;
  }

  async register(email: string, password: string, timezone?: string): Promise<void> {
    const normalized = this.normalizeEmail(email);

    // Режимы без открытой регистрации или помимо allowlist — молча и без записей:
    // иначе по разнице ответов можно было бы понять, какая инсталляция.
    if (this.cfg.signupMode === 'closed') return;
    if (this.cfg.signupMode === 'allowlist' && !this.cfg.allowedEmails.has(normalized)) return;

    const existingUser = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existingUser) {
      // Не раскрываем, что адрес занят: вместо письма подтверждения уходит
      // «кто-то пытался зарегистрироваться», если квота ещё не исчерпана.
      if (await this.underMailBudget(normalized)) {
        await this.mailer.send(
          normalized,
          alreadyRegisteredMail(`${this.cfg.appUrl}/login`, `${this.cfg.appUrl}/forgot`),
        );
      }
      return;
    }

    const { token, code } = this.newConfirmTokens();
    const record = await this.prisma.pendingSignup.upsert({
      where: { email: normalized },
      update: {
        passwordHash: await hashPassword(password),
        tokenHash: sha256(token),
        codeHash: sha256(`${normalized}:${code}`),
        timezone: timezone ?? null,
        attempts: 0,
        expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
      },
      create: {
        email: normalized,
        passwordHash: await hashPassword(password),
        tokenHash: sha256(token),
        codeHash: sha256(`${normalized}:${code}`),
        timezone: timezone ?? null,
        expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
      },
    });

    if (await this.underMailBudget(normalized)) {
      // `record` не учтён в счётчике писем напрямую, но `underMailBudget` считает
      // по pendingSignup.createdAt — свежесозданная запись уже входит в окно.
      await this.mailer.send(
        normalized,
        signupConfirmMail(`${this.cfg.appUrl}/register/confirm?token=${token}`, code),
      );
    }
  }

  private newConfirmTokens(): { token: string; code: string } {
    const token = randomBytes(32).toString('base64url');
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    return { token, code };
  }

  private async confirmPending(
    pending: { email: string; passwordHash: string; timezone: string | null },
    meta: Meta,
  ): Promise<SessionResult> {
    const user = await this.userBootstrap.createUser({
      email: pending.email,
      passwordHash: pending.passwordHash,
      timezone: pending.timezone ?? undefined,
    });
    await this.prisma.pendingSignup.deleteMany({ where: { email: pending.email } });
    return this.createSession(user.id, meta);
  }

  async confirmByToken(token: string, meta: Meta): Promise<SessionResult> {
    const pending = await this.prisma.pendingSignup.findUnique({ where: { tokenHash: sha256(token) } });
    if (!pending || isExpired(pending.expiresAt)) {
      throw new UnauthorizedException('Ссылка устарела — зарегистрируйтесь ещё раз');
    }
    return this.confirmPending(pending, meta);
  }

  async confirmByCode(email: string, code: string, meta: Meta): Promise<SessionResult> {
    const normalized = this.normalizeEmail(email);
    const pending = await this.prisma.pendingSignup.findUnique({ where: { email: normalized } });
    if (!pending || isExpired(pending.expiresAt)) {
      throw new UnauthorizedException('Код устарел или адрес не регистрировался');
    }

    const expected = Buffer.from(pending.codeHash, 'hex');
    const actual = Buffer.from(sha256(`${normalized}:${code}`), 'hex');
    const ok = expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!ok) {
      // После 5 неудачных попыток запись удаляется — код сжигается.
      const nextAttempts = pending.attempts + 1;
      if (nextAttempts >= 5) {
        await this.prisma.pendingSignup.delete({ where: { email: normalized } });
      } else {
        await this.prisma.pendingSignup.update({ where: { email: normalized }, data: { attempts: nextAttempts } });
      }
      throw new UnauthorizedException('Неверный код');
    }

    return this.confirmPending(pending, meta);
  }

  async resendConfirmation(email: string): Promise<void> {
    const normalized = this.normalizeEmail(email);
    const pending = await this.prisma.pendingSignup.findUnique({ where: { email: normalized } });
    if (!pending || isExpired(pending.expiresAt)) {
      // Тихо: неизвестный адрес не должен отличаться поведением.
      return;
    }
    const { token, code } = this.newConfirmTokens();
    await this.prisma.pendingSignup.update({
      where: { email: normalized },
      data: { tokenHash: sha256(token), codeHash: sha256(`${normalized}:${code}`), attempts: 0 },
    });
    if (await this.underMailBudget(normalized)) {
      await this.mailer.send(
        normalized,
        signupConfirmMail(`${this.cfg.appUrl}/register/confirm?token=${token}`, code),
      );
    }
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

    if (needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    }

    return this.createSession(user.id, meta);
  }

  async forgot(email: string): Promise<void> {
    const normalized = this.normalizeEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      // Одинаковый ответ для существующих и несуществующих адресов.
      return;
    }
    if (!(await this.underMailBudget(normalized))) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_LIFETIME_MS),
      },
    });
    await this.mailer.send(normalized, passwordResetMail(`${this.cfg.appUrl}/reset?token=${token}`));
  }

  async reset(token: string, password: string, meta: Meta): Promise<SessionResult> {
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
    if (!reset || reset.usedAt || isExpired(reset.expiresAt)) {
      throw new UnauthorizedException('Ссылка устарела или уже использована');
    }
    await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    await this.prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await hashPassword(password) },
    });
    // Сброс закрывает все старые сессии: пароль украден у того, кто их открыл.
    await this.prisma.session.deleteMany({ where: { userId: reset.userId } });
    return this.createSession(reset.userId, meta);
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

  async resolveSession(sessionToken: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(sessionToken) } });
    if (!session || isExpired(session.expiresAt)) {
      return null;
    }
    // Продление срока жизни не чаще раза в сутки — иначе каждая активность
    // писала бы в БД.
    if (Date.now() - session.lastSeenAt.getTime() > SESSION_REFRESH_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return null;
    return { id: user.id, email: user.email, timezone: user.timezone };
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
