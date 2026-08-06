import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AckJobDto {
  @IsBoolean()
  success = false;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}

export class InboundProductDto {
  @IsString()
  barcode = '';

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;
}

export class InboundSyncDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InboundProductDto)
  products: InboundProductDto[] = [];
}

export class HeartbeatDto {
  @IsOptional()
  @IsString()
  status?: string;
}
