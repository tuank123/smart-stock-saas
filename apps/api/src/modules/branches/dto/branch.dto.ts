import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateBranchDto {
  @IsNotEmpty()
  @IsString()
  name: string = '';

  @IsNotEmpty()
  @IsString()
  slug: string = '';

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class CreateIntegrationDto {
  @IsNotEmpty()
  @IsString()
  adapterType: string = '';

  @IsOptional()
  @IsString()
  webserviceUrl?: string;

  @IsNotEmpty()
  @IsString()
  apiKey: string = '';

  @IsOptional()
  @IsInt()
  @Min(1)
  pollingIntervalSec?: number;
}

// Kısmi güncelleme: tüm alanlar opsiyonel — sadece değişenler gönderilir.
export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  adapterType?: string;

  @IsOptional()
  @IsString()
  webserviceUrl?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pollingIntervalSec?: number;
}
