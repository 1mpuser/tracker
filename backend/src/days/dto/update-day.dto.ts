import { IsBoolean } from 'class-validator';

export class UpdateDayDto {
  @IsBoolean()
  eveningClosed: boolean;
}
