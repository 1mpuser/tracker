import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DaysService } from '../days/days.service';

@Injectable()
export class DailiesService {
  constructor(
    private prisma: PrismaService,
    private daysService: DaysService,
  ) {}

  async create(dateStr: string, text: string) {
    const dayId = await this.daysService.getOrCreateDayId(dateStr);
    const maxOrder = await this.prisma.dailyTask.aggregate({
      where: { dayId },
      _max: { order: true },
    });
    return this.prisma.dailyTask.create({
      data: { dayId, text, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  async update(id: number, data: { done?: boolean; text?: string }) {
    const existing = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Daily task ${id} not found`);
    }
    return this.prisma.dailyTask.update({ where: { id }, data });
  }

  async remove(id: number) {
    const existing = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Daily task ${id} not found`);
    }
    await this.prisma.dailyTask.delete({ where: { id } });
    return { id };
  }
}
