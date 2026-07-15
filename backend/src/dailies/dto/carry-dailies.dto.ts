import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class CarryDailiesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];
}
