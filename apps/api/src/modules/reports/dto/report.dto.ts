import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class GenerateDailyReportDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class GenerateMonthlyReportDto {
  @IsInt()
  @Min(2020)
  year: number = new Date().getFullYear();

  @IsInt()
  @Min(1)
  @Max(12)
  month: number = new Date().getMonth() + 1;
}

export class ReportQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;

  // admin/tenants, products, stock ve orders ile aynı desen ({items,total,page,pageSize}).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number;
}
