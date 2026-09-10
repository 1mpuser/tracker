import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { RoutineLogDto } from './dto/routine-log.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';

@Controller('routines')
export class RoutinesController {
  constructor(private readonly routinesService: RoutinesService) {}

  // Объявлен до остальных `@Get`: статический сегмент должен стоять раньше
  // любого `:param`-маршрута, иначе 'history' уедет в параметр.
  @Get('history')
  getHistory(@CurrentUser() user: AuthUser, @Query('weeks') weeks?: string, @Query('anchor') anchor?: string) {
    const parsed = weeks ? parseInt(weeks, 10) : NaN;
    return this.routinesService.getHistory(user, Number.isNaN(parsed) ? undefined : parsed, anchor);
  }

  @Get()
  getWeek(@CurrentUser() user: AuthUser, @Query('week') week?: string) {
    return this.routinesService.getWeek(user, week);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoutineDto) {
    return this.routinesService.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoutineDto) {
    return this.routinesService.update(user.id, id, dto);
  }

  @Delete(':id')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.routinesService.archive(user.id, id);
  }

  @Post(':id/log')
  setLog(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RoutineLogDto) {
    return this.routinesService.setLog(user, id, dto.date, dto.count);
  }

  @Delete(':id/log/:date')
  removeLog(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Param('date') date: string) {
    return this.routinesService.removeLog(user, id, date);
  }
}
