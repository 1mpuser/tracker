import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  // Почта — это и логин: нормализуем при входе, как в LoginDto.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
