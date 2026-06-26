import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  sku: string = '';

  @IsNotEmpty()
  @IsString()
  name: string = '';

  @IsNotEmpty()
  @IsString()
  unit: string = '';

  @IsUUID()
  categoryId: string = '';

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  variants?: unknown[];
}

export class PatchUnitsPerCaseDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  unitsPerCase: number = 1;
}

export class ProductQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}
