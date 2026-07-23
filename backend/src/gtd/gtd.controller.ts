import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { GtdService } from './gtd.service';
import { CreateGtdItemDto } from './dto/create-gtd-item.dto';

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
}
