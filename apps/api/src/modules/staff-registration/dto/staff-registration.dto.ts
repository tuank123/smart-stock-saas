import { IsEmail, IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class RequestRegistrationDto {
  @IsNotEmpty()
  @IsString()
  applicantName: string = '';

  @IsEmail()
  applicantEmail: string = '';

  @IsNotEmpty()
  @IsString()
  password: string = '';

  @IsNotEmpty()
  @IsString()
  companyName: string = '';

  @IsUUID()
  branchId: string = '';
}

export class VerifyTokenDto {
  @IsNotEmpty()
  @IsString()
  token: string = '';
}

export class AssignRoleDto {
  @IsIn(['KASIYER', 'DEPO'])
  role: 'KASIYER' | 'DEPO' = 'KASIYER';
}
