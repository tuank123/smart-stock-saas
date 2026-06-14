import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSupplierDto {
  @IsNotEmpty()
  @IsString()
  name: string = '';

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsNotEmpty()
  @IsString()
  whatsappNumber: string = '';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LinkBranchSupplierDto {
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
