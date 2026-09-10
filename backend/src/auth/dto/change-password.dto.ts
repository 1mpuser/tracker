import { IsString, Length } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @Length(8, 128)
  current: string;

  @IsString()
  @Length(8, 128)
  next: string;
}
