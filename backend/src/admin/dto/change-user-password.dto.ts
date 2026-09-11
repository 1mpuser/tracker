import { IsString, Length } from 'class-validator';

export class ChangeUserPasswordDto {
  @IsString()
  @Length(8, 128)
  password: string;
}
