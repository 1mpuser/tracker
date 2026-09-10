import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AUTH_CONFIG, AuthConfig } from './auth.config';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { AuthUser } from './auth-user';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfirmDto } from './dto/confirm.dto';
import { ResendDto } from './dto/resend.dto';
import { ForgotDto } from './dto/forgot.dto';
import { ResetDto } from './dto/reset.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';

interface CookieContext {
  userAgent?: string;
}

function metaFrom(req: Request): CookieContext {
  return { userAgent: req?.headers?.['user-agent'] ?? undefined };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {}

  private setSessionCookie(res: Response, token: string) {
    res.cookie('sid', token, {
      httpOnly: true,
      secure: this.cfg.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: this.cfg.sessionDays * 86_400_000,
    });
  }

  private clearSessionCookie(res: Response) {
    res.clearCookie('sid', { path: '/' });
  }

  @Public()
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 3 } })
  @Post('register')
  @HttpCode(204)
  async register(@Body() dto: RegisterDto) {
    await this.auth.register(dto.email, dto.password, dto.timezone);
  }

  @Public()
  @Throttle({ default: { ttl: 60 * 1000, limit: 10 } })
  @Post('register/confirm')
  @HttpCode(200)
  async confirm(
    @Body() dto: ConfirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result =
      dto.token !== undefined
        ? await this.auth.confirmByToken(dto.token, metaFrom(req))
        : await this.auth.confirmByCode(dto.email ?? '', dto.code ?? '', metaFrom(req));
    this.setSessionCookie(res, result.sessionToken);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 3 } })
  @Post('register/resend')
  @HttpCode(204)
  async resend(@Body() dto: ResendDto) {
    await this.auth.resendConfirmation(dto.email);
  }

  @Public()
  @Throttle({ default: { ttl: 60 * 1000, limit: 5 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, metaFrom(req));
    this.setSessionCookie(res, result.sessionToken);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 3 } })
  @Post('forgot')
  @HttpCode(204)
  async forgot(@Body() dto: ForgotDto) {
    await this.auth.forgot(dto.email);
  }

  @Public()
  @Post('reset')
  @HttpCode(200)
  async reset(@Body() dto: ResetDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.reset(dto.token, dto.password, metaFrom(req));
    this.setSessionCookie(res, result.sessionToken);
    return { user: result.user };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return { user: await this.auth.updateTimezone(user.id, dto.timezone) };
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.id, dto.current, dto.next, req.sessionToken as string);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.sid as string | undefined;
    this.clearSessionCookie(res);
    if (token) await this.auth.logout(token);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id);
    this.clearSessionCookie(res);
  }
}
