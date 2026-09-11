import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { AUTH_CONFIG, AuthConfig, sessionCookieOptions } from './auth.config';
import { IS_PUBLIC_KEY } from './public.decorator';

// Глобальный guard сессий: пропускает @Public(), иначе требует cookie `sid`,
// разрешает её в пользователя и кладёт его в req.user + req.sessionToken.
// При продлении срока сессии перевыставляет cookie sid с новым maxAge.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private reflector: Reflector,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const token: string | undefined = req.cookies?.sid;
    if (!token) throw new UnauthorizedException();

    const resolved = await this.auth.resolveSession(token);
    if (!resolved) throw new UnauthorizedException();

    // Срок сессии продлён — перевыставляем cookie, чтобы браузер тоже жил
    // ещё sessionDays от последней активности, а не от входа.
    if (resolved.renewExpiresAt) {
      context.switchToHttp().getResponse<Response>().cookie('sid', token, sessionCookieOptions(this.cfg));
    }

    req.user = resolved.user;
    req.sessionToken = token;
    return true;
  }
}
