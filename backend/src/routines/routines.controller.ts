import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { RoutineLogDto } from './dto/routine-log.dto';

@Controller('routines')
export class RoutinesController {
  constructor(private readonly routinesService: RoutinesService) {}

  // Объявлен до `:id`-маршрутов: иначе 'history' уедет в параметр.
  @Get('history')
  getHistory(@Query('weeks') weeks?: string) {
    return this.routinesService.getHistory(weeks ? Number(weeks) : undefined);
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
  addLog(@Param('id', ParseIntPipe) id: number, @Body() dto: RoutineLogDto) {
    return this.routinesService.addLog(id, dto.date);
  }

  @Delete(':id/log/:date')
  removeLog(@Param('id', ParseIntPipe) id: number, @Param('date') date: string) {
    return this.routinesService.removeLog(id, date);
  }
}
