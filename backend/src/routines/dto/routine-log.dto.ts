import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class RoutineLogDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  // Абсолютное число отметок за день. Точная верхняя граница зависит от
  // дневной нормы конкретной рутины и проверяется в сервисе.
  @IsInt()
  @Min(0)
  @Max(10)
  count: number;
}
