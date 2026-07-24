import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class StockItemDto {
  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0)
  quantity: number = 0;
}

export class InitializeStockDto {
  @IsUUID()
  branchId: string = '';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockItemDto)
  items: StockItemDto[] = [];
}

export class StockQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  critical?: boolean;
}

export class UpdateThresholdDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  minThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxThreshold?: number;
}

export class StockBarcodeQueryDto {
  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class MovementQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsDateString()
  since?: string;
}

export class WasteStockDto {
  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0.001)
  quantity: number = 0;

  @IsString()
  @IsNotEmpty()
  reason: string = '';

  @IsString()
  @IsNotEmpty()
  photoBase64: string = '';
}

export class SaleItemDto {
  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0.001)
  quantity: number = 0;
}

export class RecordSaleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[] = [];

  @IsIn(['CASH', 'CARD'])
  paymentMethod: string = 'CASH';

  @IsOptional()
  @IsString()
  customerPhone?: string;
}

export class PriceChangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;
}
