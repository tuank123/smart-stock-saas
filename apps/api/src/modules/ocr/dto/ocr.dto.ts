import { IsArray, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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

  // Eksik ürün notu — doluysa "eksik var" demektir.
  @IsOptional()
  @IsString()
  missingItemsNote?: string;
}
