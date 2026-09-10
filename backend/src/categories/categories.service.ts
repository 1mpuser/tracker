import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  findActive(userId: number) {
    return this.prisma.category.findMany({
      where: { userId, archived: false },
      orderBy: { order: 'asc' },
    });
  }

  async create(userId: number, dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { userId_key: { userId, key: dto.key } },
    });
    if (existing) {
      throw new ConflictException(`Category with key "${dto.key}" already exists`);
    }
    const maxOrder = await this.prisma.category.aggregate({ where: { userId }, _max: { order: true } });
    return this.prisma.category.create({
      data: {
        userId,
        key: dto.key,
        label: dto.label,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  async update(userId: number, key: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (!existing) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
    return this.prisma.category.update({
      where: { userId_key: { userId, key } },
      data: dto,
    });
  }
}
