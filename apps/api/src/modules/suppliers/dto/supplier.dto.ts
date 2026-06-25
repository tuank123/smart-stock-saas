import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
