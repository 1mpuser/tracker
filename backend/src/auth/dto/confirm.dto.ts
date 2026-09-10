import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

// Принимает два варианта тела: { token } (ссылка из письма) или { email, code }.
// Валидация «ровно один из вариантов» — в контроллере по наличию token.
export class ConfirmDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  token?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Код — ровно 6 цифр' })
  code?: string;
}
