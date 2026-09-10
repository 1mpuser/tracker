import { IsString, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsString()
  @MaxLength(64)
  timezone: string;
}
