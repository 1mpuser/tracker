import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateRoutineDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weeklyGoal?: number;

  @IsOptional()
  @IsInt()
  categoryId?: number | null;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
