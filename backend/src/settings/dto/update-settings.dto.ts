import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  youtubeBudget?: number;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}
