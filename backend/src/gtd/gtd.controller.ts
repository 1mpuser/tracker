import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { GtdService } from './gtd.service';
import { CreateGtdItemDto } from './dto/create-gtd-item.dto';
import { UpdateGtdItemDto } from './dto/update-gtd-item.dto';
import { CreateTodayDto } from './dto/create-today-dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';

@Controller('gtd')
export class GtdController {
  constructor(private readonly gtdService: GtdService) {}

  @Get('items')
  getItems(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.gtdService.getItems(user.id, status);
  }

  @Post('items')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGtdItemDto) {
    return this.gtdService.create(user.id, dto.title, dto.parentId);
  }

  @Post('items/today')
  createForDate(@CurrentUser() user: AuthUser, @Body() dto: CreateTodayDto) {
    return this.gtdService.createForDate(user.id, dto.title, dto.date);
  }

  @Patch('items/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGtdItemDto) {
    return this.gtdService.update(user.id, id, dto);
  }

  @Delete('items/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.gtdService.remove(user.id, id);
  }
}
