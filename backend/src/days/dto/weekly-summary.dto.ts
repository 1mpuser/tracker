import { IsBase64, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class WeeklySummaryDto {
  // ~1.4 МБ base64 ≈ 1 МБ PNG: с запасом на график 1600×800, но не даёт
  // залить в память что угодно.
  //
  // @IsBase64 проверяет только алфавит строки — "AAAA" тоже валиден для неё.
  // Сигнатура PNG-файла (8 байт 89 50 4E 47 0D 0A 1A 0A) в base64 всегда
  // даёт фиксированный префикс "iVBORw0KGgo", поэтому его проверка отсекает
  // произвольный base64, который не является PNG.
  @IsOptional()
  @IsString()
  @MaxLength(1_400_000)
  @IsBase64()
  @Matches(/^iVBORw0KGgo/, { message: 'chartPng must be a base64 PNG' })
  chartPng?: string;
}
