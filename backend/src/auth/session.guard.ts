import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

// Глобальный guard сессий: пропускает @Public(), иначе требует cookie `sid`,
// разрешает её в пользователя и кладёт его в req.user + req.sessionToken.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private reflector: Reflector,
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

    const user = await this.auth.resolveSession(token);
    if (!user) throw new UnauthorizedException();

    req.user = user;
    req.sessionToken = token;
    return true;
  }
}
