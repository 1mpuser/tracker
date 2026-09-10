import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  title: string;

  // Числовой id (-100…, -123, 123) или @username публичного канала.
  @IsString()
  @Matches(/^(-?\d+|@[A-Za-z0-9_]{5,})$/, { message: 'chatId: число или @username канала' })
  chatId: string;

  @IsOptional()
  @IsBoolean()
  daily?: boolean;

  @IsOptional()
  @IsBoolean()
  weekly?: boolean;
}
