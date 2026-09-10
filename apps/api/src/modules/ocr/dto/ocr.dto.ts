import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScanQueryDto {
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

export class ScanDto {
  @IsUUID()
  branchId: string = '';

  @IsOptional()
  @IsString()
  imageBase64?: string;
}

export class ConfirmLineDto {
  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0.001)
  qty: number = 0;

  @IsString()
  unit: string = '';
}

export class DeliveredLineDto {
  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0)
  receivedQty: number = 0;
}

export class ConfirmScanDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmLineDto)
  lines: ConfirmLineDto[] = [];

  // Faturanın hangi tedarikçiden geldiği (borç kaydı için zorunlu).
  @IsUUID()
  supplierId: string = '';

  // Fatura tutarı (manuel giriş).
  @IsOptional()
  @IsNumber()
  invoiceTotal?: number;

  // Ödenen tutar (manuel giriş).
  @IsOptional()
  @IsNumber()
  paidAmount?: number;

  // Faturadaki tüm ürünler teslim alındı mı?
  @IsBoolean()
  allItemsReceived = true;

  // allItemsReceived===false iken her ürün için gerçekten teslim alınan miktar.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveredLineDto)
  deliveredLines?: DeliveredLineDto[];
}

// ── İade Faturası ───────────────────────────────────────────────────────────

export class ReturnLineDto {
  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0.001)
  qty: number = 0;

  @IsString()
  unit: string = '';
}

export class ConfirmReturnDto {
  @IsUUID()
  supplierId: string = '';

  @IsDateString()
  invoiceDate: string = '';

  @IsNumber()
  @Min(0.01)
  returnTotal: number = 0;

  // 'CASH' = nakit iade | 'PRODUCT' = ürünle iade.
  @IsIn(['CASH', 'PRODUCT'])
  settlementType: 'CASH' | 'PRODUCT' = 'CASH';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines: ReturnLineDto[] = [];
}
