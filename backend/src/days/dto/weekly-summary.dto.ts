import { IsBase64, IsOptional, IsString, MaxLength } from 'class-validator';

export class WeeklySummaryDto {
  // ~1.4 МБ base64 ≈ 1 МБ PNG: с запасом на график 1600×800, но не даёт
  // залить в память что угодно.
  @IsOptional()
  @IsString()
  @MaxLength(1_400_000)
  @IsBase64()
  chartPng?: string;
}
