import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateDebtDto {
  @IsUUID()
  supplierId!: string;

  // 'PAYABLE' = işletme borçlu, 'RECEIVABLE' = tedarikçi borçlu.
  @IsIn(['PAYABLE', 'RECEIVABLE'])
  direction!: 'PAYABLE' | 'RECEIVABLE';

  // 'CASH' = nakit borç (amount zorunlu) | 'PRODUCT' = ürün borcu (productDescription zorunlu).
  @IsIn(['CASH', 'PRODUCT'])
  debtType!: 'CASH' | 'PRODUCT';

  // debtType='CASH' ise zorunlu (serviste kontrol edilir).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  // debtType='PRODUCT' ise zorunlu (serviste kontrol edilir).
  @IsOptional()
  @IsString()
  productDescription?: string;

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
  @IsIn(['OPEN', 'PAID'])
  status?: 'OPEN' | 'PAID';

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
