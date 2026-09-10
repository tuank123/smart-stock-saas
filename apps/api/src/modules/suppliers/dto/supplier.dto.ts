import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SupplierQueryDto {
  // admin/tenants, products, stock, orders, ocr, reports, transfers ile aynı
  // desen ({items,total,page,pageSize}).
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

export class CreateSupplierDto {
  @IsNotEmpty()
  @IsString()
  name: string = '';

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsNotEmpty()
  @IsString()
  whatsappNumber: string = '';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LinkBranchSupplierDto {
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
