import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

// Поверх глобального SessionGuard: пользователь уже разрешён в req.user, а
// права проверяем по базе по req.user.id. Не-админ получает 404, как на чужую
// запись в остальном API — существование админки не раскрывается.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private admin: AdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const isAdmin = await this.admin.isAdmin(req.user?.id as number);
    if (!isAdmin) throw new NotFoundException();
    return true;
  }
}
