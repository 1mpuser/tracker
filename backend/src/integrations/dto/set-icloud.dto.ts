import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class SetICloudDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  appleId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  appPassword: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  remindersList?: string;
}
