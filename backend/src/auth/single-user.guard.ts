import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserBootstrapService } from './user-bootstrap.service';
import { AuthUser } from './auth-user';

// ВРЕМЕННЫЙ guard для Фазы 1: пока нет входа, подставляет единственного
// пользователя. Удаляется в Task 2.2, когда его место займёт SessionGuard.
// Провайдер + APP_GUARD оформлены так, чтобы e2e мог переопределить guard
// через overrideProvider(SingleUserGuard).
@Injectable()
export class SingleUserGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private userBootstrap: UserBootstrapService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    let user = await this.prisma.user.findFirst({ orderBy: { id: 'asc' } });
    if (!user) {
      user = await this.userBootstrap.createUser({ email: 'dev@localhost.invalid' });
    }
    const current: AuthUser = { id: user.id, email: user.email, timezone: user.timezone };
    req.user = current;
    return true;
  }
}
