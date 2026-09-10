import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SetSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  calendarName: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  minMinutes?: number;
}
