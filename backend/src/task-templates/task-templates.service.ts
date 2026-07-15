import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskTemplateDto } from './dto/create-task-template.dto';
import { UpdateTaskTemplateDto } from './dto/update-task-template.dto';

@Injectable()
export class TaskTemplatesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.taskTemplate.findMany({ orderBy: { order: 'asc' } });
  }

  async create(dto: CreateTaskTemplateDto) {
    const maxOrder = await this.prisma.taskTemplate.aggregate({ _max: { order: true } });
    return this.prisma.taskTemplate.create({
      data: { text: dto.text, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  async update(id: number, dto: UpdateTaskTemplateDto) {
    const existing = await this.prisma.taskTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Task template ${id} not found`);
    }
    return this.prisma.taskTemplate.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const existing = await this.prisma.taskTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Task template ${id} not found`);
    }
    await this.prisma.taskTemplate.delete({ where: { id } });
    return { id };
  }
}
