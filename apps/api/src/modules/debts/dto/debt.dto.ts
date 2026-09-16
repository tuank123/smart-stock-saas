import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDebtLineDto {
  @IsUUID()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;
}

export class CreateDebtDto {
  @IsUUID()
  supplierId!: string;

  // 'PAYABLE' = işletme borçlu, 'RECEIVABLE' = tedarikçi borçlu.
  @IsIn(['PAYABLE', 'RECEIVABLE'])
  direction!: 'PAYABLE' | 'RECEIVABLE';

  // 'CASH' = nakit borç (amount zorunlu) | 'PRODUCT' = ürün borcu (productLines zorunlu).
  @IsIn(['CASH', 'PRODUCT'])
  debtType!: 'CASH' | 'PRODUCT';

  // debtType='CASH' ise zorunlu (serviste kontrol edilir).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  // debtType='PRODUCT' ise zorunlu (serviste kontrol edilir).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDebtLineDto)
  productLines?: CreateDebtLineDto[];

  // ISO tarih string'i (opsiyonel vade tarihi).
  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDebtDto {
  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordCashPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

export class ProductReceiptLineDto {
  @IsUUID()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  receivedQuantity!: number;
}

export class RecordProductReceiptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductReceiptLineDto)
  lines!: ProductReceiptLineDto[];
}
