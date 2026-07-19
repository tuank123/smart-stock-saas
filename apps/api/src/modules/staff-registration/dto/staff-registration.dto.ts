import { IsEmail, IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';

// Body-less — the branch is taken from the authenticated SUBE_MUDURU.
export class GenerateCodeDto {}

export class CompleteRegistrationDto {
  @IsNotEmpty()
  @IsString()
  token: string = '';

  @IsNotEmpty()
  @IsString()
  name: string = '';

  @IsEmail()
  email: string = '';

  @IsString()
  @MinLength(8)
  password: string = '';
}

export class AssignRoleDto {
  @IsIn(['KASIYER', 'DEPO'])
  role: 'KASIYER' | 'DEPO' = 'KASIYER';
}
