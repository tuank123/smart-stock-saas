import {
  IsArray,
  IsBase64,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
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

// Base64 metin uzunluğu üst sınırı. AYRI/İKİNCİ bir limit DEĞİL — main.ts'teki
// global 10 MiB gövde limitinden (bodyParser.json({limit:'10mb'})) türetildi:
// 10.000.000 karakterlik base64 ≈ 7.500.000 ham bayt (~7,15 MiB); JSON zarfıyla
// birlikte gövde ~9,54 MiB olur, yani parser'ın 10 MiB tavanının ~0,46 MiB
// altında kalır. Böylece sınırdaki bir istek parser'a takılıp 413 vermek yerine
// buradan anlaşılır bir 400 doğrulama hatası döner; daha büyüğü zaten parser'da
// 413 olur. Frontend'in ürettiği tipik boyut ~200-540 KB (bkz. OcrScanFlow
// resizeAndEncode: 1200px, JPEG q0.8), yani gerçek kullanımda bu tavana
// yaklaşılmıyor.
const IMAGE_BASE64_MAX_LENGTH = 10_000_000;

export class ScanDto {
  @IsUUID()
  branchId: string = '';

  // Görsel opsiyonel (görselsiz tarama kaydı oluşturulabilir — mevcut davranış
  // korunuyor). Gönderildiyse: gerçekten base64 olmalı ve boyut sınırını
  // aşmamalı. İçeriğin GERÇEKTEN görsel olduğu (JPEG/PNG imzası) ayrıca
  // ocr.service.ts'te sihirli bayt kontrolüyle doğrulanıyor — format imzası
  // class-validator ile ifade edilemiyor.
  @IsOptional()
  @IsBase64()
  @MaxLength(IMAGE_BASE64_MAX_LENGTH)
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
