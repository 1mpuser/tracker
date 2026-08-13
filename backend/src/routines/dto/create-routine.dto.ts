import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateRoutineDto {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  timesPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek?: number;

  @IsOptional()
  @IsInt()
  categoryId?: number | null;
}
