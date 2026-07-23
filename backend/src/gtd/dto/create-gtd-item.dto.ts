import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateGtdItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsInt()
  parentId?: number;
}
