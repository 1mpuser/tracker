import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

export class ResetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  @IsString()
  @Length(8, 128)
  password: string;
}
