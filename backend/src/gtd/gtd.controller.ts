import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { GtdService } from './gtd.service';
import { CreateGtdItemDto } from './dto/create-gtd-item.dto';
import { UpdateGtdItemDto } from './dto/update-gtd-item.dto';
import { CreateTodayDto } from './dto/create-today-dto';

@Controller('gtd')
export class GtdController {
  constructor(private readonly gtdService: GtdService) {}

  @Get('items')
  getItems(@Query('status') status?: string) {
    return this.gtdService.getItems(status);
  }

  @Post('items')
  create(@Body() dto: CreateGtdItemDto) {
    return this.gtdService.create(dto.title, dto.parentId);
  }

  @Post('items/today')
  createForDate(@Body() dto: CreateTodayDto) {
    return this.gtdService.createForDate(dto.title, dto.date);
  }

  @Patch('items/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGtdItemDto) {
    return this.gtdService.update(id, dto);
  }

  @Delete('items/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.gtdService.remove(id);
  }
}
