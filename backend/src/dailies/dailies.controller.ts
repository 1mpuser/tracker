import { Body, Controller, Delete, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { DailiesService } from './dailies.service';
import { CreateDailyDto } from './dto/create-daily.dto';
import { UpdateDailyDto } from './dto/update-daily.dto';

@Controller()
export class DailiesController {
  constructor(private readonly dailiesService: DailiesService) {}

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
