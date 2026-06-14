import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateTransferDto {
  @IsUUID()
  fromBranchId: string = '';

  @IsUUID()
  toBranchId: string = '';

  @IsUUID()
  productId: string = '';

  @IsNumber()
  @Min(0.001)
  quantity: number = 0;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransferQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}
