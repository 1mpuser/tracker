import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class UpdateDistractionDto {
  @IsOptional()
  @IsInt()
  delta?: number;

  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}
