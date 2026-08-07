import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListTenantsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number;

  // true → test hesapları da listeye dahil (varsayılan: gizli).
  @IsOptional()
  @Type(() => Boolean)
  includeTest?: boolean;
}

export class UpdateTenantStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'DELETED'])
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED' = 'ACTIVE';
}

export class ListErrorsQueryDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  // 'true' | 'false' — verilmezse tümü. Serviste parse edilir (boolean coercion tuzağını önle).
  @IsOptional()
  @IsString()
  resolved?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number;
}
