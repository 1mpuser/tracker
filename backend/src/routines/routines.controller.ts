import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { RoutineLogDto } from './dto/routine-log.dto';

@Controller('routines')
export class RoutinesController {
  constructor(private readonly routinesService: RoutinesService) {}

  // Объявлен до остальных `@Get`: статический сегмент должен стоять раньше
  // любого `:param`-маршрута, иначе 'history' уедет в параметр.
  @Get('history')
  getHistory(@Query('weeks') weeks?: string, @Query('anchor') anchor?: string) {
    const parsed = weeks ? parseInt(weeks, 10) : NaN;
    return this.routinesService.getHistory(Number.isNaN(parsed) ? undefined : parsed, anchor);
  }

  @Get()
  getWeek(@Query('week') week?: string) {
    return this.routinesService.getWeek(week);
  }

  @Post()
  create(@Body() dto: CreateRoutineDto) {
    return this.routinesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoutineDto) {
    return this.routinesService.update(id, dto);
  }

  @Delete(':id')
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.routinesService.archive(id);
  }

  @Post(':id/log')
  setLog(@Param('id', ParseIntPipe) id: number, @Body() dto: RoutineLogDto) {
    return this.routinesService.setLog(id, dto.date, dto.count);
  }

  @Delete(':id/log/:date')
  removeLog(@Param('id', ParseIntPipe) id: number, @Param('date') date: string) {
    return this.routinesService.removeLog(id, date);
  }
}
