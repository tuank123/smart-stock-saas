import { IsString, Matches } from 'class-validator';

export class VerifyTwoFaDto {
  @IsString()
  tempToken: string = '';

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Kod 6 haneli bir sayı olmalıdır' })
  code: string = '';
}
