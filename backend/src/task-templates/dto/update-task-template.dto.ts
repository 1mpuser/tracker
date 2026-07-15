import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTaskTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
