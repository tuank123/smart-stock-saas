import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0.001)
  quantityOrdered: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderDto {
  @IsUUID()
  branchId: string = '';

  @IsUUID()
  supplierId: string = '';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[] = [];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class OrderQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

export class CheckThresholdsDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class UpdateOrderItemDto {
  @IsNumber()
  @Min(0.001)
  quantityOrdered: number = 0;
}

class PatchOrderItemDto {
  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity: number = 0;
}

export class PatchOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatchOrderItemDto)
  items!: PatchOrderItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReceiveItemDto {
  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0.001)
  quantityReceived: number = 0;
}

export class ReceiveOrderDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items?: ReceiveItemDto[];
}
