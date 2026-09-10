import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetBotTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;
}
