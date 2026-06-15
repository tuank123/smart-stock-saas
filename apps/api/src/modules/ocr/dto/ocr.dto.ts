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
}
