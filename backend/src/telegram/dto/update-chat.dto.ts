import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateChatDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  title?: string;

  @IsOptional()
  @IsBoolean()
  daily?: boolean;

  @IsOptional()
  @IsBoolean()
  weekly?: boolean;
}
