import { IsOptional, IsString } from 'class-validator';

/**
 * Refresh endpoint body. Web clients send `{}` (refresh token comes from the
 * HttpOnly cookie); native (Capacitor) clients — which can't rely on the
 * cross-origin cookie — send the token explicitly here.
 */
export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
