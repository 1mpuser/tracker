import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

const STATUSES = ['inbox', 'backlog', 'calendar', 'someday', 'waiting', 'project', 'reference', 'done', 'archived'];

export class UpdateGtdItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'scheduledDate must be YYYY-MM-DD' })
  scheduledDate?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'plannedDate must be YYYY-MM-DD' })
  plannedDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  waitingFor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string | null;

  @IsOptional()
  @IsBoolean()
  priority?: boolean;
}
