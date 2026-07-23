import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatDate, parseDateParam } from '../common/date.util';

export interface GtdItemView {
  id: number;
  title: string;
  notes: string | null;
  status: string;
  parentId: number | null;
  scheduledDate: string | null;
  plannedDate: string | null;
  dueDate: string | null;
  priority: boolean;
  waitingFor: string | null;
  order: number;
  completedAt: string | null;
}

const ACTIVE_EXCLUDED = ['done', 'archived'];

@Injectable()
export class GtdService {
  constructor(private prisma: PrismaService) {}

  private toView(item: any): GtdItemView {
    return {
      id: item.id,
      title: item.title,
      notes: item.notes,
      status: item.status,
      parentId: item.parentId,
      scheduledDate: item.scheduledDate ? formatDate(item.scheduledDate) : null,
      plannedDate: item.plannedDate ? formatDate(item.plannedDate) : null,
      dueDate: item.dueDate ? formatDate(item.dueDate) : null,
      priority: item.priority,
      waitingFor: item.waitingFor,
      order: item.order,
      completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    };
  }

  async create(title: string, parentId?: number) {
    const maxOrder = await this.prisma.gtdItem.aggregate({ _max: { order: true } });
    return this.prisma.gtdItem.create({
      data: { title, status: 'inbox', order: (maxOrder._max.order ?? -1) + 1, parentId },
    });
  }

  async getItems(status?: string): Promise<GtdItemView[]> {
    const where = status ? { status } : { status: { notIn: ACTIVE_EXCLUDED } };
    const items = await this.prisma.gtdItem.findMany({ where: where as any, orderBy: { order: 'asc' } });
    return items.map((i) => this.toView(i));
  }

  async update(
    id: number,
    patch: { title?: string; notes?: string; status?: string; scheduledDate?: string | null; waitingFor?: string | null; plannedDate?: string | null; dueDate?: string | null; priority?: boolean },
  ): Promise<GtdItemView> {
    const existing = await this.prisma.gtdItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`GtdItem ${id} not found`);
    }

    const data: any = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.waitingFor !== undefined) data.waitingFor = patch.waitingFor;
    if (patch.scheduledDate !== undefined) {
      data.scheduledDate = patch.scheduledDate ? parseDateParam(patch.scheduledDate) : null;
    }
    if (patch.plannedDate !== undefined) {
      data.plannedDate = patch.plannedDate ? parseDateParam(patch.plannedDate) : null;
    }
    if (patch.dueDate !== undefined) {
      data.dueDate = patch.dueDate ? parseDateParam(patch.dueDate) : null;
    }
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.status !== undefined) {
      data.status = patch.status;
      if (patch.status === 'done' && existing.status !== 'done') {
        data.completedAt = new Date();
      } else if (patch.status !== 'done' && existing.status === 'done') {
        data.completedAt = null;
      }
    }

    const updated = await this.prisma.gtdItem.update({ where: { id }, data });
    return this.toView(updated);
  }

  async remove(id: number): Promise<{ id: number }> {
    const existing = await this.prisma.gtdItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`GtdItem ${id} not found`);
    }
    await this.prisma.gtdItem.delete({ where: { id } });
    return { id };
  }

  async getForDate(dateStr: string): Promise<GtdItemView[]> {
    const date = parseDateParam(dateStr);
    const items = await this.prisma.gtdItem.findMany({
      where: {
        status: { not: 'archived' },
        OR: [{ plannedDate: date }, { status: 'calendar', scheduledDate: date }],
      } as any,
      orderBy: { order: 'asc' },
    });
    return items.map((i) => this.toView(i));
  }

  async createForDate(title: string, dateStr: string) {
    const date = parseDateParam(dateStr);
    const maxOrder = await this.prisma.gtdItem.aggregate({ _max: { order: true } });
    return this.prisma.gtdItem.create({
      data: { title, status: 'backlog', order: (maxOrder._max.order ?? -1) + 1, plannedDate: date },
    });
  }
}
