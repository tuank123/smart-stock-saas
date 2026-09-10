import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTransferDto {
  @IsUUID()
  fromBranchId: string = '';

  @IsUUID()
  toBranchId: string = '';

  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0.001)
  quantity: number = 0;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransferQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  // admin/tenants, products, stock, orders, ocr, reports ile aynı desen
  // ({items,total,page,pageSize}).
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
