import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportFrontendErrorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string = '';

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  componentStack?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  url: string = '';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;
}
