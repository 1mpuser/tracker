import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  findActive() {
    return this.prisma.category.findMany({
      where: { archived: false },
      orderBy: { order: 'asc' },
    });
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`Category with key "${dto.key}" already exists`);
    }
    const maxOrder = await this.prisma.category.aggregate({ _max: { order: true } });
    return this.prisma.category.create({
      data: {
        key: dto.key,
        label: dto.label,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  async update(key: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { key } });
    if (!existing) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
    return this.prisma.category.update({
      where: { key },
      data: dto,
    });
  }
}
