import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;
}

export class SignupDto {
  @IsNotEmpty()
  @IsString()
  companyName: string = '';

  @IsNotEmpty()
  @IsString()
  taxNumber: string = '';

  // Tek şubeli işletme → STARTER, çok şubeli → PROFESSIONAL (serviste map'lenir).
  @IsIn(['TEK_SUBE', 'COK_SUBE'])
  businessType: 'TEK_SUBE' | 'COK_SUBE' = 'TEK_SUBE';

  @IsNotEmpty()
  @IsString()
  branchName: string = '';

  @IsNotEmpty()
  @IsString()
  fullName: string = '';

  @IsEmail()
  email: string = '';

  @IsString()
  @MinLength(8)
  password: string = '';
}
