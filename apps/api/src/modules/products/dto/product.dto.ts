import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
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

  // admin/tenants ve admin/errors ile aynı desen ({items,total,page,pageSize}).
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

// GET /products/suggest — her zaman fuzzy çalışan öneri listesi.
export class ProductSuggestQueryDto {
  // Boş/eksik bırakılabilir: o durumda alfabetik ilk `limit` ürün döner
  // (dropdown daha hiçbir şey yazılmadan açıldığında gösterilecek liste).
  @IsOptional()
  @IsString()
  query?: string;

  // Varsayılan 3 ("ilk açılışta en iyi 3 öneri"); kullanıcı yazmaya
  // başlayınca ön yüz daha fazlasını isteyebilsin diye 20'ye kadar açık.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  limit?: number;
}
