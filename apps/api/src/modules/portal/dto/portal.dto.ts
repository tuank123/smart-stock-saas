import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^\+90\d{10}$/, { message: 'Phone +90 ile başlamalı ve 13 karakter olmalı' })
  phone: string = '';
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+90\d{10}$/, { message: 'Phone +90 ile başlamalı' })
  phone: string = '';

  @IsString()
  otp: string = '';
}

export class UploadDto {
  @IsString()
  @Matches(/^\+90\d{10}$/, { message: 'Phone +90 ile başlamalı' })
  phone: string = '';

  @IsString()
  sessionToken: string = '';

  @IsOptional()
  @IsString()
  pdfBase64?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;
}
