import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { TaskTemplatesService } from './task-templates.service';
import { CreateTaskTemplateDto } from './dto/create-task-template.dto';
import { UpdateTaskTemplateDto } from './dto/update-task-template.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';

@Controller('task-templates')
export class TaskTemplatesController {
  constructor(private readonly taskTemplatesService: TaskTemplatesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.taskTemplatesService.findAll(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskTemplateDto) {
    return this.taskTemplatesService.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTaskTemplateDto) {
    return this.taskTemplatesService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.taskTemplatesService.remove(user.id, id);
  }
}
