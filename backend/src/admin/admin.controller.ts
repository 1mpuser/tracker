import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangeUserPasswordDto } from './dto/change-user-password.dto';

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  list() {
    return this.admin.list();
  }

  @Post('users')
  @HttpCode(201)
  create(@Body() dto: CreateUserDto) {
    return this.admin.create(dto);
  }

  @Post('users/:id/password')
  @HttpCode(204)
  async changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeUserPasswordDto,
  ) {
    await this.admin.changePassword(id, dto.password);
  }

  @Post('users/:id/block')
  @HttpCode(204)
  async block(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.admin.block(admin.id, id);
  }

  @Post('users/:id/unblock')
  @HttpCode(204)
  async unblock(@Param('id', ParseIntPipe) id: number) {
    await this.admin.unblock(id);
  }

  @Delete('users/:id')
  @HttpCode(204)
  async remove(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.admin.remove(admin.id, id);
  }
}
