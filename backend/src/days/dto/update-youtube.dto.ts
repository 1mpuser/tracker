import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class UpdateYoutubeDto {
  @IsOptional()
  @IsInt()
  delta?: number;

  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}
