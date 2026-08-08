import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

// En az 8 karakter, 1 büyük harf, 1 rakam.
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
const PASSWORD_MESSAGE = 'Şifre en az 8 karakter, 1 büyük harf ve 1 rakam içermelidir.';

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
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string = '';
}
