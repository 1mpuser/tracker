import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatDate } from '../common/date.util';

export interface GtdItemView {
  id: number;
  title: string;
  notes: string | null;
  status: string;
  parentId: number | null;
  scheduledDate: string | null;
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
}
