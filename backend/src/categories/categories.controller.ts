import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findActive(@CurrentUser() user: AuthUser) {
    return this.categoriesService.findActive(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(user.id, dto);
  }

  @Patch(':key')
  update(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(user.id, key, dto);
  }
}
