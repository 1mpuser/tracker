import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;
}
