import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

// En az 8 karakter, 1 büyük harf, 1 rakam.
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
const PASSWORD_MESSAGE = 'Şifre en az 8 karakter, 1 büyük harf ve 1 rakam içermelidir.';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}
