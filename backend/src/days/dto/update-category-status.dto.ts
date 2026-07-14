import { IsBoolean } from 'class-validator';

export class UpdateCategoryStatusDto {
  @IsBoolean()
  done: boolean;
}
