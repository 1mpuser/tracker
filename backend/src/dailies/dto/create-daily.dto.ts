import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDailyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text: string;
}
