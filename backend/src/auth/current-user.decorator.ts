import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthUser } from './auth-user';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
  // Дошли без пользователя — баг guard'а, а не «анонимный» запрос.
  if (!user) throw new UnauthorizedException();
  return user;
});
