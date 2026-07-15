import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { DailiesService } from './dailies.service';
import { CreateDailyDto } from './dto/create-daily.dto';
import { UpdateDailyDto } from './dto/update-daily.dto';

@Controller()
export class DailiesController {
  constructor(private readonly dailiesService: DailiesService) {}

  @Get('days/:date/carry-candidates')
  getCarryCandidates(@Param('date') date: string, @Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 3;
    return this.dailiesService.getCarryCandidates(date, Number.isNaN(parsed) ? 3 : parsed);
  }

  @Post('days/:date/dailies')
  create(@Param('date') date: string, @Body() dto: CreateDailyDto) {
    return this.dailiesService.create(date, dto.text);
  }

  @Patch('dailies/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDailyDto) {
    return this.dailiesService.update(id, dto);
  }

  @Delete('dailies/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.dailiesService.remove(id);
  }
}
