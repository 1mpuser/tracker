import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class UpdatePomodorosDto {
  @IsOptional()
  @IsInt()
  delta?: number;

  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}
