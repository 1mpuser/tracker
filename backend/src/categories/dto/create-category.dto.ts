import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Matches(/^[a-z0-9_-]+$/, { message: 'key must be lowercase letters, digits, - or _' })
  @MaxLength(40)
  key: string;

  @IsString()
  @MaxLength(80)
  label: string;
}
