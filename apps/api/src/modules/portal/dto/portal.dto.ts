import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^\+90\d{10}$/, { message: 'Phone +90 ile başlamalı ve 13 karakter olmalı' })
  phone: string = '';
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+90\d{10}$/, { message: 'Phone +90 ile başlamalı' })
  phone: string = '';

  @IsString()
  otp: string = '';
}

export class UploadDto {
  @IsString()
  @Matches(/^\+90\d{10}$/, { message: 'Phone +90 ile başlamalı' })
  phone: string = '';

  @IsString()
  sessionToken: string = '';

  @IsOptional()
  @IsString()
  pdfBase64?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;
}

export class PriceItemDto {
  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0)
  newPrice: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;
}

export class UpdatePriceItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceItemDto)
  items: PriceItemDto[] = [];
}
